# Implementation Runbook

## 1. Prerequisites

- Docker Desktop (or Docker Engine + Compose plugin)
- Node.js 20+ (optional for host dev)
- pnpm via Corepack (optional for host dev)

## 2. Environment Setup

1. Copy environment template:
   - `cp .env.example .env`
2. Update secrets in `.env`:
   - `JWT_SECRET`
   - Razorpay keys if payment service is added
3. For production TLS + WSS deployment, set:
  - `APP_DOMAIN`
  - `LETSENCRYPT_EMAIL`
  - `NEXT_PUBLIC_GATEWAY_URL=https://<app-domain>`
  - `NEXT_PUBLIC_SIGNALING_WS_URL=wss://<app-domain>/ws`
  - `SIGNALING_WS_URL=wss://<app-domain>/ws`

## 3. Start the Stack

From repository root:

```bash
docker compose -f infra/docker-compose.yml up --build
```

VS Code tasks are available in `.vscode/tasks.json`:

- `stack:up`
- `stack:down`
- `workspace:typecheck`

Expected endpoints:

- Web: `http://localhost:3000`
- API Gateway: `http://localhost:4000/health`
- Matching: `http://localhost:4001/health`
- Billing: `http://localhost:4002/health`
- Signaling: `http://localhost:4003/health`
- Payments: `http://localhost:4004/health`
- Verification: `http://localhost:4005/health`
- Moderation: `http://localhost:4006/health`

Production stack command:

```bash
docker compose -f infra/docker-compose.prod.yml up --build -d
```

Production public endpoint:

- `https://<app-domain>`

The edge proxy terminates TLS and routes:

- `/v1/*` to API gateway
- `/ws` to signaling service

## 4. Smoke Test Flow

1. Create two users in DB (`male`, `female`) and wallets.
2. Mint JWTs from API gateway (male and female):

```bash
curl -X POST http://localhost:4000/v1/auth/token \
  -H 'content-type: application/json' \
  -d '{"userId":"<male-uuid>","role":"male"}'

curl -X POST http://localhost:4000/v1/auth/token \
  -H 'content-type: application/json' \
  -d '{"userId":"<female-uuid>","role":"female"}'
```

3. Mark female available:

```bash
curl -X POST http://localhost:4000/v1/female/available \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer <female-jwt>' \
  -d '{"femaleUserId":"<female-uuid>"}'
```

4. Male joins paid queue:

```bash
curl -X POST http://localhost:4000/v1/match/join \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer <male-jwt>' \
  -d '{"userId":"<male-uuid>","mode":"paid_verified"}'
```

5. Female accepts offer:

```bash
curl -X POST http://localhost:4000/v1/match/respond \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer <female-jwt>' \
  -d '{"requestId":"<request-uuid>","femaleUserId":"<female-uuid>","response":"accept"}'
```

6. Top up male wallet:

```bash
curl -X POST http://localhost:4000/v1/wallet/topup \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer <male-jwt>' \
  -d '{"userId":"<male-uuid>","amountPaise":5000,"idempotencyKey":"topup-001"}'
```

7. Start connected session:

```bash
curl -X POST http://localhost:4000/v1/sessions/start \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer <male-jwt>' \
  -d '{
    "sessionId":"<session-uuid>",
    "maleUserId":"<male-uuid>",
    "femaleUserId":"<female-uuid>",
    "connectedAt":"2026-03-31T12:00:00.000Z",
    "ratePerMinutePaise":1000
  }'
```

8. Verify balances and session totals after a few seconds.

## 5. Payments and Verification Smoke Tests

1. Create payment order:

```bash
curl -X POST http://localhost:4004/v1/payments/orders \
  -H 'content-type: application/json' \
  -d '{"userId":"<male-uuid>","amountPaise":10000,"idempotencyKey":"order-001"}'
```

2. Upload selfie:

```bash
curl -X POST http://localhost:4005/v1/verification/selfie \
  -H 'content-type: application/json' \
  -d '{"userId":"<female-uuid>","selfieUrl":"https://example.com/selfie.jpg"}'
```

3. Submit live check:

```bash
curl -X POST http://localhost:4005/v1/verification/live-check \
  -H 'content-type: application/json' \
  -d '{
    "userId":"<female-uuid>",
    "liveCaptureUrl":"https://example.com/live.mp4",
    "blinkDetected":true,
    "headMovementDetected":true,
    "faceMatchScore":0.92,
    "livenessScore":0.93
  }'
```

## 6. Operational Controls

- Stop session manually:

```bash
curl -X POST http://localhost:4002/v1/sessions/stop \
  -H 'content-type: application/json' \
  -d '{"sessionId":"<session-uuid>","reason":"normal"}'
```

- Claim reward (if reward pool funded):

```bash
curl -X POST http://localhost:4002/v1/rewards/claim \
  -H 'content-type: application/json' \
  -d '{"userId":"<male-uuid>","amountPaise":100,"idempotencyKey":"reward-001"}'
```

- Request female payout hold:

```bash
curl -X POST http://localhost:4002/v1/payouts/request \
  -H 'content-type: application/json' \
  -d '{"femaleUserId":"<female-uuid>","amountPaise":10000,"idempotencyKey":"payout-001"}'
```

- Submit moderation report:

```bash
curl -X POST http://localhost:4006/v1/reports \
  -H 'content-type: application/json' \
  -d '{"reporterUserId":"<male-uuid>","reportedUserId":"<female-uuid>","reason":"abuse"}'
```

## 7. Failure/Edge Case Checklist

- Male disconnect mid-session: stop endpoint should mark ended/terminated.
- Zero balance: billing loop should terminate session automatically.
- Duplicate topup idempotency key: no double credit.
- Reward pool depletion: reward claim returns conflict.
- Female reject timeout path: request requeued and redispatched.
- Duplicate payment webhook event ID: ignored idempotently.
- Low-confidence liveness: stays pending for admin review.
- Shared device fingerprint across many users: fraud signal raised.

## 8. Next Implementation Tasks

- Completed: API gateway reverse-proxy and JWT guard per route.
- Completed: automated anti-fraud worker fed by client telemetry events (`POST /v1/fraud/telemetry`).
- Completed: browser e2e test for two-user match and call flow (`pnpm --filter web test:e2e`).
- Completed: GH Actions workflow for Docker image build/push to GHCR.
- Pending: integration tests for payout state transitions and webhook replay attacks.
- Pending: admin dashboard for verification and moderation queues.
