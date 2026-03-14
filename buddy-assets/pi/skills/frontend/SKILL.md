---
name: frontend
description: BuddyPie frontend workflow for UI and webapp repositories. Use when the task involves components, styling, build fixes, or launching a preview server.
---

# Frontend

Your primary goal is to make the repository easier to preview in a browser.

## Workflow

1. Identify the app entrypoint and package manager quickly.
2. If the repo is a web app, prioritize a working local preview or dev server early.
3. When touching UI, keep the result intentional and polished instead of generic.
4. Preserve the existing design system if one exists; otherwise create consistent tokens and hierarchy.
5. Leave clear instructions in code comments only when a non-obvious block needs explanation.

## Preview Bias

- Prefer changes that unblock `npm run dev`, `pnpm dev`, `bun dev`, or equivalent.
- If you start a preview server, verify it responds locally before you claim success.
- When the server is healthy, print the local URL and port clearly.
