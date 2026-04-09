# Trust-First Video Chat MVP Architecture

## 1) Full System Architecture Diagram (Text)

```text
[Web / Mobile Client]
  | HTTPS + WSS
  v
[API Gateway] ------------------------------> [Auth/JWT]
  | REST inventory + token mint                      |
  |                                                  v
  |----> [Matching Service] <---- Redis ----> [Presence + Queues]
  |             |                                       |
  |             v                                       |
  |         Match events ------------------------------|
  |
  |----> [Signaling Service (WebSocket)]
  |             |
  |             v
  |         WebRTC Offer/Answer/ICE
  |             |
  |             v
  |       [Client <-> Client Media]
  |             |
  |             +--> TURN relay fallback via [Coturn]
  |
  |----> [Billing Service] ---- SQL Tx ----> [PostgreSQL]
  |              |                                |
  |              +--> Reward pool & wallet ledger |
  |
  +----> [Payments Service] <--> [Razorpay]
                 |
                 v
             Webhooks (idempotent)

[Verification Service]
  -> selfie + liveness + admin review

[Moderation Service]
  -> reports, blocks, fraud signals, enforcement actions
```

## 2) Database Schema (Tables + Fields)

Implemented migrations in `infra/sql/migrations/001_init.sql`, `infra/sql/migrations/002_seed_reward_pool.sql`, and `infra/sql/migrations/003_trust_and_ops.sql`.

- `users`
  - `id UUID PK`, `role`, `email`, `phone`, `password_hash`
  - `is_active`, `is_shadow_banned`, `verification_status`
  - `created_at`, `updated_at`

- `wallets`
  - `id UUID PK`, `user_id UNIQUE FK users(id)`
  - `balance_paise BIGINT >= 0`, `hold_paise BIGINT >= 0`
  - `created_at`, `updated_at`

- `wallet_ledger` (immutable money movements)
  - `id UUID PK`, `wallet_id FK`, `user_id FK`, `session_id UUID`
  - `type (debit|credit)`, `reason`
  - `amount_paise > 0`, `balance_after_paise >= 0`
  - `idempotency_key`, `metadata JSONB`, `created_at`
  - Unique partial index: `(user_id, idempotency_key)` when key present

- `reward_pool` (singleton row)
  - `id SMALLINT PK CHECK id=1`, `balance_paise >=0`, `updated_at`

- `reward_pool_ledger`
  - `id UUID PK`, `amount_paise`, `type`, `reason`
  - `related_user_id`, `related_session_id`, `idempotency_key`, `created_at`

- `match_requests`
  - `id UUID PK`, `male_user_id FK`, `mode`, `status`
  - `offered_female_user_id FK`, `requested_at`, `responded_at`, `expires_at`, `metadata`

- `chat_sessions`
  - `id UUID PK`
  - `male_user_id FK`, `female_user_id FK`
  - `status`, `mode`, `rate_per_minute_paise`
  - `connected_at`, `ended_at`
  - `billed_seconds`
  - totals: male debit, female credit, platform revenue, reward pool credit
  - `carry_millipaise` (used as sub-paise carry bucket)
  - `created_at`, `updated_at`
  - Critical unique partial index:
    - one active paid session per male when status in `(created, connected)`

- `payments`
  - `id UUID PK`, `user_id FK`, provider IDs, `amount_paise`, `status`
  - `idempotency_key`, `metadata`, `created_at`, `updated_at`

- `payment_webhooks`
  - `id UUID PK`, `provider`, `event_id`, `signature`, `payload`, `processed_at`
  - Unique `(provider, event_id)`

- `reports`
  - `id UUID PK`, reporter/reported FK, optional `session_id`, `reason`, `details`, `status`, `created_at`

- `user_blocks`
  - `id UUID PK`, `blocker_user_id`, `blocked_user_id`, `created_at`
  - Unique `(blocker_user_id, blocked_user_id)`

- `verification_profiles`
  - `id UUID PK`, `user_id UNIQUE FK`
  - selfie/live capture URLs, scores, `status`, reviewer metadata

- `liveness_checks`
  - `id UUID PK`, `user_id`, optional `session_id`
  - challenge type, score, status, metadata, `created_at`

