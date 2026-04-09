import { config } from "dotenv";
import Fastify from "fastify";
import type { FastifyReply, FastifyRequest } from "fastify";
import { Pool, type PoolClient } from "pg";
import { randomUUID } from "crypto";
import { z } from "zod";

config();

const app = Fastify({ logger: true });

const db = new Pool({ connectionString: process.env.DATABASE_URL });

type UserRole = "male" | "female" | "admin";

const TELEMETRY_BATCH_SIZE = Number(process.env.FRAUD_TELEMETRY_BATCH_SIZE ?? "50");
const TELEMETRY_WORKER_INTERVAL_MS = Number(process.env.FRAUD_TELEMETRY_WORKER_INTERVAL_MS ?? "1000");

const ReportSchema = z.object({
  reporterUserId: z.string().uuid(),
  reportedUserId: z.string().uuid(),
  sessionId: z.string().uuid().optional(),
  reason: z.string().min(3).max(120),
  details: z.string().max(4000).optional(),
});

const BlockSchema = z.object({
  blockerUserId: z.string().uuid(),
  blockedUserId: z.string().uuid(),
});

const ModerationActionSchema = z.object({
  actorUserId: z.string().uuid().optional(),
  targetUserId: z.string().uuid(),
  sessionId: z.string().uuid().optional(),
  action: z.enum(["warn", "shadow_ban", "ban", "terminate_session"]),
  reason: z.string().min(3).max(500),
  metadata: z.record(z.unknown()).optional(),
});

const FraudSignalSchema = z.object({
  userId: z.string().uuid(),
  sessionId: z.string().uuid().optional(),
  signalType: z.enum(["static_image", "replay_video", "multiple_accounts", "device_abuse", "velocity_abuse"]),
  severity: z.number().int().min(1).max(5),
  confidence: z.number().min(0).max(1),
  metadata: z.record(z.unknown()).optional(),
});

const DeviceFingerprintSchema = z.object({
  userId: z.string().uuid(),
  fingerprintHash: z.string().min(16).max(256),
  metadata: z.record(z.unknown()).optional(),
});

const FraudTelemetrySchema = z.object({
  userId: z.string().uuid(),
  sessionId: z.string().uuid().optional(),
  frameDiffScore: z.number().min(0).max(1).optional(),
  replayLikelihood: z.number().min(0).max(1).optional(),
  staticImageProbability: z.number().min(0).max(1).optional(),
  accountSwitches24h: z.number().int().min(0).max(1000).optional(),
  actionRatePerMinute: z.number().min(0).max(10000).optional(),
  metadata: z.record(z.unknown()).optional(),
});

type TelemetryJob = {
  telemetryEventId: string;
  userId: string;
  userRole: UserRole;
  sessionId?: string;
  frameDiffScore?: number;
  replayLikelihood?: number;
  staticImageProbability?: number;
  accountSwitches24h?: number;
  actionRatePerMinute?: number;
  metadata?: Record<string, unknown>;
  receivedAt: string;
};

type DerivedFraudSignal = {
  signalType: "static_image" | "replay_video" | "multiple_accounts" | "velocity_abuse";
  severity: number;
  confidence: number;
  metadata: Record<string, unknown>;
};

const telemetryQueue: TelemetryJob[] = [];

function requestRole(request: FastifyRequest): UserRole {
  const roleHeader = request.headers["x-auth-role"];
  return roleHeader === "female" || roleHeader === "admin" ? roleHeader : "male";
}

function requestUserId(request: FastifyRequest): string | null {
  const userIdHeader = request.headers["x-auth-user-id"];
  if (typeof userIdHeader === "string" && userIdHeader.length > 0) {
    return userIdHeader;
  }
  return null;
}

function oppositeRole(role: UserRole): UserRole {
  if (role === "male") {
    return "female";
  }
  if (role === "female") {
    return "male";
  }
  return "male";
}

function inferRoleForUser(request: FastifyRequest, targetUserId: string): UserRole {
  const actorRole = requestRole(request);
  const actorUserId = requestUserId(request);

  if (actorUserId && actorUserId === targetUserId) {
    return actorRole === "admin" ? "male" : actorRole;
  }

  return oppositeRole(actorRole);
}

