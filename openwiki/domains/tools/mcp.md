---
type: Domain
title: MCP Connectors and Resource Discovery
description: Model Context Protocol manager, lazy resource reads, and OAuth 2.1 sessions for external integrations (v0.8.0+ resources v0.24.0+).
tags: [mcp, connectors, integrations, oauth]
resource: repo://ARCHITECTURE/MCP_RESOURCES_AND_SESSIONS.md
sources:
  - id: openwiki-source-8037e2358a2c4f9b2c722a11
    resource: repo://AGENTS.md
  - id: openwiki-source-cad480c0637cbba8106c35ce
    resource: repo://ARCHITECTURE/MCP_RESOURCES_AND_SESSIONS.md
  - id: openwiki-source-a2371d6362e5db4bc834ad03
    resource: repo://CLAUDE.md
generated: {by: "openwiki/0.3.3", at: "2026-08-23T18:40:37.531Z"}
verified:
  - by: openwiki/0.3.3
    at: 2026-08-23T18:40:37.531Z
---

# MCP Connectors and Resource Discovery

**Version:** v0.30.0  
**Key release:** v0.24.0 (MCP resources, OAuth sessions)  
**Author:** Basho Parks

---

## What MCP Is

The **Model Context Protocol (MCP)** is a standard for models to call external services via structured tools. Lamprey wraps every MCP server in a manager that:

1. **Discovers tools** from the MCP server manifest
2. **Exposes resources** (files, templates, API docs)
3. **Handles OAuth** for secure external authentication
4. **Validates schemas** before model dispatch
5. **Spills large results** (>8KB) to disk and provides references

An MCP server can be:
- **Persistent:** Lives in ~/.../plugins/`{id}` and auto-loads on startup (Customize → Connectors)
- **Stdio:** Spawned per-call with stdio I/O (shell-based integrations)
- **SSE:** Hosted HTTP endpoint with server-sent events

---

## Architecture

```
┌─────────────────────────────┐
│  Customize → Connectors UI  │
│  (renderer)                 │
└──────────────┬──────────────┘
               │ IPC
               ↓
┌─────────────────────────────┐
│  electron/services/mcp-*    │
│  ├─ mcp-manager.ts          │
│  │  ├─ Registry of servers  │
│  │  ├─ Tool discovery       │
│  │  └─ Resource manager     │
│  ├─ mcp-resource-read.ts    │
│  │  └─ Lazy resource fetch  │
│  ├─ mcp-oauth-handler.ts    │
│  │  └─ OAuth 2.1 + keychain │
│  └─ mcp-tool-dispatch.ts    │
│     └─ Tool call dispatch   │
└──────────────┬──────────────┘
               │
               ↓
┌─────────────────────────────┐
│  MCP Server (external)      │
│  ├─ Tools[]                 │
│  ├─ Resources[]             │
│  ├─ Templates[]             │
│  └─ OAuth handler (maybe)   │
└─────────────────────────────┘
```

---

## Tool Discovery

When an MCP server is enabled, Lamprey:

1. Reads `plugin.json` manifest (provided by the server or auto-synthesized from Skill import)
2. Calls the server's `tools/list` endpoint
3. Receives tool definitions with JSON Schema `inputSchema`
4. Registers each tool with `toolRegistry` as `providerKind: 'mcp'`
5. Tools are subject to the same schema normalization and approval rules as native tools

**Tool registration:**
```typescript
{
  name: string,           // Unique within the MCP server
  description: string,
  inputSchema: JSONSchema,
  providerKind: 'mcp',
  lazy: true,             // MCP tools are lazy-loaded
  serverName: string      // Which MCP server
}
```

**Lazy loading:** MCP tool bodies are not sent to the model until the model calls `tool_search` and the tool is unlocked. This keeps the tool schema bytes minimal per turn.

---

## Resource Discovery (v0.24.0)

MCP servers can expose **resources** — static artifacts like API docs, file listings, or templates:

```
list_resources → [Resource]
  ├─ uri: "file:///docs/api.md"
  ├─ name: "API Documentation"
  ├─ mimeType: "text/markdown"
  └─ contents (optional)

list_resource_templates → [ResourceTemplate]
  ├─ uriTemplate: "file:///templates/{action}.md"
  ├─ name: "Action Templates"
  └─ mimeType: "text/markdown"
```

**Lazy reads:** Resources are **not** sent to the model proactively. Instead, three strict lazy tools expose them:

- `mcp_list_resources(server)` — List available resources
- `mcp_read_resource(server, uri)` — Read exact resource by URI
- `mcp_list_templates(server)` — List template URIs

**Spill valve:** If a resource > 8KB, `mcp_read_resource` returns:
```json
{
  "uri": "file:///docs/large.md",
  "spilled": true,
  "filePath": "/tmp/spill-12345.txt",
  "head": "# API Docs\n\n...",
  "tail": "...see file at /tmp/spill-12345.txt for full content"
}
```

The model can call `read_tool_result(filePath)` to fetch the full text.

---

## OAuth Sessions (v0.24.0)

MCP servers that require authentication can use OAuth 2.1 with PKCE:

**Flow:**

