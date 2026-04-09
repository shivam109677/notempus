import { randomUUID } from "crypto";

import { config } from "dotenv";
import Fastify from "fastify";
import type { FastifyReply, FastifyRequest } from "fastify";
import Redis from "ioredis";
import {
  JoinMatchRequestSchema,
  JoinMatchResponse,
  MatchResponseSchema,
} from "@shared/contracts";
import { z } from "zod";

config();

const app = Fastify({ logger: true });
const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");

const FEMALE_AVAILABLE_POOL = "female_available_pool";
const MALE_QUEUE_PAID = "male_queue_paid";
const MALE_QUEUE_FREE = "male_queue_free";
const OFFER_TIMEOUT_SECONDS = 5;

const FemaleAvailableSchema = z.object({
  femaleUserId: z.string().uuid(),
});

const LeaveRequestSchema = z.object({
  requestId: z.string().uuid(),
});

const FemaleOffersParamsSchema = z.object({
  femaleUserId: z.string().uuid(),
});

function matchKey(requestId: string): string {
  return `match:req:${requestId}`;
}

function offerKey(requestId: string): string {
  return `match:offer:${requestId}`;
}

function estimateWaitSeconds(queueSize: number, femalePoolSize: number): number {
  if (femalePoolSize === 0) {
    return Math.max(5, queueSize * OFFER_TIMEOUT_SECONDS);
  }
  return Math.max(1, Math.ceil((queueSize / femalePoolSize) * OFFER_TIMEOUT_SECONDS));
}

/**
 * Compute an affinity score (0-100) between two match requests.
 * Soft scoring only — pairs always match regardless of score.
 */
function computeAffinity(
  req: Record<string, string>,
  femaleData: Record<string, string>,
): number {
  let score = 0;

  // Language match: +30
  if (
    req.preferred_language &&
    femaleData.preferred_language &&
    req.preferred_language === femaleData.preferred_language
  ) {
    score += 30;
  }

  // Shared interests: +10 per tag, capped at 40
  try {
    const maleTags: string[] = JSON.parse(req.interest_tags || "[]") as string[];
    const femaleTags: string[] = JSON.parse(femaleData.interest_tags || "[]") as string[];
    const femalSet = new Set(femaleTags);
    const shared = maleTags.filter((t) => femalSet.has(t)).length;
    score += Math.min(40, shared * 10);
  } catch {
    // ignore malformed JSON
  }

  // Mood compatibility: same mood gets +20
  if (req.mood && femaleData.mood && req.mood === femaleData.mood) {
    score += 20;
  }

  // Intent match: +10
  if (req.intent && femaleData.intent && req.intent === femaleData.intent) {
    score += 10;
  }

  return Math.min(100, score);
}

async function dispatchOnce(): Promise<
  | { status: "no-female" }
  | { status: "no-male" }
  | { status: "dispatched"; requestId: string; femaleUserId: string }
> {
  const femaleUserId = await redis.spop(FEMALE_AVAILABLE_POOL);
  if (!femaleUserId) {
    return { status: "no-female" };
  }

  const requestId = (await redis.rpop(MALE_QUEUE_PAID)) ?? (await redis.rpop(MALE_QUEUE_FREE));
  if (!requestId) {
    await redis.sadd(FEMALE_AVAILABLE_POOL, femaleUserId);
    return { status: "no-male" };
  }

  const request = await redis.hgetall(matchKey(requestId));
  if (!request.id || request.status === "cancelled") {
    await redis.sadd(FEMALE_AVAILABLE_POOL, femaleUserId);
    return { status: "no-male" };
  }

  const affinityScore = computeAffinity(request, {});
  const now = new Date().toISOString();
  await redis.hset(matchKey(requestId), {
    status: "offered",
    offered_female_user_id: femaleUserId,
    offer_expires_at: new Date(Date.now() + OFFER_TIMEOUT_SECONDS * 1000).toISOString(),
    affinity_score: String(affinityScore),
    updated_at: now,
  });
  await redis.set(offerKey(requestId), femaleUserId, "EX", OFFER_TIMEOUT_SECONDS);

  await redis.publish(
    `female:${femaleUserId}:offers`,
    JSON.stringify({
      requestId,
      maleUserId: request.male_user_id,
      mode: request.mode,
      timeoutSeconds: OFFER_TIMEOUT_SECONDS,
    }),
  );

  return { status: "dispatched", requestId, femaleUserId };
}

