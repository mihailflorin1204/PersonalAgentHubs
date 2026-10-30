# Architecture brief

Short decisions for implementation. The long-form source is `AI_Agent_Infrastructure_Platform_Technical_Architecture.docx` at the repository root. If this brief and that document disagree, the document wins and this brief should be updated.

## Product

The platform gives an organization identity, policy, and an audit trail for AI agents that call MCP tools. The web app is the control plane: organizations, members, agents, credentials, remote servers, policies, approvals, and fleet activity. The desktop app is the developer workspace and operations console: local stdio MCP servers, inspection, a tool playground, and local execution history. A cloud MCP Gateway authenticates agents and executes remote tools. Distribution is a cloud-connected service plus a local runtime.

## Control plane and data plane

The control plane stores users, organizations, agents, servers, integrations, and policies. The data plane authenticates the agent, evaluates permission and rate limits, routes the tool call, and records the execution.

Three domains:

- Cloud control plane. Management API (Express) and PostgreSQL. Web and desktop use it for configuration and human identity.
- Cloud data plane. MCP Gateway. Agents call it for remote tools and native connectors. A worker handles background jobs once those jobs exist.
- Local data plane. The desktop Node.js sidecar starts local stdio MCP servers, enforces a cached policy bundle, and buffers events until they can sync.

Local calls do not travel through the cloud. The desktop still applies organization policy.

## Hybrid behavior

| Condition | Behavior |
| --- | --- |
| Online and authenticated | Cloud and local work within assigned permissions. |
| Offline, local server, valid cached policy | Local execution may continue. |
| Offline, remote server requested | Return a connectivity error. Do not report success. |
| Policy expired or revoked | Deny sensitive operations until a refresh. |
| Cloud approval required | Pause the action. Do not bypass approval offline. |
| User signs out | Revoke the local session and stop cloud-authenticated operations. |

Policy bundles distributed to a device are signed, versioned, time-limited, and bound to the organization and device.

## MVP boundaries

In the first release: configure and run local stdio servers; register remote MCP endpoints and discover tools; register agents and issue or revoke API keys; tool allow/deny, rate limits, and basic approvals; execution history with status, duration, and errors; one Outlook connector, read-only, after the lifecycle below works; basic organization roles.

Out of the first release: an LLM gateway, model routing, and cost controls; SSO, SCIM, and billing; ABAC and approval chains; a marketplace; claims of OS-level sandboxing for local MCP processes.

## Vertical slice

Ship this path before widening scope:

1. A user signs up on the web and creates an organization.
2. The user creates an agent and receives a credential. The stored form is a hash.
3. The user registers one remote MCP server, or adds one local stdio server on the desktop.
4. An admin sets one allow rule and one deny rule.
5. The agent calls an authorized tool through the gateway, or the desktop runs a local test call under policy.
6. The call appears once in web activity and in the desktop operations view.
7. An admin can revoke the credential or disable the agent or server.

A filesystem or echo MCP server is enough to prove the path. Outlook OAuth is the first native connector after this path is reliable.

## Security invariants

- Unauthorized tool calls are denied.
- Sensitive actions fail closed when authorization or policy cannot be verified.
- Agent credentials are hashed, expirable, and revocable.
- OAuth token caches use envelope encryption. Desktop secrets use OS secure storage.
- Approvals bind to one tool call and its arguments.
- Imported MCP configuration never launches silently.
- External content is untrusted and cannot override policy.
- Audit logs are tenant-scoped. Modification of audit records is separate from ordinary logs.

## Team

The tech-lead contract is `AGENTS.md`. Specialists are `.cursor/agents/`. Ownership follows the packages named there. The monorepo name in the spec is `agentops-platform/`; this repository is AgentHub and holds that tree at the root.
