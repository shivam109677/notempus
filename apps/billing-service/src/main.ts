import { config } from "dotenv";
import Fastify from "fastify";
import type { FastifyReply, FastifyRequest } from "fastify";
import { Pool, PoolClient } from "pg";
import { SessionStartSchema } from "@shared/contracts";
import { z } from "zod";

config();

const app = Fastify({ logger: true });

type UserRole = "male" | "female" | "admin";

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const BILLING_TICK_SECONDS = Number(process.env.BILLING_TICK_SECONDS ?? "1");
const FEMALE_SHARE_BPS = Number(process.env.FEMALE_SHARE_BPS ?? "5000");
const PLATFORM_SHARE_BPS = Number(process.env.PLATFORM_SHARE_BPS ?? "3000");
const REWARD_SHARE_BPS = Number(process.env.REWARD_SHARE_BPS ?? "2000");

if (FEMALE_SHARE_BPS + PLATFORM_SHARE_BPS + REWARD_SHARE_BPS !== 10000) {
  throw new Error("Revenue split BPS must sum to 10000");
}

const activeSessionIds = new Set<string>();

const SessionStopSchema = z.object({
  sessionId: z.string().uuid(),
  reason: z.enum(["normal", "male_balance_exhausted", "network_drop", "moderation_action"]),
});

const WalletTopupSchema = z.object({
  userId: z.string().uuid(),
  amountPaise: z.number().int().positive(),
  idempotencyKey: z.string().min(8).max(128),
});

const RewardClaimSchema = z.object({
  userId: z.string().uuid(),
  amountPaise: z.number().int().positive(),
  idempotencyKey: z.string().min(8).max(128),
});

const PayoutRequestSchema = z.object({
  femaleUserId: z.string().uuid(),
  amountPaise: z.number().int().positive(),
  idempotencyKey: z.string().min(8).max(128),
});

const PayoutReviewSchema = z.object({
  reviewedByUserId: z.string().uuid(),
  status: z.enum(["approved", "rejected", "paid"]),
  reviewNote: z.string().max(2000).optional(),
});

const MIN_PAYOUT_PAISE = Number(process.env.MIN_PAYOUT_PAISE ?? "10000");

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

