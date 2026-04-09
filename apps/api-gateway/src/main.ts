import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import { config } from "dotenv";
import Fastify from "fastify";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

config();

const app = Fastify({ logger: true });

type UserRole = "male" | "female" | "admin";

type JwtClaims = {
  sub: string;
  role: UserRole;
};

type ProxyOptions = {
  roles?: UserRole[];
  requireOwnerParam?: string;
  proxyPath?: string;
};

const AuthTokenRequestSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["male", "female", "admin"]),
});

const serviceEndpoints = {
  matching: process.env.MATCHING_SERVICE_URL ?? "http://localhost:4001",
  billing: process.env.BILLING_SERVICE_URL ?? "http://localhost:4002",
  payments: process.env.PAYMENTS_SERVICE_URL ?? "http://localhost:4004",
  verification: process.env.VERIFICATION_SERVICE_URL ?? "http://localhost:4005",
  moderation: process.env.MODERATION_SERVICE_URL ?? "http://localhost:4006",
};

const PUBLIC_PATHS = new Set(["/v1/auth/token", "/v1/config/public", "/v1/apis", "/health"]);

const NO_AUTH_EXACT_PATHS = new Set(["/v1/payments/webhooks/razorpay"]);

function getRequestPath(request: FastifyRequest): string {
  return new URL(request.raw.url ?? "/", "http://localhost").pathname;
}

function requestClaims(request: FastifyRequest): JwtClaims {
  return request.user as JwtClaims;
}

function assertRoles(request: FastifyRequest, reply: FastifyReply, roles?: UserRole[]): boolean {
  if (!roles || roles.length === 0) {
    return true;
  }

  const claims = requestClaims(request);
  if (roles.includes(claims.role)) {
    return true;
  }

  void reply.code(403).send({ error: "forbidden", requiredRoles: roles });
  return false;
}

function assertOwnership(
  request: FastifyRequest,
  reply: FastifyReply,
  requireOwnerParam?: string,
): boolean {
  if (!requireOwnerParam) {
    return true;
  }

  const claims = requestClaims(request);
  if (claims.role === "admin") {
    return true;
  }

  const params = (request.params ?? {}) as Record<string, string | undefined>;
  const ownerValue = params[requireOwnerParam];
  if (!ownerValue || ownerValue !== claims.sub) {
    void reply.code(403).send({ error: "forbidden_owner_mismatch" });
    return false;
  }

  return true;
}

async function proxyToService(
  request: FastifyRequest,
  reply: FastifyReply,
  serviceBase: string,
  options: ProxyOptions = {},
): Promise<void> {
  if (!assertRoles(request, reply, options.roles)) {
    return;
  }

  if (!assertOwnership(request, reply, options.requireOwnerParam)) {
    return;
  }

  const requestUrl = new URL(request.raw.url ?? "/", "http://localhost");
  const upstreamPath = options.proxyPath ?? requestUrl.pathname;
  const upstreamUrl = new URL(upstreamPath + requestUrl.search, serviceBase);

  const jwtUser = request.user as JwtClaims | undefined;
  const forwardHeaders: Record<string, string> = {
    "content-type": "application/json",
  };

  if (jwtUser) {
    forwardHeaders["x-auth-user-id"] = jwtUser.sub;
    forwardHeaders["x-auth-role"] = jwtUser.role;
  }

  const response = await fetch(upstreamUrl, {
    method: request.method,
    headers: forwardHeaders,
    body: request.method === "GET" ? undefined : JSON.stringify(request.body ?? {}),
  });

  const contentType = response.headers.get("content-type") ?? "application/json";
  const responseText = await response.text();
  let payload: unknown = responseText;

  if (contentType.includes("application/json")) {
    try {
      payload = responseText ? JSON.parse(responseText) : {};
    } catch {
      payload = { error: "invalid_json_response", raw: responseText };
    }
  }

  return reply.code(response.status).type(contentType).send(payload);
}

