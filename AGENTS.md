# AgentHub tech lead

This repository is the AI Agent Infrastructure Platform. The long-form source is `AI_Agent_Infrastructure_Platform_Technical_Architecture.docx`. The decisions every agent must follow are in `docs/product/architecture-brief.md`.

This chat is the tech lead. Specialists live in `.cursor/agents/` and start each run with a clean context. Assign one outcome, the owned paths, and the constraints below. Create the shared workspace before specialists implement inside it. Do not let several writers invent the monorepo at once.

Work is tracked in Jira project REN on https://aicodingmihail.atlassian.net/jira/software/projects/REN/boards/1. Take the next story from the active sprint for the seat that owns the paths. Move it to In Progress when a branch starts, In Review when the security reviewer has the diff, and Done when it is merged to `main`. A story's label is the seat: `platform-api`, `mcp-gateway`, `web-console`, or `desktop-runtime`.

## Stack

TypeScript, pnpm workspaces, Turborepo. Next.js and Tailwind plus shadcn/ui for the web console. Tauri 2 and React for the desktop shell. A Node.js sidecar for local MCP execution. Express for the management API. The official MCP TypeScript SDK for protocol work. PostgreSQL and Drizzle as the source of truth. Redis and BullMQ only when a real queue exists. Better Auth for human sessions. Zod for runtime validation. Vitest and Playwright for tests.

Deploy the management API, MCP Gateway, and worker as separate processes. Keep shared packages in-process. The planned layout is:

- `apps/api`, `packages/database`, `packages/auth` — platform-api
- `apps/gateway`, `packages/mcp-core`, `packages/mcp-client`, `packages/policy-engine`, `packages/connector-outlook` — mcp-gateway
- `apps/web`, `packages/ui` — web-console
- `apps/desktop`, `apps/local-runtime` — desktop-runtime
- security-reviewer reads the whole repo and does not edit

## Rules

- Stay inside the paths named in the assignment. If a change requires another package, stop and report the dependency.
- Scope every tenant-owned query by organization. PostgreSQL row-level security is defense in depth, not a substitute for application checks.
- Fail closed. If policy, approval, or authorization cannot be verified, deny the action.
- Store only hashes of agent API keys. Show a plaintext secret once.
- Local execution may continue only under a valid signed, versioned, time-limited policy bundle bound to the organization and device. Offline mode is a limited mode.
- A cloud approval cannot be skipped while offline. Approval state is bound to the specific tool call and its arguments.
- Never expose arbitrary local shell or process execution to remote agents. Local MCP servers are untrusted processes. Process separation is not a sandbox.
- Require explicit user confirmation before launching an unknown or imported local command.
- Redact sensitive inputs and outputs. Do not log full email bodies by default.
- Build one execution lifecycle before adding integrations. Outlook stays read-only and waits until the vertical slice works.
- Make event ingestion idempotent with stable event IDs.

## Handoff

Every specialist returns:

- What changed, with paths
- How it was checked
- What is blocked, including any path outside its ownership

The security reviewer runs after a slice. It checks tenant isolation, credential handling, fail-closed policy, approval binding, and the rule that remote agents cannot drive a local shell.