1. **Server advertises capability:** `server.capabilities.oauth = { flow: "pkce" }`
2. **User enables server in Customize:** "Authorize →"
3. **Lamprey initiates OAuth:**
   - Generate PKCE code + challenge
   - Open browser to `authorization_endpoint` with `code_challenge`
   - User approves at provider (e.g., GitHub, Slack)
   - Callback redirected to localhost:8333 (Lamprey's loopback server)
4. **Exchange code for token:**
   - Lamprey calls `token_endpoint` with code + `code_verifier`
   - Receives `access_token`, `refresh_token`, `expires_in`
5. **Store encrypted:**
   - Tokens stored in `userData/keys.json` via OS keychain
   - Encrypted at rest
6. **Reauthorize on expiry:**
   - Before calling MCP, check expiry
   - If expired, exchange `refresh_token` for new `access_token`
   - Re-prompt user if refresh fails

**Keychain namespaces:**
- `mcp:<serverName>:access_token`
- `mcp:<serverName>:refresh_token`
- `mcp:<serverName>:expires_at`

---

## Customize Panel

**Connectors Column** (Customize → Connectors):

1. **Persistent connectors:**
   - List all installed MCP servers from `userData/plugins/`
   - Show enable toggle + gear icon (settings)
   - Show authorization status (Not authorized / Authorized / Expired)
   - Authorize / Re-authorize buttons for OAuth servers

2. **Add connector:**
   - "+ Add connector" button
   - Choose from curated catalog OR paste custom manifest JSON
   - User pastes JSON: `{ id, name, command, description }`
   - Lamprey validates and installs to `userData/plugins/{id}/`

3. **Resource preview:**
   - Click connector to expand
   - "Resources →" shows paginated resource list
   - Click resource to preview (safe HTML/text only)
   - SVG and other blobs show metadata only

---

## Tool Dispatch

MCP tools follow the same dispatch path as native tools:

```
Model calls {"action": "mcp_tool_name", "input": {...}}
  ↓
toolRegistry finds tool (providerKind: 'mcp')
  ↓
validateToolArguments() against inputSchema
  ↓
mcp-tool-dispatch resolves the MCP server
  ↓
Calls server's tool handler via stdio/SSE
  ↓
Result persisted with provenance: 'mcp'
```

**Approval:**
- MCP tools follow the same approval rules as native tools
- Mutating MCP tools always require explicit approval
- Read-only MCP tools auto-allow (if safe)

---

## Manifest Format

When an MCP server is installed (as a plugin), it ships a `plugin.json`:

```json
{
  "id": "mcp-github",
  "name": "GitHub Integration",
  "command": "node /path/to/mcp-github/index.js",
  "version": "1.0.0",
  "description": "GitHub API access",
  "tools": [
    {
      "name": "github_search_repos",
      "description": "Search GitHub repositories",
      "inputSchema": {
        "type": "object",
        "properties": {
          "query": { "type": "string", "description": "Search query" }
        },
        "required": ["query"],
        "additionalProperties": false
      }
    }
  ]
}
```

**Required fields:**
- `id` (kebab-case)
- `name` (display name)
- `command` (how to spawn the server, or `type: "sse"` + `url` for HTTP)
- `tools` (or `resources`, or both)

---

## Security Model

**Sandboxing:**
- Stdio MCP servers run as subprocesses (not Node.js worker threads)
- stdout/stderr captured but not logged (privacy)
- Kill-on-close ensures cleanup if Lamprey crashes

**Approval:**
- Each tool requires schema validation before dispatch
- Mutating tools require explicit user approval
- No tool can escalate privileges or access the keychain directly
- Tokens are encrypted at rest in OS keychain

**Capability detection:**
- Lamprey probes server capabilities on connect
- If OAuth is not advertised, no auth flow is offered
- If resources are not supported, resource tools fail gracefully

---

## Change Navigation

**To add a new MCP server:**
1. Install via Customize → Connectors → "+ Add"
2. Paste manifest JSON (or browse catalog)
3. Lamprey validates and saves to `userData/plugins/{id}/`
4. Enable toggle to activate
5. Server spawns on next chat turn that uses its tools

**To debug an MCP server:**
1. Check `electron/ipc/mcp.ts` logs for initialization errors
2. Verify `plugin.json` syntax (Customize shows validation errors)
3. Check server process in Task Manager (should see subprocess if stdio)
4. Verify tools appear in `toolRegistry.getAvailableTools()` output

**To add OAuth to an MCP server:**
1. Server advertises `capabilities.oauth: { flow: 'pkce' }`
2. User clicks "Authorize" in Customize → Connectors
3. Lamprey handles flow automatically
4. Tokens encrypted and stored in OS keychain
5. Server receives `Authorization: Bearer <token>` on calls

---

## Key Files

| File | Purpose |
|---|---|
| `electron/services/mcp-manager.ts` | Server registry, tool discovery, capabilities |
| `electron/services/mcp-resource-read.ts` | Lazy resource fetch, spill valve |
| `electron/services/mcp-oauth-handler.ts` | OAuth 2.1 + PKCE, token refresh |
| `electron/ipc/mcp.ts` | IPC handlers for Customize panel |
| `src/components/customize/ConnectorsColumn.tsx` | Connectors UI |

---

<!-- openwiki: broken internal link [../architecture/function-calling.md] file "../architecture/function-calling.md" does not exist. Fix the href or restore the target, then delete this comment. -->
<!-- openwiki: broken internal link [../architecture/overview.md] file "../architecture/overview.md" does not exist. Fix the href or restore the target, then delete this comment. -->
Further reading: [architecture/function-calling.md](../architecture/function-calling.md), [architecture/overview.md](../architecture/overview.md)

---

Authored and reviewed by Basho Parks, copyright 2026
