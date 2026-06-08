## Vision
Build Googenie as a fast, modern, keyboard-first email and calendar workspace powered by Corsair integrations and AI-assisted workflows

### Goals
- Deliver a working Gmail + Google Calendar experience with a clean modern UI.
- Enable smart homepage query input that routes users to a Gmail-like results page.

## Monorepo Setup
- Package manager: pnpm
- Workspace layout:
	- `backend` (current API service)
	- `apps/*` (frontend apps, including your upcoming UI)
	- `packages/*` (shared libraries such as future tRPC routers/types)

## Common Commands
- Install dependencies: `pnpm install`
- Run backend in dev mode: `pnpm dev:backend`
- Run backend checks: `pnpm check:backend`