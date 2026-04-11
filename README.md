# Notempus

Concise instructions for starting the project locally and in a full-stack environment.

## ⚡ Quick Start (Copy & Paste)

Run this to start everything:

```bash
export PATH="$PWD/.tools/node/bin:$PATH" && \
export COREPACK_HOME="$PWD/.tools/corepack" && \
.tools/node/bin/pnpm install && \
.tools/node/bin/pnpm dev
```

Then open:
- Web: http://localhost:3000
- Guest chat: http://localhost:3000/chat?guest=true
- API Gateway: http://127.0.0.1:4000
- Other services: http://127.0.0.1:4001–4006

**Prerequisites**
- Node.js 22+ (project uses a workspace-local Node runtime in `.tools/node` if present)
- pnpm 9+ (Corepack can be used to manage pnpm)
- Docker (supports `docker compose`)

**Workspace layout (short)**
- Frontend: `apps/web` (Next.js)
- Backend services: `apps/*` (TypeScript + Fastify)
- Infra: `infra/docker-compose.yml`

**Local development - quick start**
1. Copy environment template and update secrets:

	```bash
	cp .env.example .env
	# edit .env as needed
	```

2. Set up workspace-local Node and install dependencies:

    ```bash
    export PATH="$PWD/.tools/node/bin:$PATH"
    export COREPACK_HOME="$PWD/.tools/corepack"
    .tools/node/bin/pnpm install
    ```

3. Start all dev servers (web + backends in parallel):

    ```bash
    export PATH="$PWD/.tools/node/bin:$PATH"
    export COREPACK_HOME="$PWD/.tools/corepack"
    .tools/node/bin/pnpm dev
    ```

    This starts:
    - Web UI: http://localhost:3000
    - API Gateway: http://127.0.0.1:4000
    - Matching Service: http://127.0.0.1:4001
    - Signaling Service: http://127.0.0.1:4003
    - Payments Service: http://127.0.0.1:4004
    - Verification Service: http://127.0.0.1:4005
    - Moderation Service: http://127.0.0.1:4006

4. (Optional) Start only the web frontend (hot reload):

    ```bash
    export PATH="$PWD/.tools/node/bin:$PATH"
    export COREPACK_HOME="$PWD/.tools/corepack"
    .tools/node/bin/pnpm --filter web dev
    ```

5. Start full-stack with Docker (infra + services containerized):

    ```bash
    docker compose -f infra/docker-compose.yml up --build
    # or run detached:
    docker compose -f infra/docker-compose.yml up --build -d
    ```

6. Stop containers:
	```bash
	# build + run a single service example (matching-service)
	# from repo root:
	pnpm --filter matching-service dev
	```

	If a service lacks a `dev` script, run its compiled output or use `ts-node` per its `package.json` scripts.

**Production (compose) - summary**
1. Create `.env` from `.env.example` and set production secrets and domain variables (`APP_DOMAIN`, `LETSENCRYPT_EMAIL`, `NEXT_PUBLIC_GATEWAY_URL`, `NEXT_PUBLIC_SIGNALING_WS_URL`).
2. Start production compose stack:

	```bash
	docker compose -f infra/docker-compose.prod.yml up --build -d
	```

3. To stop the production stack:

	```bash
	docker compose -f infra/docker-compose.prod.yml down --remove-orphans
	```

**Common commands**
```bash
# Set up environment (run once per shell session)
export PATH="$PWD/.tools/node/bin:$PATH"
export COREPACK_HOME="$PWD/.tools/corepack"

# Install deps
.tools/node/bin/pnpm install

# Workspace typecheck
.tools/node/bin/pnpm typecheck

# Run web dev
.tools/node/bin/pnpm --filter web dev

# Run a service dev (example: matching-service)
.tools/node/bin/pnpm --filter matching-service dev

# Start all services in parallel
.tools/node/bin/pnpm dev

# Start local infra (Docker)
docker compose -f infra/docker-compose.yml up --build
```

**Notes & troubleshooting**
- The repository may use a workspace-local Node runtime at `.tools/node`. If commands fail due to the Node binary missing, either install Node globally or place the binary at `.tools/node/bin/node` as documented in the project's setup notes.
- If you prefer process management in production, run `gunicorn` with `uvicorn.workers.UvicornWorker` for Python ASGI apps; this repo is TypeScript/Node-first so this is optional.

If you want, I can also:
- add a `make` helper or `scripts/dev.md` with step-by-step start examples;
- create a small `scripts/dev` that brings up selective services for faster iteration.