async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function ensureUser(client: PoolClient, userId: string, role: UserRole): Promise<void> {
  await client.query(
    `INSERT INTO users (id, role)
     VALUES ($1, $2::user_role)
     ON CONFLICT (id)
     DO UPDATE
     SET role = CASE
       WHEN users.role = 'admin'::user_role THEN users.role
       ELSE EXCLUDED.role
     END,
     updated_at = NOW()`,
    [userId, role],
  );
}

function deriveFraudSignals(job: TelemetryJob): DerivedFraudSignal[] {
  const signals: DerivedFraudSignal[] = [];

  if (
    (typeof job.replayLikelihood === "number" && job.replayLikelihood >= 0.9) ||
    (typeof job.frameDiffScore === "number" && job.frameDiffScore <= 0.04)
  ) {
    signals.push({
      signalType: "replay_video",
      severity: 5,
      confidence: Math.max(job.replayLikelihood ?? 0, 0.92),
      metadata: {
        replayLikelihood: job.replayLikelihood,
        frameDiffScore: job.frameDiffScore,
      },
    });
  }

  if (typeof job.staticImageProbability === "number" && job.staticImageProbability >= 0.92) {
    signals.push({
      signalType: "static_image",
      severity: 4,
      confidence: job.staticImageProbability,
      metadata: {
        staticImageProbability: job.staticImageProbability,
      },
    });
  }

  if (typeof job.accountSwitches24h === "number" && job.accountSwitches24h >= 5) {
    signals.push({
      signalType: "multiple_accounts",
      severity: 4,
      confidence: Math.min(0.99, 0.8 + job.accountSwitches24h * 0.03),
      metadata: {
        accountSwitches24h: job.accountSwitches24h,
      },
    });
  }

  if (typeof job.actionRatePerMinute === "number" && job.actionRatePerMinute >= 300) {
    signals.push({
      signalType: "velocity_abuse",
      severity: 3,
      confidence: Math.min(0.95, 0.65 + (job.actionRatePerMinute - 300) / 800),
      metadata: {
        actionRatePerMinute: job.actionRatePerMinute,
      },
    });
  }

  return signals;
}

async function processTelemetryJob(job: TelemetryJob): Promise<void> {
  const signals = deriveFraudSignals(job);
  if (signals.length === 0) {
    return;
  }

  await withTransaction(async (client) => {
    await ensureUser(client, job.userId, job.userRole);

    for (const signal of signals) {
      const insertResult = await client.query(
        `INSERT INTO fraud_signals
         (user_id, session_id, signal_type, severity, confidence, status, metadata)
         VALUES ($1, $2, $3, $4, $5, 'open', $6)
         RETURNING id`,
        [
          job.userId,
          job.sessionId ?? null,
          signal.signalType,
          signal.severity,
          signal.confidence,
          JSON.stringify({
            source: "telemetry_worker",
            telemetryEventId: job.telemetryEventId,
            receivedAt: job.receivedAt,
            ...signal.metadata,
            ...(job.metadata ?? {}),
          }),
        ],
      );

      const signalId = (insertResult.rows[0] as { id: string }).id;
      if (signal.severity >= 4 && signal.confidence >= 0.9) {
        await applyModerationAction(client, {
          targetUserId: job.userId,
          targetRole: job.userRole,
          sessionId: job.sessionId,
          action: "shadow_ban",
          reason: `auto_telemetry_${signal.signalType}`,
          metadata: { telemetryEventId: job.telemetryEventId },
        });

        await client.query(`UPDATE fraud_signals SET status = 'actioned' WHERE id = $1`, [signalId]);
      }
    }
  });
}

async function runTelemetryBatch(): Promise<void> {
  if (telemetryQueue.length === 0) {
    return;
  }

  const jobs = telemetryQueue.splice(0, TELEMETRY_BATCH_SIZE);
  for (const job of jobs) {
    try {
      await processTelemetryJob(job);
    } catch (error) {
      app.log.error({ error, telemetryEventId: job.telemetryEventId }, "telemetry_job_failed");
    }
  }
}

