# BuddyPie

BuddyPie is a TanStack Start + Clerk + Convex app for running paid coding agents inside persistent Daytona sandboxes. The MVP ships two platform-owned agent profiles:

- `frontend`: UI/build/dev-server oriented
- `docs`: README / API docs / changelog oriented

Each imported GitHub repo gets one persistent Daytona sandbox. Paid runs use x402 on Base Sepolia, PI runs in RPC mode inside the sandbox, and frontend runs can surface a signed Daytona preview URL back into the app.

## Stack

- TanStack Start
- Clerk GitHub OAuth
- Convex
- Daytona
- PI coding agent in RPC mode
- x402 on Base Sepolia
- ERC-8004 agent registration via `agent0-sdk`

## Local setup

1. Install dependencies:

```bash
bun install
```

2. Copy `.env.example` to `.env` and fill in the required values.
   The repo scripts also auto-load `.env.local`, which is convenient for local Daytona and E2E runs.

3. In Clerk, enable GitHub login and request GitHub scopes for repo import:
   `repo`
   `read:org` if you need org repo visibility

4. Create the Daytona snapshot that BuddyPie expects:

```bash
bun run snapshot:create --verify
```

5. If you prefer a different snapshot name, set `DAYTONA_SNAPSHOT` and create that snapshot instead.

6. Start Convex and the app:

```bash
bun run dev
```

## Required envs

- `VITE_CONVEX_URL`
- `VITE_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `CLERK_JWT_ISSUER_DOMAIN`
- `DAYTONA_API_KEY`
- `BUDDYPIE_X402_PAY_TO` - Base Sepolia `0x...` address that receives x402 payments
- `BUDDYPIE_PUBLIC_URL`

## Useful envs

- `DAYTONA_API_URL`
- `DAYTONA_TARGET`
- `DAYTONA_SNAPSHOT`
- `PI_COMMAND`
- `PI_PROVIDER`
- `PI_MODEL`
- `X402_FACILITATOR_URL` - defaults to `https://x402.org/facilitator`
- `BASE_SEPOLIA_RPC_URL`
- `PRIVATE_KEY`
- `PINATA_JWT`
- `BUDDYPIE_E2E_GITHUB_REPO`
- `BUDDYPIE_E2E_GITHUB_TOKEN`

## Daytona snapshot lifecycle

BuddyPie now ships a repo-local Daytona snapshot script for the expected `buddypie-pi-base-v2` image:

```bash
bun run snapshot:create
```

Useful flags:

- `--verify` creates an ephemeral sandbox from the snapshot and checks `node`, `npm`, `pnpm`, `bun`, `git`, `python3`, `rg`, and `pi`
- `--replace` deletes and recreates the snapshot with the same name
- `--name`, `--image`, `--cpu`, `--memory`, `--disk` override the defaults

## Daytona E2E

There is now a live Daytona E2E script that exercises:

- snapshot provisioning / verification
- sandbox creation
- repo clone
- Daytona git branch / commit / push
- GitHub pull request creation when a writable token is available
- PI RPC startup and preview URL detection

Run it with:

```bash
bun run e2e:daytona
```

Useful flags:

- `--repo owner/repo`
- `--replace-snapshot`
- `--skip-pr`
- `--skip-pi`
- `--keep-sandbox`

The script writes a JSON report under `artifacts/`.

## Registration

BuddyPie exposes public agent protocol endpoints at:

- `/agents/frontend/.well-known/agent-card.json`
- `/agents/docs/.well-known/agent-card.json`
- `/agents/:slug/a2a`
- `/agents/:slug/mcp`
- `/agents/:slug/registration.json`

To inspect the registration payloads without sending transactions:

```bash
bun run register:agents:dry
```

To register both agents on Base Sepolia using the BuddyPie-hosted registration URL:

```bash
bun run register:agents
```

Optional modes:

- `bun run scripts/register-erc8004.ts --ipfs`
- `bun run scripts/register-erc8004.ts --onchain-data`

`--ipfs` requires `PINATA_JWT`. The default mode uses `registerHTTP(...)`, which keeps setup lighter for the hackathon.

## Notes

- Workspace import is free.
- Starting a run is x402-gated.
- Public A2A/MCP execution is intended for public repos only in this MVP.
- BuddyPie-owned PI skills/extensions live in [`buddy-assets/pi`](/Volumes/T6-7/Coding/Personal/BuddyPie/buddy-assets/pi).