async function ensureWallet(client: PoolClient, userId: string, role: UserRole): Promise<void> {
  await ensureUser(client, userId, role);
  await client.query(
    `INSERT INTO wallets (user_id, balance_paise)
     VALUES ($1, 0)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId],
  );
}

function computeDebitForTick(ratePerMinutePaise: number, carrySixtieth: number): {
  debitPaise: number;
  nextCarrySixtieth: number;
} {
  const totalSixtieth = ratePerMinutePaise + carrySixtieth;
  const debitPaise = Math.floor(totalSixtieth / 60);
  const nextCarrySixtieth = totalSixtieth % 60;
  return { debitPaise, nextCarrySixtieth };
}

async function billSessionTick(sessionId: string): Promise<void> {
  const billed = await withTransaction(async (client) => {
    const sessionResult = await client.query(
      `SELECT * FROM chat_sessions WHERE id = $1 FOR UPDATE`,
      [sessionId],
    );

    if (sessionResult.rowCount === 0) {
      return { keepActive: false, reason: "missing" as const };
    }

    const session = sessionResult.rows[0] as {
      id: string;
      male_user_id: string;
      female_user_id: string;
      status: string;
      rate_per_minute_paise: number;
      carry_millipaise: number;
      billed_seconds: number;
      total_male_debited_paise: number;
      total_female_credited_paise: number;
      total_platform_revenue_paise: number;
      total_reward_pool_paise: number;
    };

    if (session.status !== "connected") {
      return { keepActive: false, reason: "ended" as const };
    }

    const maleWalletResult = await client.query(
      `SELECT * FROM wallets WHERE user_id = $1 FOR UPDATE`,
      [session.male_user_id],
    );
    const femaleWalletResult = await client.query(
      `SELECT * FROM wallets WHERE user_id = $1 FOR UPDATE`,
      [session.female_user_id],
    );
    await client.query(`SELECT * FROM reward_pool WHERE id = 1 FOR UPDATE`);

    if (maleWalletResult.rowCount === 0 || femaleWalletResult.rowCount === 0) {
      return { keepActive: false, reason: "wallet_missing" as const };
    }

    const maleWallet = maleWalletResult.rows[0] as { id: string; balance_paise: number };
    const femaleWallet = femaleWalletResult.rows[0] as { id: string; balance_paise: number };

    const { debitPaise, nextCarrySixtieth } = computeDebitForTick(
      session.rate_per_minute_paise,
      session.carry_millipaise,
    );

    if (debitPaise <= 0 || maleWallet.balance_paise < debitPaise) {
      await client.query(
        `UPDATE chat_sessions
         SET status = 'terminated', ended_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [session.id],
      );

      return {
        keepActive: false,
        reason: "insufficient_balance" as const,
      };
    }

    const femaleCredit = Math.floor((debitPaise * FEMALE_SHARE_BPS) / 10000);
    const platformRevenue = Math.floor((debitPaise * PLATFORM_SHARE_BPS) / 10000);
    const rewardCredit = debitPaise - femaleCredit - platformRevenue;

    const maleBalanceAfter = maleWallet.balance_paise - debitPaise;
    const femaleBalanceAfter = femaleWallet.balance_paise + femaleCredit;

    await client.query(`UPDATE wallets SET balance_paise = $1, updated_at = NOW() WHERE id = $2`, [
      maleBalanceAfter,
      maleWallet.id,
    ]);
    await client.query(`UPDATE wallets SET balance_paise = $1, updated_at = NOW() WHERE id = $2`, [
      femaleBalanceAfter,
      femaleWallet.id,
    ]);

    await client.query(
      `INSERT INTO wallet_ledger
       (wallet_id, user_id, session_id, type, reason, amount_paise, balance_after_paise, metadata)
       VALUES ($1, $2, $3, 'debit', 'chat_usage', $4, $5, $6)`,
      [
        maleWallet.id,
        session.male_user_id,
        session.id,
        debitPaise,
        maleBalanceAfter,
        JSON.stringify({ tickSeconds: BILLING_TICK_SECONDS }),
      ],
    );

    await client.query(
      `INSERT INTO wallet_ledger
       (wallet_id, user_id, session_id, type, reason, amount_paise, balance_after_paise, metadata)
       VALUES ($1, $2, $3, 'credit', 'female_earning', $4, $5, $6)`,
      [
        femaleWallet.id,
        session.female_user_id,
        session.id,
        femaleCredit,
        femaleBalanceAfter,
        JSON.stringify({ tickSeconds: BILLING_TICK_SECONDS }),
      ],
    );

    await client.query(`UPDATE reward_pool SET balance_paise = balance_paise + $1, updated_at = NOW() WHERE id = 1`, [
      rewardCredit,
    ]);
    await client.query(
      `INSERT INTO reward_pool_ledger
       (amount_paise, type, reason, related_user_id, related_session_id)
       VALUES ($1, 'credit', 'reward_pool_funding', $2, $3)`,
      [rewardCredit, session.male_user_id, session.id],
    );

    await client.query(
      `UPDATE chat_sessions
       SET billed_seconds = billed_seconds + 1,
           total_male_debited_paise = total_male_debited_paise + $2,
           total_female_credited_paise = total_female_credited_paise + $3,
           total_platform_revenue_paise = total_platform_revenue_paise + $4,
           total_reward_pool_paise = total_reward_pool_paise + $5,
           carry_millipaise = $6,
           updated_at = NOW()
       WHERE id = $1`,
      [
        session.id,
        debitPaise,
        femaleCredit,
        platformRevenue,
        rewardCredit,
        nextCarrySixtieth,
      ],
    );

    if (maleBalanceAfter === 0) {
      await client.query(
        `UPDATE chat_sessions
         SET status = 'terminated', ended_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [session.id],
      );
      return { keepActive: false, reason: "exhausted" as const };
    }

    return {
      keepActive: true,
      reason: "ok" as const,
      billedSeconds: session.billed_seconds + 1,
      maleBalanceAfter,
      debitPaise,
    };
  });

  if (!billed.keepActive) {
    activeSessionIds.delete(sessionId);
  }
}

async function bootstrap(): Promise<void> {
  app.get("/health", async () => ({
    ok: true,
    service: "billing-service",
    activeSessionCount: activeSessionIds.size,
  }));

  app.post("/v1/wallet/topup", async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = WalletTopupSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const result = await withTransaction(async (client) => {
      await ensureWallet(client, parsed.data.userId, "male");
      const walletRow = await client.query(`SELECT * FROM wallets WHERE user_id = $1 FOR UPDATE`, [parsed.data.userId]);
      const wallet = walletRow.rows[0] as { id: string; balance_paise: number };

      const duplicate = await client.query(
        `SELECT id FROM wallet_ledger WHERE user_id = $1 AND idempotency_key = $2 LIMIT 1`,
        [parsed.data.userId, parsed.data.idempotencyKey],
      );

      if (duplicate.rowCount && duplicate.rowCount > 0) {
        return { balancePaise: wallet.balance_paise, duplicate: true };
      }

      const balanceAfter = wallet.balance_paise + parsed.data.amountPaise;
      await client.query(`UPDATE wallets SET balance_paise = $1, updated_at = NOW() WHERE id = $2`, [
        balanceAfter,
        wallet.id,
      ]);

      await client.query(
        `INSERT INTO wallet_ledger
         (wallet_id, user_id, type, reason, amount_paise, balance_after_paise, idempotency_key, metadata)
         VALUES ($1, $2, 'credit', 'topup', $3, $4, $5, $6)`,
        [
          wallet.id,
          parsed.data.userId,
          parsed.data.amountPaise,
          balanceAfter,
          parsed.data.idempotencyKey,
          JSON.stringify({ source: "manual_topup" }),
        ],
      );

      return { balancePaise: balanceAfter, duplicate: false };
    });

    return result;
  });

  app.post("/v1/rewards/claim", async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = RewardClaimSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    try {
      const result = await withTransaction(async (client) => {
        await ensureWallet(client, parsed.data.userId, "male");

        const walletRow = await client.query(`SELECT * FROM wallets WHERE user_id = $1 FOR UPDATE`, [
          parsed.data.userId,
        ]);
        const rewardPoolRow = await client.query(`SELECT * FROM reward_pool WHERE id = 1 FOR UPDATE`);

        const wallet = walletRow.rows[0] as { id: string; balance_paise: number };
        const rewardPool = rewardPoolRow.rows[0] as { balance_paise: number };

        const duplicate = await client.query(
          `SELECT id FROM reward_pool_ledger WHERE idempotency_key = $1 LIMIT 1`,
          [parsed.data.idempotencyKey],
        );

        if (duplicate.rowCount && duplicate.rowCount > 0) {
          return { balancePaise: wallet.balance_paise, duplicate: true };
        }

        if (rewardPool.balance_paise < parsed.data.amountPaise) {
          throw new Error("insufficient_reward_pool");
        }

        const walletAfter = wallet.balance_paise + parsed.data.amountPaise;
        await client.query(`UPDATE wallets SET balance_paise = $1, updated_at = NOW() WHERE id = $2`, [
          walletAfter,
          wallet.id,
        ]);

        await client.query(`UPDATE reward_pool SET balance_paise = balance_paise - $1, updated_at = NOW() WHERE id = 1`, [
          parsed.data.amountPaise,
        ]);

        await client.query(
          `INSERT INTO reward_pool_ledger
           (amount_paise, type, reason, related_user_id, idempotency_key)
           VALUES ($1, 'debit', 'reward', $2, $3)`,
          [parsed.data.amountPaise, parsed.data.userId, parsed.data.idempotencyKey],
        );

        await client.query(
          `INSERT INTO wallet_ledger
           (wallet_id, user_id, type, reason, amount_paise, balance_after_paise, idempotency_key, metadata)
           VALUES ($1, $2, 'credit', 'reward', $3, $4, $5, $6)`,
          [
            wallet.id,
            parsed.data.userId,
            parsed.data.amountPaise,
            walletAfter,
            parsed.data.idempotencyKey,
            JSON.stringify({ source: "reward_claim" }),
          ],
        );

        return { balancePaise: walletAfter, duplicate: false };
      });

      return result;
    } catch (error) {
      if (error instanceof Error && error.message === "insufficient_reward_pool") {
        return reply.code(409).send({ error: error.message });
      }
      throw error;
    }
  });

  app.get("/v1/wallet/:userId", async (request: FastifyRequest, reply: FastifyReply) => {
    const params = z
      .object({ userId: z.string().uuid() })
      .safeParse((request as { params: unknown }).params);

    if (!params.success) {
      return reply.code(400).send({ error: params.error.flatten() });
    }

    const result = await withTransaction(async (client) => {
      const headerRole = request.headers["x-auth-role"];
      const callerRole: UserRole =
        headerRole === "female" || headerRole === "admin" ? headerRole : "male";

      await ensureWallet(client, params.data.userId, callerRole === "admin" ? "male" : callerRole);
      const walletResult = await client.query(`SELECT * FROM wallets WHERE user_id = $1`, [params.data.userId]);
      return walletResult.rows[0];
    });

    return result;
  });

  app.post("/v1/payouts/request", async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = PayoutRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    if (parsed.data.amountPaise < MIN_PAYOUT_PAISE) {
      return reply.code(409).send({
        error: "below_minimum_payout",
        minimumPaise: MIN_PAYOUT_PAISE,
      });
    }

    try {
      const payout = await withTransaction(async (client) => {
        await ensureWallet(client, parsed.data.femaleUserId, "female");

        const userResult = await client.query(`SELECT role FROM users WHERE id = $1 FOR UPDATE`, [
          parsed.data.femaleUserId,
        ]);
        if (!userResult.rowCount) {
          throw new Error("user_not_found");
        }

        const role = (userResult.rows[0] as { role: string }).role;
        if (role !== "female") {
          throw new Error("not_female_user");
        }

        const duplicateResult = await client.query(
          `SELECT id, status FROM payout_requests WHERE user_id = $1 AND idempotency_key = $2 LIMIT 1`,
          [parsed.data.femaleUserId, parsed.data.idempotencyKey],
        );

        if (duplicateResult.rowCount) {
          const duplicate = duplicateResult.rows[0] as { id: string; status: string };
          return { payoutRequestId: duplicate.id, status: duplicate.status, duplicate: true };
        }

        const walletResult = await client.query(
          `SELECT id, balance_paise, hold_paise FROM wallets WHERE user_id = $1 FOR UPDATE`,
          [parsed.data.femaleUserId],
        );

        const wallet = walletResult.rows[0] as { id: string; balance_paise: number; hold_paise: number };
        const availableBalance = wallet.balance_paise - wallet.hold_paise;
        if (availableBalance < parsed.data.amountPaise) {
          throw new Error("insufficient_available_balance");
        }

        const holdAfter = wallet.hold_paise + parsed.data.amountPaise;
        await client.query(`UPDATE wallets SET hold_paise = $1, updated_at = NOW() WHERE id = $2`, [
          holdAfter,
          wallet.id,
        ]);

        const insertResult = await client.query(
          `INSERT INTO payout_requests
           (user_id, amount_paise, status, idempotency_key)
           VALUES ($1, $2, 'pending', $3)
           RETURNING id, status, created_at`,
          [parsed.data.femaleUserId, parsed.data.amountPaise, parsed.data.idempotencyKey],
        );

        return {
          payoutRequestId: (insertResult.rows[0] as { id: string }).id,
          status: (insertResult.rows[0] as { status: string }).status,
          duplicate: false,
        };
      });

      return payout;
    } catch (error) {
      if (error instanceof Error && error.message === "user_not_found") {
        return reply.code(404).send({ error: error.message });
      }
      if (error instanceof Error && error.message === "not_female_user") {
        return reply.code(403).send({ error: error.message });
      }
      if (error instanceof Error && error.message === "insufficient_available_balance") {
        return reply.code(409).send({ error: error.message });
      }
      throw error;
    }
  });

  app.post("/v1/payouts/:payoutRequestId/review", async (request: FastifyRequest, reply: FastifyReply) => {
    const params = z
      .object({ payoutRequestId: z.string().uuid() })
      .safeParse((request as { params: unknown }).params);
    if (!params.success) {
      return reply.code(400).send({ error: params.error.flatten() });
    }

    const body = PayoutReviewSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: body.error.flatten() });
    }

    try {
      const result = await withTransaction(async (client) => {
        const payoutResult = await client.query(
          `SELECT id, user_id, amount_paise, status
           FROM payout_requests
           WHERE id = $1
           FOR UPDATE`,
          [params.data.payoutRequestId],
        );

        if (!payoutResult.rowCount) {
          throw new Error("payout_not_found");
        }

        const payout = payoutResult.rows[0] as {
          id: string;
          user_id: string;
          amount_paise: number;
          status: "pending" | "approved" | "rejected" | "paid";
        };

        if (payout.status === "rejected" || payout.status === "paid") {
          return { payoutRequestId: payout.id, status: payout.status, noChange: true };
        }

        const walletResult = await client.query(
          `SELECT id, balance_paise, hold_paise FROM wallets WHERE user_id = $1 FOR UPDATE`,
          [payout.user_id],
        );

        const wallet = walletResult.rows[0] as { id: string; balance_paise: number; hold_paise: number };

        if (body.data.status === "rejected") {
          const holdAfter = Math.max(0, wallet.hold_paise - payout.amount_paise);
          await client.query(`UPDATE wallets SET hold_paise = $1, updated_at = NOW() WHERE id = $2`, [
            holdAfter,
            wallet.id,
          ]);
        }

        if (body.data.status === "paid") {
          if (wallet.hold_paise < payout.amount_paise || wallet.balance_paise < payout.amount_paise) {
            throw new Error("insufficient_held_balance");
          }

          const holdAfter = wallet.hold_paise - payout.amount_paise;
          const balanceAfter = wallet.balance_paise - payout.amount_paise;

          await client.query(
            `UPDATE wallets
             SET hold_paise = $1, balance_paise = $2, updated_at = NOW()
             WHERE id = $3`,
            [holdAfter, balanceAfter, wallet.id],
          );

          await client.query(
            `INSERT INTO wallet_ledger
             (wallet_id, user_id, type, reason, amount_paise, balance_after_paise, metadata)
             VALUES ($1, $2, 'debit', 'adjustment', $3, $4, $5)`,
            [
              wallet.id,
              payout.user_id,
              payout.amount_paise,
              balanceAfter,
              JSON.stringify({ source: "manual_payout", payoutRequestId: payout.id }),
            ],
          );
        }

        const updateResult = await client.query(
          `UPDATE payout_requests
           SET status = $1,
               reviewed_by = $2,
               review_note = $3,
               updated_at = NOW()
           WHERE id = $4
           RETURNING id, status, reviewed_by, review_note, updated_at`,
          [body.data.status, body.data.reviewedByUserId, body.data.reviewNote ?? null, payout.id],
        );

        return { ...(updateResult.rows[0] as Record<string, unknown>), noChange: false };
      });

      return result;
    } catch (error) {
      if (error instanceof Error && error.message === "payout_not_found") {
        return reply.code(404).send({ error: error.message });
      }
      if (error instanceof Error && error.message === "insufficient_held_balance") {
        return reply.code(409).send({ error: error.message });
      }
      throw error;
    }
  });

  app.get("/v1/payouts/pending", async () => {
    const result = await db.query(
      `SELECT id, user_id, amount_paise, status, reviewed_by, review_note, created_at, updated_at
       FROM payout_requests
       WHERE status IN ('pending', 'approved')
       ORDER BY created_at ASC`,
    );
    return { payouts: result.rows };
  });

  app.post("/v1/sessions/start", async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = SessionStartSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    try {
      await withTransaction(async (client) => {
        await ensureWallet(client, parsed.data.maleUserId, "male");
        await ensureWallet(client, parsed.data.femaleUserId, "female");

        await client.query(
          `INSERT INTO chat_sessions
           (id, male_user_id, female_user_id, status, mode, rate_per_minute_paise, connected_at)
           VALUES ($1, $2, $3, 'connected', 'paid_verified', $4, $5)`,
          [
            parsed.data.sessionId,
            parsed.data.maleUserId,
            parsed.data.femaleUserId,
            parsed.data.ratePerMinutePaise,
            parsed.data.connectedAt,
          ],
        );
      });
    } catch (error) {
      const pgError = error as { code?: string };
      if (pgError.code === "23505") {
        return reply.code(409).send({ error: "active_paid_session_exists" });
      }
      throw error;
    }

    activeSessionIds.add(parsed.data.sessionId);
    return { status: "started", sessionId: parsed.data.sessionId };
  });

  app.post("/v1/sessions/stop", async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = SessionStopSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const result = await withTransaction(async (client) => {
      const updateResult = await client.query(
        `UPDATE chat_sessions
         SET status = CASE WHEN status = 'connected' THEN 'ended' ELSE status END,
             ended_at = NOW(),
             updated_at = NOW()
         WHERE id = $1
         RETURNING id, status, ended_at`,
        [parsed.data.sessionId],
      );
      return updateResult.rows[0] ?? null;
    });

    activeSessionIds.delete(parsed.data.sessionId);

    if (!result) {
      return reply.code(404).send({ error: "session_not_found" });
    }

    return { status: "stopped", session: result };
  });

  setInterval(() => {
    const sessionIds = Array.from(activeSessionIds);
    for (const sessionId of sessionIds) {
      void billSessionTick(sessionId).catch((error) => {
        app.log.error({ error, sessionId }, "billing_tick_failed");
      });
    }
  }, BILLING_TICK_SECONDS * 1000);

  const activeSessionsResult = await db.query(`SELECT id FROM chat_sessions WHERE status = 'connected'`);
  for (const row of activeSessionsResult.rows as Array<{ id: string }>) {
    activeSessionIds.add(row.id);
  }

  const port = Number(process.env.PORT ?? 4002);
  await app.listen({ host: "0.0.0.0", port });
}

bootstrap().catch((error) => {
  app.log.error(error);
  process.exit(1);
});
