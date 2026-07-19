# MCP resources and authenticated sessions

**Release:** v0.24.0 published 2026-07-19

**Scope:** capability-aware MCP resources/templates, strict lazy model tools, Streamable HTTP OAuth sessions, consent-gated URL elicitation, and safe connector UI.

## One manager authority

`electron/services/mcp-manager.ts` remains the single connection owner for persistent and plugin-provided MCP servers. It negotiates each server's advertised capabilities before calling resource APIs and preserves existing tool discovery/call behavior for tool-capable servers. A resource-only server can connect without a synthetic `tools/list` request.

The manager exposes bounded list/read/subscribe/unsubscribe operations. Opaque list cursors pass through one page at a time. Resource URIs must be absolute, response bodies must match the exact requested URI, cancellation reaches the SDK call, and the configured MCP request timeout remains authoritative. Oversized metadata or content fails clearly instead of being silently truncated.

```text
MCP server capability
  ├─ tools       → existing discover/call path
  └─ resources   → list resources/templates → exact read → optional notifications
```

## Model tool boundary

`electron/services/mcp-resource-tool-pack.ts` registers three strict lazy tools:

| Tool | Risk and behavior |
| --- | --- |
| `list_mcp_resources` | read + network; stable server provenance; per-server opaque cursor |
| `list_mcp_resource_templates` | read + network; template strings are data, never executed |
| `read_mcp_resource` | read + network; exact server/URI binding; canonical text/image/audio/generic resource blocks |

The resource tool pack returns the full structured value. The existing chat tool-result spill valve remains the only large-result authority: the database/UI retain the full result while the model receives a bounded preview and can page it through the existing result reader. No parallel spill store or approval system was introduced.

## Hosted session lifecycle

Hosted connectors use `transport: "streamable-http"` and may use `auth: "oauth"`. `electron/services/mcp-hosted-session.ts` implements the MCP SDK OAuth client provider. Dynamic client registration, PKCE verifier, and tokens are stored only through the existing encrypted keychain service; they do not enter settings JSON, prompts, or activity payloads.

```text
signed-out / authorization-required
  → explicit Reauthorize
  → exact authorization-domain confirmation
  → system browser + loopback state validation
  → token exchange
  → reconnect
  → connected
  → expired/error → explicit reauthorization
```

`electron/ipc/mcp.ts` owns the user-visible browser boundary. Authorization and external resource opens require main-process confirmation before `shell.openExternal`. External resource open accepts credential-free HTTP(S) only. URL-mode MCP elicitation reuses the normal Ask User runtime and reports accepted/declined/cancelled/completed progress without forwarding the URL or credentials into activity.

The legacy Google OAuth/SSE integration remains intact and separate.

## Renderer and activity boundary

`src/components/customize/ConnectorsColumn.tsx` is the shared surface for persistent and plugin-owned connectors. It exposes connection/auth state, reauthorization, consent progress, paginated resources and templates, safe preview, and confirmed external open. Plugin ownership remains visible through the existing source badge.

Preview policy is deterministic:

- text is rendered as React text in a `pre`, never injected as HTML;
- PNG, JPEG, GIF, WebP, and AVIF blobs may render as data URLs;
- SVG and every other binary type show metadata only;
- templates are displayed as escaped strings and are not expanded or navigated;
- credential-bearing, non-HTTP, and malformed resource URIs cannot open externally.

The activity spine records only session state, elicitation id/status/domain, and resource change kind. Resource bodies, blobs, token material, PKCE material, client secrets, and authorization URLs are excluded. Renderer resource notifications may refresh an already-open inventory without copying a body into activity.

## Verification boundary

Automated gates cover resource capability checks, bounds, cursor and URI binding, cancellation/timeouts, canonical content blocks, lazy discovery, spill integration, hosted auth state and redaction, IPC/preload/UI wiring, safe preview/open rules, build, bundle smoke, and renderer smoke.

`PLANNING/CJ26_MCP_PLAYBOOK.md` freezes the observable local fixture and real hosted-provider workflows. Those receipts remain `USER-VERIFICATION-NEEDED`; local implementation completion is not evidence that a third-party hosted provider completed authorization successfully.

---

Authored and reviewed by Basho Parks, copyright 2026
