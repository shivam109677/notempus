<<<<<<< HEAD
# notempus
=======
# Notempus MVP

## Local Node runtime

This repository intentionally does not track the local Node runtime stored under `.tools/node`.
If you need to run the project locally, download the appropriate Node binary and place it at `.tools/node/bin/node` (or install Node via your preferred method). Example using Corepack/Node download tooling in this project:

  1. Install Node locally (one option):

	  ```bash
	  corepack enable
	  # or use asdf/nvm/homebrew as you prefer to install matching Node version
	  ```

  2. Create the expected folder if needed:

	  ```bash
	  mkdir -p .tools/node/bin
	  # place the node binary at .tools/node/bin/node
	  ```

After placing the runtime, you can run local tooling. The `.tools/` directory is ignored from git; do not commit it. If you're preparing to push, contact the repository owner or follow the project CONTRIBUTING guidelines.


Trust-first random video chat platform MVP with monetized verified chat.

## Stack

- Frontend: Next.js (apps/web)
- Backend: TypeScript services (apps/*)
- Data: PostgreSQL + Redis
- Media: WebRTC with STUN/TURN
- Infra: Docker Compose for local development

## Services

- `api-gateway`: JWT auth, REST aggregation, health checks
- `matching-service`: queue-based matching and offer lifecycle
- `billing-service`: per-second debits/credits and wallet ledger
- `signaling-service`: WebSocket signaling for WebRTC offer/answer/ICE
- `payments-service`: order creation + webhook verification + idempotent wallet credit
- `verification-service`: selfie upload, liveness checks, admin verification review
- `moderation-service`: reports, blocks, fraud signals, moderation actions
- `shared-contracts`: shared zod schemas and event contracts

## Quick Start

Prerequisites:
- Node.js 22+
- pnpm 9+
- Docker (with `docker compose` support)

1. Copy `.env.example` to `.env` and update secrets.
2. Install dependencies: `pnpm install`.
3. Start infra and services: `docker compose up --build`.
4. Open the web app at `http://localhost:3000`.

## App Experience

- Real WebRTC call flow in the web app (local and remote video)
- Matching journey (go-live, queue, accept)
- Session billing controls (start/stop)
- Wallet topup, payment order creation, payout request
- Verification, reporting, and fraud telemetry actions

## Core Invariants

- Male wallet cannot go negative.
- Reward pool cannot go negative.
- Only one active paid session per male user.
- Billing starts only when session is connected.
- Payment and webhook operations are idempotent.

## Repository Layout

- `apps/web` - Next.js UI shell
- `apps/api-gateway` - entry API service
- `apps/matching-service` - matchmaking queues and state machine
- `apps/billing-service` - billing and wallet ledger
- `apps/signaling-service` - WebRTC signaling server
- `packages/shared-contracts` - contracts shared across services
- `infra/sql/migrations` - PostgreSQL schema
- `infra/docker-compose.yml` - local orchestrator

## Current Status

- Completed: API gateway reverse-proxy with JWT auth and route-level role guards.
- Completed: automated telemetry-driven anti-fraud worker in moderation-service.
- Completed: integrated frontend app with live WebRTC signaling and backend workflows.
- Completed: browser e2e coverage for two-user match and call flow in web app.
- Completed: production deployment edge with TLS termination and secure websocket signaling path.
- Completed: GitHub Actions workflow for building and pushing deploy images.

## Deployment

Use the production compose stack:

1. Create `.env` from `.env.example` and set production secrets.
2. Set production domain variables in `.env`:
	- `APP_DOMAIN`
	- `LETSENCRYPT_EMAIL`
	- `NEXT_PUBLIC_GATEWAY_URL=https://<app-domain>`
	- `NEXT_PUBLIC_SIGNALING_WS_URL=wss://<app-domain>/ws`
	- `SIGNALING_WS_URL=wss://<app-domain>/ws`
3. Start stack: `docker compose -f infra/docker-compose.prod.yml up --build -d`
4. App endpoint:
	- `https://<app-domain>`
	- Edge routing: `/v1/*` -> API gateway, `/ws` -> signaling service

To stop:

- `docker compose -f infra/docker-compose.prod.yml down --remove-orphans`

## Tests

- Run workspace typecheck: `pnpm typecheck`
- Run browser e2e for two-user match and call journey: `pnpm --filter web test:e2e`

## CI/CD

- `CI` workflow runs typecheck and Playwright web e2e on pull requests and `main`.
- `Build and Push Images` workflow builds and pushes service images to GHCR on `main` and tags.
>>>>>>> be06456 (First commit)
