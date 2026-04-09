import { z } from "zod";

export const ChatModeSchema = z.enum(["free", "paid_verified"]);
export type ChatMode = z.infer<typeof ChatModeSchema>;

export const JoinMatchRequestSchema = z.object({
  userId: z.string().uuid(),
  mode: ChatModeSchema,
  preferredLanguage: z.string().min(2).max(20).optional(),
  interestTags: z.array(z.string().max(40)).max(8).optional(),
  mood: z.enum(["chill", "curious", "playful", "serious"]).optional(),
  intent: z.enum(["chat", "learn", "entertain"]).optional(),
});
export type JoinMatchRequest = z.infer<typeof JoinMatchRequestSchema>;

export const JoinMatchResponseSchema = z.object({
  requestId: z.string().uuid(),
  status: z.enum(["queued", "offered"]),
  estimatedWaitSeconds: z.number().int().nonnegative(),
});
export type JoinMatchResponse = z.infer<typeof JoinMatchResponseSchema>;

export const MatchResponseSchema = z.object({
  requestId: z.string().uuid(),
  femaleUserId: z.string().uuid(),
  response: z.enum(["accept", "reject"]),
});
export type MatchResponse = z.infer<typeof MatchResponseSchema>;

export const SessionStartSchema = z.object({
  sessionId: z.string().uuid(),
  maleUserId: z.string().uuid(),
  femaleUserId: z.string().uuid(),
  connectedAt: z.string().datetime(),
  ratePerMinutePaise: z.number().int().positive(),
});
export type SessionStart = z.infer<typeof SessionStartSchema>;

export const BillingUpdateSchema = z.object({
  sessionId: z.string().uuid(),
  billedSeconds: z.number().int().nonnegative(),
  maleDebitedPaise: z.number().int().nonnegative(),
  femaleCreditedPaise: z.number().int().nonnegative(),
  platformRevenuePaise: z.number().int().nonnegative(),
  rewardPoolCreditedPaise: z.number().int().nonnegative(),
  maleBalancePaise: z.number().int().nonnegative(),
});
export type BillingUpdate = z.infer<typeof BillingUpdateSchema>;

export const SignalEventSchema = z.enum([
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
]);
export type SignalEvent = z.infer<typeof SignalEventSchema>;

export const IdempotencyHeader = "x-idempotency-key";