async function bootstrap(): Promise<void> {
  app.get("/health", async () => ({ ok: true, service: "matching-service" }));

  app.post("/v1/female/available", async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = FemaleAvailableSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    await redis.sadd(FEMALE_AVAILABLE_POOL, parsed.data.femaleUserId);
    await dispatchOnce();
    return { status: "ok" };
  });

  app.get("/v1/female/offers/:femaleUserId", async (request: FastifyRequest, reply: FastifyReply) => {
    const params = FemaleOffersParamsSchema.safeParse((request as { params: unknown }).params);
    if (!params.success) {
      return reply.code(400).send({ error: params.error.flatten() });
    }

    const keys = await redis.keys("match:req:*");
    if (keys.length === 0) {
      return { offers: [] };
    }

    // Pipeline reads keep this endpoint lightweight even with many requests.
    const pipeline = redis.pipeline();
    for (const key of keys) {
      pipeline.hgetall(key);
    }

    const results = await pipeline.exec();
    const offers = (results ?? [])
      .map((entry) => {
        const data = entry[1] as Record<string, string>;
        if (!data.id) {
          return null;
        }

        if (data.status !== "offered") {
          return null;
        }

        if (data.offered_female_user_id !== params.data.femaleUserId) {
          return null;
        }

        return {
          requestId: data.id,
          maleUserId: data.male_user_id,
          mode: data.mode,
          offerExpiresAt: data.offer_expires_at,
        };
      })
      .filter((value): value is NonNullable<typeof value> => Boolean(value));

    offers.sort((a, b) => (a.offerExpiresAt ?? "").localeCompare(b.offerExpiresAt ?? ""));
    return { offers };
  });

  app.post("/v1/match/join", async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = JoinMatchRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const requestId = randomUUID();
    const now = new Date().toISOString();

    await redis.hset(matchKey(requestId), {
      id: requestId,
      male_user_id: parsed.data.userId,
      mode: parsed.data.mode,
      status: "queued",
      requested_at: now,
      updated_at: now,
      preferred_language: parsed.data.preferredLanguage ?? "",
      interest_tags: JSON.stringify(parsed.data.interestTags ?? []),
      mood: parsed.data.mood ?? "chill",
      intent: parsed.data.intent ?? "chat",
    });
    await redis.expire(matchKey(requestId), 60 * 15);

    if (parsed.data.mode === "paid_verified") {
      await redis.lpush(MALE_QUEUE_PAID, requestId);
    } else {
      await redis.lpush(MALE_QUEUE_FREE, requestId);
    }

    const dispatchResult = await dispatchOnce();
    const queueName = parsed.data.mode === "paid_verified" ? MALE_QUEUE_PAID : MALE_QUEUE_FREE;
    const queueSize = await redis.llen(queueName);
    const femalePoolSize = await redis.scard(FEMALE_AVAILABLE_POOL);

    const response: JoinMatchResponse = {
      requestId,
      status: dispatchResult.status === "dispatched" && dispatchResult.requestId === requestId ? "offered" : "queued",
      estimatedWaitSeconds: estimateWaitSeconds(queueSize, femalePoolSize),
    };

    return response;
  });

  app.post("/v1/match/respond", async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = MatchResponseSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const key = matchKey(parsed.data.requestId);
    const requestData = await redis.hgetall(key);
    if (!requestData.id) {
      return reply.code(404).send({ error: "request_not_found" });
    }

    if (requestData.status !== "offered") {
      return reply.code(409).send({ error: "request_not_offered" });
    }

    if (requestData.offered_female_user_id !== parsed.data.femaleUserId) {
      return reply.code(403).send({ error: "female_mismatch" });
    }

    const now = new Date().toISOString();
    if (parsed.data.response === "accept") {
      await redis.hset(key, {
        status: "matched",
        responded_at: now,
        updated_at: now,
      });
      await redis.del(offerKey(parsed.data.requestId));
      await redis.publish(
        `male:${requestData.male_user_id}:matches`,
        JSON.stringify({
          requestId: parsed.data.requestId,
          femaleUserId: parsed.data.femaleUserId,
          status: "accepted",
        }),
      );

      return { status: "matched" };
    }

    await redis.hset(key, {
      status: "queued",
      offered_female_user_id: "",
      responded_at: now,
      updated_at: now,
    });

    await redis.del(offerKey(parsed.data.requestId));
    await redis.sadd(FEMALE_AVAILABLE_POOL, parsed.data.femaleUserId);

    if (requestData.mode === "paid_verified") {
      await redis.lpush(MALE_QUEUE_PAID, parsed.data.requestId);
    } else {
      await redis.lpush(MALE_QUEUE_FREE, parsed.data.requestId);
    }

    await dispatchOnce();
    return { status: "requeued" };
  });

  app.post("/v1/match/leave", async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = LeaveRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const key = matchKey(parsed.data.requestId);
    const requestData = await redis.hgetall(key);
    if (!requestData.id) {
      return reply.code(404).send({ error: "request_not_found" });
    }

    await redis.lrem(MALE_QUEUE_PAID, 0, parsed.data.requestId);
    await redis.lrem(MALE_QUEUE_FREE, 0, parsed.data.requestId);
    await redis.hset(key, {
      status: "cancelled",
      updated_at: new Date().toISOString(),
    });

    return { status: "cancelled" };
  });

  app.post("/v1/match/dispatch", async () => dispatchOnce());

  app.get("/v1/match/:requestId", async (request: FastifyRequest, reply: FastifyReply) => {
    const params = z
      .object({ requestId: z.string().uuid() })
      .safeParse((request as { params: unknown }).params);

    if (!params.success) {
      return reply.code(400).send({ error: params.error.flatten() });
    }

    const requestData = await redis.hgetall(matchKey(params.data.requestId));
    if (!requestData.id) {
      return reply.code(404).send({ error: "request_not_found" });
    }

    return requestData;
  });

  const port = Number(process.env.PORT ?? 4001);
  await app.listen({ host: "0.0.0.0", port });
}

bootstrap().catch((error) => {
  app.log.error(error);
  process.exit(1);
});