- `fraud_signals`
  - `id UUID PK`, `user_id`, optional `session_id`
  - signal type, severity, confidence, status, metadata, `created_at`

- `moderation_actions`
  - `id UUID PK`, actor/target/session references
  - action type, reason, metadata, `created_at`

- `user_device_fingerprints`
  - `id UUID PK`, `user_id`, `fingerprint_hash`, metadata, `created_at`
  - uniqueness: `(user_id, fingerprint_hash)`

- `payout_requests`
  - `id UUID PK`, `user_id`, `amount_paise`, `status`, `idempotency_key`
  - reviewer metadata and timestamps

- `referral_events`
  - `id UUID PK`, `referrer_user_id`, `referred_user_id`
  - `reward_paise`, `status`, `created_at`
  - Unique `(referrer_user_id, referred_user_id)`

## 3) API Design (REST + WebSocket)

### API Gateway (`apps/api-gateway`)
- `GET /health`
- `GET /v1/config/public`
- `POST /v1/auth/token`
  - body: `{ userId, role }`
  - returns JWT
- `GET /v1/apis`

### Matching Service (`apps/matching-service`)
- `GET /health`
- `POST /v1/female/available`
  - body: `{ femaleUserId }`
- `POST /v1/match/join`
  - body: `{ userId, mode, preferredLanguage? }`
  - returns: `{ requestId, status, estimatedWaitSeconds }`
- `POST /v1/match/respond`
  - body: `{ requestId, femaleUserId, response: accept|reject }`
- `POST /v1/match/leave`
  - body: `{ requestId }`
- `POST /v1/match/dispatch` (worker/manual dispatch trigger)
- `GET /v1/match/:requestId`

### Billing Service (`apps/billing-service`)
- `GET /health`
- `POST /v1/wallet/topup`
  - body: `{ userId, amountPaise, idempotencyKey }`
- `GET /v1/wallet/:userId`
- `POST /v1/rewards/claim`
  - body: `{ userId, amountPaise, idempotencyKey }`
- `POST /v1/sessions/start`
  - body uses shared `SessionStartSchema`
- `POST /v1/sessions/stop`
  - body: `{ sessionId, reason }`
- `POST /v1/payouts/request`
  - body: `{ femaleUserId, amountPaise, idempotencyKey }`
- `POST /v1/payouts/:payoutRequestId/review`
  - body: `{ reviewedByUserId, status, reviewNote? }`
- `GET /v1/payouts/pending`

### Payments Service (`apps/payments-service`)
- `GET /health`
- `POST /v1/payments/orders`
  - body: `{ userId, amountPaise, idempotencyKey, currency }`
- `POST /v1/payments/webhooks/razorpay`
  - verifies signature and credits wallet idempotently
- `GET /v1/payments/:paymentId`

### Verification Service (`apps/verification-service`)
- `GET /health`
- `POST /v1/verification/selfie`
- `POST /v1/verification/live-check`
- `POST /v1/verification/admin/review`
- `GET /v1/verification/:userId`

### Moderation Service (`apps/moderation-service`)
- `GET /health`
- `POST /v1/reports`
- `POST /v1/blocks`
- `POST /v1/moderation/actions`
- `POST /v1/fraud/signal`
- `POST /v1/fraud/device-fingerprint`
- `GET /v1/reports/open`

### Signaling Service (`apps/signaling-service`)
- `GET /health`
- `WSS /ws?sessionId=<uuid>&userId=<uuid>&token=<jwt>`

WebSocket events supported:
- `webrtc.offer`
- `webrtc.answer`
- `webrtc.ice`
- `session.connected`
- `session.heartbeat`
- `session.terminate`
- `billing.update`
- `match.proposed`
- `match.accepted`
- `match.rejected`

## 4) WebRTC Signaling Flow

1. Male joins paid queue and receives `requestId`.
2. Matching proposes female candidate.
3. Female accepts within timeout.
4. Backend creates `sessionId`, client opens WSS to signaling with JWT.
5. Caller sends `webrtc.offer` via signaling service.
6. Callee returns `webrtc.answer`.
7. Both peers exchange `webrtc.ice` candidates.
8. On ICE connected, client emits `session.connected` (then billing starts server-side).
9. During session, client emits `session.heartbeat` periodically.
10. On network degradation, client triggers ICE restart (new offer/answer cycle).
11. If no viable video path, client requests audio-only profile.
12. On disconnect/insufficient balance/moderation action, backend emits `session.terminate`.

