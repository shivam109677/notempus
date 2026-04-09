import { createHmac, randomUUID, timingSafeEqual } from "crypto";

import { config } from "dotenv";
import Fastify from "fastify";
import type { FastifyReply, FastifyRequest } from "fastify";
import { Pool, type PoolClient } from "pg";
import { z } from "zod";

config();

const app = Fastify({ logger: true });

type UserRole = "male" | "female" | "admin";

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const CreateOrderSchema = z.object({
  userId: z.string().uuid(),
  amountPaise: z.number().int().positive(),
  idempotencyKey: z.string().min(8).max(128),
  currency: z.literal("INR").default("INR"),
});

const RazorpayWebhookSchema = z.object({
  event: z.string().min(1),
  payload: z
    .object({
      payment: z
        .object({
          entity: z
            .object({
              id: z.string(),
              order_id: z.string().optional(),
              amount: z.number().int().optional(),
              status: z.string().optional(),
            })
            .partial()
            .passthrough(),
        })
        .optional(),
    })
    .optional(),
  created_at: z.number().optional(),
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

async function ensureWallet(client: PoolClient, userId: string, role: UserRole): Promise<void> {
  await ensureUser(client, userId, role);
  await client.query(
    `INSERT INTO wallets (user_id, balance_paise)
     VALUES ($1, 0)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId],
  );
}

function safeCompareHex(expectedHex: string, actualHex: string): boolean {
  const expectedBuffer = Buffer.from(expectedHex, "hex");
  const actualBuffer = Buffer.from(actualHex, "hex");
  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }
  return timingSafeEqual(expectedBuffer, actualBuffer);
}

async function bootstrap(): Promise<void> {
  app.get("/health", async () => ({ ok: true, service: "payments-service" }));

  app.post("/v1/payments/orders", async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = CreateOrderSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const result = await withTransaction(async (client) => {
      await ensureUser(client, parsed.data.userId, "male");

      const duplicate = await client.query(
        `SELECT id, provider_order_id, status
         FROM payments
         WHERE user_id = $1 AND idempotency_key = $2
         LIMIT 1`,
        [parsed.data.userId, parsed.data.idempotencyKey],
      );

      if (duplicate.rowCount && duplicate.rowCount > 0) {
        const row = duplicate.rows[0] as { id: string; provider_order_id: string; status: string };
        return {
          paymentId: row.id,
          provider: "razorpay",
          providerOrderId: row.provider_order_id,
          status: row.status,
          duplicate: true,
          keyId: process.env.RAZORPAY_KEY_ID ?? null,
        };
      }

      const providerOrderId = `order_${randomUUID().replace(/-/g, "")}`;
      const insertResult = await client.query(
        `INSERT INTO payments
         (user_id, provider, provider_order_id, amount_paise, status, idempotency_key, metadata)
         VALUES ($1, 'razorpay', $2, $3, 'created', $4, $5)
         RETURNING id`,
        [
          parsed.data.userId,
          providerOrderId,
          parsed.data.amountPaise,
          parsed.data.idempotencyKey,
          JSON.stringify({ currency: parsed.data.currency }),
        ],
      );

      return {
        paymentId: (insertResult.rows[0] as { id: string }).id,
        provider: "razorpay",
        providerOrderId,
        status: "created",
        duplicate: false,
        keyId: process.env.RAZORPAY_KEY_ID ?? null,
      };
    });

    return result;
  });

  app.post("/v1/payments/webhooks/razorpay", async (request: FastifyRequest, reply: FastifyReply) => {
    const signature = request.headers["x-razorpay-signature"];
    const eventIdHeader = request.headers["x-razorpay-event-id"];

    if (typeof signature !== "string" || signature.length < 16) {
      return reply.code(401).send({ error: "missing_signature" });
    }

    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) {
      return reply.code(500).send({ error: "webhook_secret_not_configured" });
    }

    const bodyObject = request.body as unknown;
    const parsedBody = RazorpayWebhookSchema.safeParse(bodyObject);
    if (!parsedBody.success) {
      return reply.code(400).send({ error: parsedBody.error.flatten() });
    }

    const payloadRaw = JSON.stringify(bodyObject ?? {});
    const expectedSignature = createHmac("sha256", webhookSecret).update(payloadRaw).digest("hex");

    if (!safeCompareHex(expectedSignature, signature)) {
      return reply.code(401).send({ error: "invalid_signature" });
    }

    const paymentEntity = parsedBody.data.payload?.payment?.entity;
    const providerPaymentId = paymentEntity?.id;
    const providerOrderId = paymentEntity?.order_id;

    const eventId =
      (typeof eventIdHeader === "string" && eventIdHeader.length > 0
        ? eventIdHeader
        : null) ??
      `${parsedBody.data.event}:${providerPaymentId ?? randomUUID()}`;

    const result = await withTransaction(async (client) => {
      const webhookInsert = await client.query(
        `INSERT INTO payment_webhooks (provider, event_id, signature, payload)
         VALUES ('razorpay', $1, $2, $3)
         ON CONFLICT (provider, event_id) DO NOTHING
         RETURNING id`,
        [eventId, signature, bodyObject ?? {}],
      );

      if (!webhookInsert.rowCount) {
        return { duplicate: true, processed: false };
      }

      const webhookId = (webhookInsert.rows[0] as { id: string }).id;

      if (parsedBody.data.event === "payment.captured" && providerOrderId && providerPaymentId) {
        const paymentRow = await client.query(
          `SELECT id, user_id, amount_paise, status
           FROM payments
           WHERE provider = 'razorpay' AND provider_order_id = $1
           FOR UPDATE`,
          [providerOrderId],
        );

        if (paymentRow.rowCount && paymentRow.rowCount > 0) {
          const payment = paymentRow.rows[0] as {
            id: string;
            user_id: string;
            amount_paise: number;
            status: string;
          };

          if (payment.status !== "captured") {
            await client.query(
              `UPDATE payments
               SET status = 'captured', provider_payment_id = $1, updated_at = NOW()
               WHERE id = $2`,
              [providerPaymentId, payment.id],
            );

            await ensureWallet(client, payment.user_id, "male");
            const walletResult = await client.query(
              `SELECT id, balance_paise FROM wallets WHERE user_id = $1 FOR UPDATE`,
              [payment.user_id],
            );

            if (walletResult.rowCount && walletResult.rowCount > 0) {
              const wallet = walletResult.rows[0] as { id: string; balance_paise: number };
              const ledgerIdempotency = `payment_capture:${providerPaymentId}`;

              const duplicateLedger = await client.query(
                `SELECT id FROM wallet_ledger WHERE user_id = $1 AND idempotency_key = $2 LIMIT 1`,
                [payment.user_id, ledgerIdempotency],
              );

              if (!duplicateLedger.rowCount) {
                const balanceAfter = wallet.balance_paise + payment.amount_paise;
                await client.query(
                  `UPDATE wallets
                   SET balance_paise = $1, updated_at = NOW()
                   WHERE id = $2`,
                  [balanceAfter, wallet.id],
                );

                await client.query(
                  `INSERT INTO wallet_ledger
                   (wallet_id, user_id, type, reason, amount_paise, balance_after_paise, idempotency_key, metadata)
                   VALUES ($1, $2, 'credit', 'topup', $3, $4, $5, $6)`,
                  [
                    wallet.id,
                    payment.user_id,
                    payment.amount_paise,
                    balanceAfter,
                    ledgerIdempotency,
                    JSON.stringify({ source: "razorpay_webhook", providerOrderId, providerPaymentId }),
                  ],
                );
              }
            }
          }
        }
      }

      if (parsedBody.data.event === "payment.failed" && providerOrderId) {
        await client.query(
          `UPDATE payments
           SET status = 'failed', updated_at = NOW()
           WHERE provider = 'razorpay' AND provider_order_id = $1`,
          [providerOrderId],
        );
      }

      await client.query(`UPDATE payment_webhooks SET processed_at = NOW() WHERE id = $1`, [webhookId]);
      return { duplicate: false, processed: true };
    });

    return result;
  });

  app.get("/v1/payments/:paymentId", async (request: FastifyRequest, reply: FastifyReply) => {
    const params = z
      .object({ paymentId: z.string().uuid() })
      .safeParse((request as { params: unknown }).params);

    if (!params.success) {
      return reply.code(400).send({ error: params.error.flatten() });
    }

    const result = await db.query(
      `SELECT id, user_id, provider, provider_order_id, provider_payment_id, amount_paise, status, created_at, updated_at
       FROM payments
       WHERE id = $1`,
      [params.data.paymentId],
    );

    if (!result.rowCount) {
      return reply.code(404).send({ error: "payment_not_found" });
    }

    return result.rows[0];
  });

  const port = Number(process.env.PORT ?? 4004);
  await app.listen({ host: "0.0.0.0", port });
}

bootstrap().catch((error) => {
  app.log.error(error);
  process.exit(1);
});
