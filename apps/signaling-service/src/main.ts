import { config } from "dotenv";
import Fastify from "fastify";
import jwt from "jsonwebtoken";
import { RawData, WebSocket, WebSocketServer } from "ws";
import { z } from "zod";

config();

const app = Fastify({ logger: true });

const SignalPayloadSchema = z.object({
  event: z.enum([
    "webrtc.offer",
    "webrtc.answer",
    "webrtc.ice",
    "session.connected",
    "session.heartbeat",
    "session.terminate",
    "billing.update",
    "match.proposed",
    "match.accepted",
    "match.rejected",
  ]),
  payload: z.unknown().optional(),
  toUserId: z.string().uuid().optional(),
});

type SocketContext = {
  sessionId: string;
  userId: string;
};

const sessions = new Map<string, Map<string, WebSocket>>();
const socketContext = new WeakMap<WebSocket, SocketContext>();

const wss = new WebSocketServer({ noServer: true });

function addConnection(sessionId: string, userId: string, ws: WebSocket): void {
  const participantMap = sessions.get(sessionId) ?? new Map<string, WebSocket>();
  participantMap.set(userId, ws);
  sessions.set(sessionId, participantMap);
  socketContext.set(ws, { sessionId, userId });
}

function removeConnection(ws: WebSocket): void {
  const context = socketContext.get(ws);
  if (!context) {
    return;
  }

  const participantMap = sessions.get(context.sessionId);
  if (!participantMap) {
    return;
  }

  participantMap.delete(context.userId);
  if (participantMap.size === 0) {
    sessions.delete(context.sessionId);
  }
}

function forwardSignal(senderWs: WebSocket, rawData: RawData): void {
  const sender = socketContext.get(senderWs);
  if (!sender) {
    return;
  }

  const parsedJson = (() => {
    try {
      return JSON.parse(rawData.toString());
    } catch {
      return null;
    }
  })();

  const parsed = SignalPayloadSchema.safeParse(parsedJson);
  if (!parsed.success) {
    senderWs.send(JSON.stringify({ error: "invalid_payload", details: parsed.error.flatten() }));
    return;
  }

  const sessionUsers = sessions.get(sender.sessionId);
  if (!sessionUsers) {
    return;
  }

  const message = JSON.stringify({
    fromUserId: sender.userId,
    event: parsed.data.event,
    payload: parsed.data.payload ?? null,
    at: new Date().toISOString(),
  });

  if (parsed.data.toUserId) {
    const recipient = sessionUsers.get(parsed.data.toUserId);
    if (recipient && recipient.readyState === WebSocket.OPEN) {
      recipient.send(message);
    }
    return;
  }

  for (const [userId, ws] of sessionUsers) {
    if (userId === sender.userId) {
      continue;
    }
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  }
}

async function bootstrap(): Promise<void> {
  app.get("/health", async () => ({
    ok: true,
    service: "signaling-service",
    activeSessions: sessions.size,
  }));

  app.server.on("upgrade", (request: any, socket: any, head: any) => {
    const host = request.headers.host ?? "localhost";
    const parsedUrl = new URL(request.url ?? "", `http://${host}`);

    if (parsedUrl.pathname !== "/ws") {
      socket.destroy();
      return;
    }

    const sessionId = parsedUrl.searchParams.get("sessionId");
    const userId = parsedUrl.searchParams.get("userId");
    const token = parsedUrl.searchParams.get("token");

    if (!sessionId || !userId || !token) {
      socket.destroy();
      return;
    }

    try {
      jwt.verify(token, process.env.JWT_SECRET ?? "dev-secret");
    } catch {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      addConnection(sessionId, userId, ws);
      wss.emit("connection", ws);
    });
  });

  wss.on("connection", (ws) => {
    const context = socketContext.get(ws);

    ws.send(
      JSON.stringify({
        event: "session.connected",
        payload: {
          sessionId: context?.sessionId,
          userId: context?.userId,
        },
      }),
    );

    ws.on("message", (data) => {
      forwardSignal(ws, data);
    });

    ws.on("close", () => {
      const closed = socketContext.get(ws);
      removeConnection(ws);

      if (!closed) {
        return;
      }

      const remaining = sessions.get(closed.sessionId);
      if (!remaining) {
        return;
      }

      const message = JSON.stringify({
        fromUserId: closed.userId,
        event: "session.terminate",
        payload: { reason: "peer_disconnected" },
      });

      for (const peer of remaining.values()) {
        if (peer.readyState === WebSocket.OPEN) {
          peer.send(message);
        }
      }
    });
  });

  const port = Number(process.env.PORT ?? 4003);
  await app.listen({ host: "0.0.0.0", port });
}

bootstrap().catch((error) => {
  app.log.error(error);
  process.exit(1);
});