## 5) Billing Logic (Step-by-Step)

1. Billing starts only after `POST /v1/sessions/start` with connected timestamp.
2. Billing engine keeps in-memory active session IDs and ticks every second.
3. For each tick, service opens a SQL transaction and locks:
   - `chat_sessions` row (`FOR UPDATE`)
   - male wallet row (`FOR UPDATE`)
   - female wallet row (`FOR UPDATE`)
   - reward pool row (`FOR UPDATE`)
4. Compute per-second debit with deterministic carry:
   - `debitPaise = floor((ratePerMinutePaise + carry)/60)`
   - `nextCarry = (ratePerMinutePaise + carry) % 60`
5. If male balance insufficient for next tick debit:
   - mark session `terminated`
   - stop billing loop for this session
6. Otherwise split debit:
   - female share = `floor(debit * 5000 / 10000)`
   - platform share = `floor(debit * 3000 / 10000)`
   - reward share = `debit - female - platform`
7. Persist atomically:
   - male wallet debit + ledger entry
   - female wallet credit + ledger entry
   - reward pool credit + reward pool ledger
   - session cumulative totals + billed seconds + carry update
8. If male balance becomes zero after debit, terminate session immediately.
9. `POST /v1/sessions/stop` closes session from user/moderation/network path.

## 6) Matching Algorithm (Pseudo-code)

```pseudo
function joinQueue(maleUserId, mode):
  requestId = uuid()
  save match_request(requestId, maleUserId, mode, status=queued)
  push requestId to queue(mode)
  dispatchOnce()
  return requestId + estimatedWait

function dispatchOnce():
  femaleId = SPOP(female_available_pool)
  if femaleId == null: return NO_FEMALE

  requestId = RPOP(male_queue_paid)
  if requestId == null:
    requestId = RPOP(male_queue_free)
  if requestId == null:
    SADD(female_available_pool, femaleId)
    return NO_MALE

  req = get match_request(requestId)
  if req invalid or cancelled:
    SADD(female_available_pool, femaleId)
    return NO_MALE

  mark req offered to femaleId with expiry now + 5s
  set ephemeral offer key EX 5s
  publish offer to female channel
  return DISPATCHED

function femaleRespond(requestId, femaleId, response):
  req = get match_request(requestId)
  assert req.status == offered and req.offered_female == femaleId

  if response == accept:
    mark matched
    emit match.accepted to male
    create session orchestration flow
  else:
    mark queued
    SADD(female_available_pool, femaleId)
    LPUSH requestId back to original queue
    dispatchOnce()
```

## 7) Deployment Plan

### Local MVP
- Use `infra/docker-compose.yml`.
- Containers:
  - postgres
  - redis
  - db-migrate
  - coturn
  - api-gateway
  - matching-service
  - billing-service
  - signaling-service
  - web

### Cloud MVP (AWS/GCP)
- Put services in containers on ECS/Fargate or GKE.
- Managed PostgreSQL (RDS/Cloud SQL) with automated backups.
- Managed Redis (Elasticache/Memorystore).
- Coturn on autoscaled VM group with UDP-friendly LB.
- API gateway and signaling behind L7 load balancer.
- JWT secret in secret manager.
- Centralized logging and tracing (OpenTelemetry).

## 8) Future Scaling Improvements

- Move dispatch worker from API path to dedicated queue consumers.
- Introduce durable event bus (Kafka/NATS) for billing and moderation pipelines.
- Add region-aware matching and TURN selection for low RTT.
- Add session admission control based on TURN capacity.
- Implement outbox pattern for wallet and payment events.
- Add anti-fraud ML scoring service for replay/static feed detection.
- Add idempotent webhook processor with dead-letter queue.
- Add read models for analytics to offload OLTP database.
- Add multi-region active-active signaling with geo routing.
- Add SLOs and autoscaling policies on match latency, tick backlog, and relay bandwidth.
