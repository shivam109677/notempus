import { config } from "dotenv";
import Fastify from "fastify";
import type { FastifyReply, FastifyRequest } from "fastify";
import { Pool, type PoolClient } from "pg";
import { z } from "zod";

config();

const app = Fastify({ logger: true });

const db = new Pool({ connectionString: process.env.DATABASE_URL });

type UserRole = "male" | "female" | "admin";

const FACE_MATCH_THRESHOLD = Number(process.env.FACE_MATCH_THRESHOLD ?? "0.75");
const LIVENESS_THRESHOLD = Number(process.env.LIVENESS_THRESHOLD ?? "0.8");

const SelfieUploadSchema = z.object({
  userId: z.string().uuid(),
  selfieUrl: z.string().url(),
});

const LiveCheckSchema = z.object({
  userId: z.string().uuid(),
  sessionId: z.string().uuid().optional(),
  liveCaptureUrl: z.string().url(),
  blinkDetected: z.boolean(),
  headMovementDetected: z.boolean(),
  faceMatchScore: z.number().min(0).max(1),
  livenessScore: z.number().min(0).max(1),
});

const AdminReviewSchema = z.object({
  userId: z.string().uuid(),
  reviewedBy: z.string().uuid(),
  status: z.enum(["approved", "rejected"]),
  reviewNote: z.string().max(2000).optional(),
});

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

async function ensureVerificationProfile(client: PoolClient, userId: string, role: UserRole): Promise<void> {
  await ensureUser(client, userId, role);
  await client.query(
    `INSERT INTO verification_profiles (user_id)
     VALUES ($1)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId],
  );
}

async function bootstrap(): Promise<void> {
  app.get("/health", async () => ({ ok: true, service: "verification-service" }));

  app.post("/v1/verification/selfie", async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = SelfieUploadSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    await withTransaction(async (client) => {
      await ensureVerificationProfile(client, parsed.data.userId, "female");

      await client.query(
        `UPDATE verification_profiles
         SET selfie_url = $1, status = 'pending', updated_at = NOW()
         WHERE user_id = $2`,
        [parsed.data.selfieUrl, parsed.data.userId],
      );

      await client.query(
        `UPDATE users
         SET verification_status = 'pending', updated_at = NOW()
         WHERE id = $1`,
        [parsed.data.userId],
      );
    });

    return { status: "pending", step: "selfie_uploaded" };
  });

  app.post("/v1/verification/live-check", async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = LiveCheckSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const automaticPass =
      parsed.data.blinkDetected &&
      parsed.data.headMovementDetected &&
      parsed.data.faceMatchScore >= FACE_MATCH_THRESHOLD &&
      parsed.data.livenessScore >= LIVENESS_THRESHOLD;

    const verificationStatus = automaticPass ? "approved" : "pending";
    const livenessStatus = automaticPass ? "pass" : "review";

    await withTransaction(async (client) => {
      await ensureVerificationProfile(client, parsed.data.userId, "female");

      await client.query(
        `UPDATE verification_profiles
         SET live_capture_url = $1,
             face_match_score = $2,
             liveness_score = $3,
             status = $4,
             updated_at = NOW()
         WHERE user_id = $5`,
        [
          parsed.data.liveCaptureUrl,
          parsed.data.faceMatchScore,
          parsed.data.livenessScore,
          verificationStatus,
          parsed.data.userId,
        ],
      );

      await client.query(
        `UPDATE users
         SET verification_status = $1,
             updated_at = NOW()
         WHERE id = $2`,
        [verificationStatus, parsed.data.userId],
      );

      await client.query(
        `INSERT INTO liveness_checks (user_id, session_id, challenge_type, score, status, metadata)
         VALUES ($1, $2, 'blink', $3, $4, $5)`,
        [
          parsed.data.userId,
          parsed.data.sessionId ?? null,
          parsed.data.blinkDetected ? parsed.data.livenessScore : 0,
          parsed.data.blinkDetected ? "pass" : "fail",
          JSON.stringify({ blinkDetected: parsed.data.blinkDetected }),
        ],
      );

      await client.query(
        `INSERT INTO liveness_checks (user_id, session_id, challenge_type, score, status, metadata)
         VALUES ($1, $2, 'head_turn', $3, $4, $5)`,
        [
          parsed.data.userId,
          parsed.data.sessionId ?? null,
          parsed.data.headMovementDetected ? parsed.data.livenessScore : 0,
          parsed.data.headMovementDetected ? "pass" : "fail",
          JSON.stringify({ headMovementDetected: parsed.data.headMovementDetected }),
        ],
      );

      await client.query(
        `INSERT INTO liveness_checks (user_id, session_id, challenge_type, score, status, metadata)
         VALUES ($1, $2, 'random_prompt', $3, $4, $5)`,
        [
          parsed.data.userId,
          parsed.data.sessionId ?? null,
          parsed.data.livenessScore,
          livenessStatus,
          JSON.stringify({
            faceMatchScore: parsed.data.faceMatchScore,
            livenessScore: parsed.data.livenessScore,
            automaticPass,
          }),
        ],
      );
    });

    return {
      status: verificationStatus,
      automaticPass,
      requiresManualReview: !automaticPass,
      thresholds: {
        faceMatch: FACE_MATCH_THRESHOLD,
        liveness: LIVENESS_THRESHOLD,
      },
    };
  });

  app.post("/v1/verification/admin/review", async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = AdminReviewSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const updated = await withTransaction(async (client) => {
      await ensureUser(client, parsed.data.reviewedBy, "admin");

      const updateResult = await client.query(
        `UPDATE verification_profiles
         SET status = $1,
             reviewed_by = $2,
             review_note = $3,
             updated_at = NOW()
         WHERE user_id = $4
         RETURNING user_id, status, reviewed_by, review_note, updated_at`,
        [parsed.data.status, parsed.data.reviewedBy, parsed.data.reviewNote ?? null, parsed.data.userId],
      );

      if (!updateResult.rowCount) {
        return null;
      }

      await client.query(
        `UPDATE users
         SET verification_status = $1,
             updated_at = NOW()
         WHERE id = $2`,
        [parsed.data.status, parsed.data.userId],
      );

      return updateResult.rows[0];
    });

    if (!updated) {
      return reply.code(404).send({ error: "verification_profile_not_found" });
    }

    return updated;
  });

  app.get("/v1/verification/:userId", async (request: FastifyRequest, reply: FastifyReply) => {
    const params = z
      .object({ userId: z.string().uuid() })
      .safeParse((request as { params: unknown }).params);

    if (!params.success) {
      return reply.code(400).send({ error: params.error.flatten() });
    }

    const result = await db.query(
      `SELECT user_id, selfie_url, live_capture_url, face_match_score, liveness_score, status, reviewed_by, review_note, updated_at
       FROM verification_profiles
       WHERE user_id = $1`,
      [params.data.userId],
    );

    if (!result.rowCount) {
      return reply.code(404).send({ error: "verification_profile_not_found" });
    }

    return result.rows[0];
  });

  const port = Number(process.env.PORT ?? 4005);
  await app.listen({ host: "0.0.0.0", port });
}

bootstrap().catch((error) => {
  app.log.error(error);
  process.exit(1);
});