async function bootstrap(): Promise<void> {
  await app.register(cors, { origin: true });
  await app.register(jwt, {
    secret: process.env.JWT_SECRET ?? "dev-secret",
    sign: {
      expiresIn: "7d",
    },
  });

  app.get("/health", async () => ({ ok: true, service: "api-gateway" }));

  app.addHook("onRequest", async (request, reply) => {
    const path = getRequestPath(request);
    if (PUBLIC_PATHS.has(path) || NO_AUTH_EXACT_PATHS.has(path)) {
      return;
    }

    if (!path.startsWith("/v1/")) {
      return;
    }

    try {
      await request.jwtVerify();
    } catch {
      return reply.code(401).send({ error: "unauthorized" });
    }
  });

  app.get("/v1/config/public", async () => ({
    billing: {
      ratePerMinutePaise: Number(process.env.PAID_RATE_PER_MINUTE_PAISE ?? "1000"),
      tickSeconds: Number(process.env.BILLING_TICK_SECONDS ?? "1"),
    },
    webrtc: {
      stunUrl: process.env.STUN_URL ?? "stun:stun.l.google.com:19302",
      turnUrl: process.env.TURN_URL ?? "turn:coturn:3478",
      turnUsername: process.env.TURN_USERNAME ?? "",
      turnPassword: process.env.TURN_PASSWORD ?? "",
    },
    signaling: {
      wsUrl: process.env.SIGNALING_WS_URL ?? "ws://localhost:4003/ws",
    },
  }));

  app.post("/v1/auth/token", async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = AuthTokenRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const token = await reply.jwtSign({
      sub: parsed.data.userId,
      role: parsed.data.role,
    });

    return { token };
  });

  app.get("/v1/apis", async () => ({
    rest: [
      "POST /v1/auth/token",
      "GET /v1/config/public",
      "POST /v1/match/join (matching-service)",
      "GET /v1/female/offers/:femaleUserId (matching-service)",
      "POST /v1/sessions/start (billing-service)",
      "POST /v1/wallet/topup (billing-service)",
      "POST /v1/payouts/request (billing-service)",
      "POST /v1/payments/orders (payments-service)",
      "POST /v1/payments/webhooks/razorpay (payments-service)",
      "POST /v1/verification/selfie (verification-service)",
      "POST /v1/verification/live-check (verification-service)",
      "POST /v1/reports (moderation-service)",
      "POST /v1/fraud/signal (moderation-service)",
    ],
    websocket: ["GET /ws?sessionId=<uuid>&userId=<uuid>&token=<jwt> (signaling-service)"],
  }));

  app.post("/v1/female/available", async (request, reply) =>
    proxyToService(request, reply, serviceEndpoints.matching, { roles: ["female", "admin"] }),
  );
  app.get("/v1/female/offers/:femaleUserId", async (request, reply) =>
    proxyToService(request, reply, serviceEndpoints.matching, {
      roles: ["female", "admin"],
      requireOwnerParam: "femaleUserId",
    }),
  );
  app.post("/v1/match/join", async (request, reply) =>
    proxyToService(request, reply, serviceEndpoints.matching, { roles: ["male", "admin"] }),
  );
  app.post("/v1/match/respond", async (request, reply) =>
    proxyToService(request, reply, serviceEndpoints.matching, { roles: ["female", "admin"] }),
  );
  app.post("/v1/match/leave", async (request, reply) =>
    proxyToService(request, reply, serviceEndpoints.matching, { roles: ["male", "admin"] }),
  );
  app.post("/v1/match/dispatch", async (request, reply) =>
    proxyToService(request, reply, serviceEndpoints.matching, { roles: ["admin"] }),
  );
  app.get("/v1/match/:requestId", async (request, reply) =>
    proxyToService(request, reply, serviceEndpoints.matching, { roles: ["male", "female", "admin"] }),
  );

  app.post("/v1/wallet/topup", async (request, reply) =>
    proxyToService(request, reply, serviceEndpoints.billing, { roles: ["male", "admin"] }),
  );
  app.get("/v1/wallet/:userId", async (request, reply) =>
    proxyToService(request, reply, serviceEndpoints.billing, {
      roles: ["male", "female", "admin"],
      requireOwnerParam: "userId",
    }),
  );
  app.post("/v1/rewards/claim", async (request, reply) =>
    proxyToService(request, reply, serviceEndpoints.billing, { roles: ["male", "admin"] }),
  );
  app.post("/v1/sessions/start", async (request, reply) =>
    proxyToService(request, reply, serviceEndpoints.billing, { roles: ["male", "female", "admin"] }),
  );
  app.post("/v1/sessions/stop", async (request, reply) =>
    proxyToService(request, reply, serviceEndpoints.billing, { roles: ["male", "female", "admin"] }),
  );
  app.post("/v1/payouts/request", async (request, reply) =>
    proxyToService(request, reply, serviceEndpoints.billing, { roles: ["female", "admin"] }),
  );
  app.post("/v1/payouts/:payoutRequestId/review", async (request, reply) =>
    proxyToService(request, reply, serviceEndpoints.billing, { roles: ["admin"] }),
  );
  app.get("/v1/payouts/pending", async (request, reply) =>
    proxyToService(request, reply, serviceEndpoints.billing, { roles: ["admin"] }),
  );

  app.post("/v1/payments/orders", async (request, reply) =>
    proxyToService(request, reply, serviceEndpoints.payments, { roles: ["male", "admin"] }),
  );
  app.post("/v1/payments/webhooks/razorpay", async (request, reply) =>
    proxyToService(request, reply, serviceEndpoints.payments),
  );
  app.get("/v1/payments/:paymentId", async (request, reply) =>
    proxyToService(request, reply, serviceEndpoints.payments, { roles: ["male", "admin"] }),
  );

  app.post("/v1/verification/selfie", async (request, reply) =>
    proxyToService(request, reply, serviceEndpoints.verification, { roles: ["female", "admin"] }),
  );
  app.post("/v1/verification/live-check", async (request, reply) =>
    proxyToService(request, reply, serviceEndpoints.verification, { roles: ["female", "admin"] }),
  );
  app.post("/v1/verification/admin/review", async (request, reply) =>
    proxyToService(request, reply, serviceEndpoints.verification, { roles: ["admin"] }),
  );
  app.get("/v1/verification/:userId", async (request, reply) =>
    proxyToService(request, reply, serviceEndpoints.verification, {
      roles: ["female", "admin"],
      requireOwnerParam: "userId",
    }),
  );

  app.post("/v1/reports", async (request, reply) =>
    proxyToService(request, reply, serviceEndpoints.moderation, { roles: ["male", "female", "admin"] }),
  );
  app.post("/v1/blocks", async (request, reply) =>
    proxyToService(request, reply, serviceEndpoints.moderation, { roles: ["male", "female", "admin"] }),
  );
  app.post("/v1/moderation/actions", async (request, reply) =>
    proxyToService(request, reply, serviceEndpoints.moderation, { roles: ["admin"] }),
  );
  app.post("/v1/fraud/signal", async (request, reply) =>
    proxyToService(request, reply, serviceEndpoints.moderation, { roles: ["male", "female", "admin"] }),
  );
  app.post("/v1/fraud/device-fingerprint", async (request, reply) =>
    proxyToService(request, reply, serviceEndpoints.moderation, { roles: ["male", "female", "admin"] }),
  );
  app.post("/v1/fraud/telemetry", async (request, reply) =>
    proxyToService(request, reply, serviceEndpoints.moderation, { roles: ["male", "female", "admin"] }),
  );
  app.get("/v1/reports/open", async (request, reply) =>
    proxyToService(request, reply, serviceEndpoints.moderation, { roles: ["admin"] }),
  );

  const port = Number(process.env.PORT ?? 4000);
  await app.listen({ port, host: "0.0.0.0" });
}

bootstrap().catch((error) => {
  app.log.error(error);
  process.exit(1);
});