async function applyModerationAction(
  client: PoolClient,
  input: {
    actorUserId?: string;
    targetUserId: string;
    targetRole?: UserRole;
    sessionId?: string;
    action: "warn" | "shadow_ban" | "ban" | "terminate_session";
    reason: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await ensureUser(client, input.targetUserId, input.targetRole ?? "male");

  if (input.actorUserId) {
    await ensureUser(client, input.actorUserId, "admin");
  }

  if (input.action === "shadow_ban") {
    await client.query(`UPDATE users SET is_shadow_banned = TRUE, updated_at = NOW() WHERE id = $1`, [
      input.targetUserId,
    ]);
  }

  if (input.action === "ban") {
    await client.query(`UPDATE users SET is_active = FALSE, updated_at = NOW() WHERE id = $1`, [input.targetUserId]);
  }

  if (input.action === "terminate_session" && input.sessionId) {
    await client.query(
      `UPDATE chat_sessions
       SET status = 'terminated', ended_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [input.sessionId],
    );
  }

  await client.query(
    `INSERT INTO moderation_actions
     (actor_user_id, target_user_id, session_id, action, reason, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      input.actorUserId ?? null,
      input.targetUserId,
      input.sessionId ?? null,
      input.action,
      input.reason,
      JSON.stringify(input.metadata ?? {}),
    ],
  );
}

async function bootstrap(): Promise<void> {
  app.get("/health", async () => ({ ok: true, service: "moderation-service" }));

  app.post("/v1/reports", async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = ReportSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const insertResult = await withTransaction(async (client) => {
      await ensureUser(client, parsed.data.reporterUserId, inferRoleForUser(request, parsed.data.reporterUserId));
      await ensureUser(client, parsed.data.reportedUserId, inferRoleForUser(request, parsed.data.reportedUserId));

      return client.query(
        `INSERT INTO reports
         (reporter_user_id, reported_user_id, session_id, reason, details)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, status, created_at`,
        [
          parsed.data.reporterUserId,
          parsed.data.reportedUserId,
          parsed.data.sessionId ?? null,
          parsed.data.reason,
          parsed.data.details ?? null,
        ],
      );
    });

    return insertResult.rows[0];
  });

  app.post("/v1/blocks", async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = BlockSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    await withTransaction(async (client) => {
      await ensureUser(client, parsed.data.blockerUserId, inferRoleForUser(request, parsed.data.blockerUserId));
      await ensureUser(client, parsed.data.blockedUserId, inferRoleForUser(request, parsed.data.blockedUserId));

      await client.query(
        `INSERT INTO user_blocks (blocker_user_id, blocked_user_id)
         VALUES ($1, $2)
         ON CONFLICT (blocker_user_id, blocked_user_id) DO NOTHING`,
        [parsed.data.blockerUserId, parsed.data.blockedUserId],
      );
    });

    return { status: "blocked" };
  });

  app.post("/v1/moderation/actions", async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = ModerationActionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    await withTransaction(async (client) => {
      await applyModerationAction(client, {
        actorUserId: parsed.data.actorUserId,
        targetUserId: parsed.data.targetUserId,
        targetRole: inferRoleForUser(request, parsed.data.targetUserId),
        sessionId: parsed.data.sessionId,
        action: parsed.data.action,
        reason: parsed.data.reason,
        metadata: parsed.data.metadata,
      });
    });

    return { status: "action_applied" };
  });

  app.post("/v1/fraud/signal", async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = FraudSignalSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const result = await withTransaction(async (client) => {
      const inferredRole = inferRoleForUser(request, parsed.data.userId);
      await ensureUser(client, parsed.data.userId, inferredRole);

      const signalInsert = await client.query(
        `INSERT INTO fraud_signals
         (user_id, session_id, signal_type, severity, confidence, metadata)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [
          parsed.data.userId,
          parsed.data.sessionId ?? null,
          parsed.data.signalType,
          parsed.data.severity,
          parsed.data.confidence,
          JSON.stringify(parsed.data.metadata ?? {}),
        ],
      );

      let autoAction: "none" | "shadow_ban" = "none";
      if (parsed.data.severity >= 4 && parsed.data.confidence >= 0.9) {
        await applyModerationAction(client, {
          targetUserId: parsed.data.userId,
          targetRole: inferredRole,
          sessionId: parsed.data.sessionId,
          action: "shadow_ban",
          reason: `auto_enforcement_${parsed.data.signalType}`,
          metadata: { source: "fraud_signal" },
        });

        await client.query(`UPDATE fraud_signals SET status = 'actioned' WHERE id = $1`, [
          (signalInsert.rows[0] as { id: string }).id,
        ]);
        autoAction = "shadow_ban";
      }

      return {
        signalId: (signalInsert.rows[0] as { id: string }).id,
        autoAction,
      };
    });

    return result;
  });

  app.post("/v1/fraud/device-fingerprint", async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = DeviceFingerprintSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const result = await withTransaction(async (client) => {
      await ensureUser(client, parsed.data.userId, inferRoleForUser(request, parsed.data.userId));

      await client.query(
        `INSERT INTO user_device_fingerprints (user_id, fingerprint_hash, metadata)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, fingerprint_hash)
         DO UPDATE SET metadata = EXCLUDED.metadata`,
        [parsed.data.userId, parsed.data.fingerprintHash, JSON.stringify(parsed.data.metadata ?? {})],
      );

      const sharedResult = await client.query(
        `SELECT COUNT(DISTINCT user_id) AS users_count
         FROM user_device_fingerprints
         WHERE fingerprint_hash = $1`,
        [parsed.data.fingerprintHash],
      );

      const usersCount = Number((sharedResult.rows[0] as { users_count: string }).users_count);
      if (usersCount >= 3) {
        await client.query(
          `INSERT INTO fraud_signals
           (user_id, signal_type, severity, confidence, status, metadata)
           VALUES ($1, 'multiple_accounts', 5, 0.95, 'open', $2)`,
          [
            parsed.data.userId,
            JSON.stringify({ fingerprintHash: parsed.data.fingerprintHash, usersCount }),
          ],
        );
      }

      return { usersCountWithFingerprint: usersCount, flagged: usersCount >= 3 };
    });

    return result;
  });

  app.post("/v1/fraud/telemetry", async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = FraudTelemetrySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    await withTransaction(async (client) => {
      await ensureUser(client, parsed.data.userId, inferRoleForUser(request, parsed.data.userId));
    });

    const inferredRole = inferRoleForUser(request, parsed.data.userId);

    const telemetryEventId = randomUUID();
    telemetryQueue.push({
      telemetryEventId,
      userId: parsed.data.userId,
      userRole: inferredRole,
      sessionId: parsed.data.sessionId,
      frameDiffScore: parsed.data.frameDiffScore,
      replayLikelihood: parsed.data.replayLikelihood,
      staticImageProbability: parsed.data.staticImageProbability,
      accountSwitches24h: parsed.data.accountSwitches24h,
      actionRatePerMinute: parsed.data.actionRatePerMinute,
      metadata: parsed.data.metadata,
      receivedAt: new Date().toISOString(),
    });

    return {
      telemetryEventId,
      status: "queued",
      queueDepth: telemetryQueue.length,
    };
  });

  app.get("/v1/reports/open", async () => {
    const result = await db.query(
      `SELECT id, reporter_user_id, reported_user_id, session_id, reason, details, status, created_at
       FROM reports
       WHERE status = 'open'
       ORDER BY created_at DESC
       LIMIT 100`,
    );
    return { reports: result.rows };
  });

  setInterval(() => {
    void runTelemetryBatch();
  }, TELEMETRY_WORKER_INTERVAL_MS);

  const port = Number(process.env.PORT ?? 4006);
  await app.listen({ host: "0.0.0.0", port });
}

bootstrap().catch((error) => {
  app.log.error(error);
  process.exit(1);
});
