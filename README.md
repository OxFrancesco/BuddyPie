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

3. In Clerk, enable GitHub login and request GitHub scopes for repo import:
   `repo`
   `read:org` if you need org repo visibility

4. Make sure your Daytona snapshot already contains the `pi` CLI, or override `PI_COMMAND`.

5. Start Convex and the app:

```bash
bun run dev
```

## Required envs

- `VITE_CONVEX_URL`
- `VITE_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `CLERK_JWT_ISSUER_DOMAIN`
- `DAYTONA_API_KEY`
- `BUDDYPIE_X402_PAY_TO`
- `BUDDYPIE_PUBLIC_URL`

## Useful envs

- `DAYTONA_API_URL`
- `DAYTONA_TARGET`
- `DAYTONA_SNAPSHOT`
- `PI_COMMAND`
- `PI_PROVIDER`
- `PI_MODEL`
- `BASE_SEPOLIA_RPC_URL`
- `PRIVATE_KEY`
- `PINATA_JWT`

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
