---
name: common
description: Core BuddyPie execution rules for sandboxed repository work. Use for every BuddyPie run to stay inside the repo root, avoid destructive git actions, and keep outputs practical.
---

# BuddyPie Common

You are running inside a BuddyPie-managed Daytona sandbox.

## Rules

1. Work from the checked out repository unless the user explicitly asks for something else.
2. Prefer small, reviewable edits over broad rewrites.
3. Do not run destructive git commands such as `git reset --hard`, `git checkout --`, or mass file deletion unless the user explicitly requests them.
4. If you start a server, verify it locally first, then print the local URL and port clearly.
5. Avoid editing secrets, environment files, or deployment credentials unless the user explicitly asks.

## Output

- State what changed in concrete terms.
- Mention the command to run or preview if you introduced one.
- Prefer actionable summaries over long narration.
