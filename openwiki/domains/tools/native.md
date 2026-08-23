---
type: Domain
title: Native Tool Roster
description: CORE lazy surface and the 24 pack-bootstrap modules that register bundled native tools.
tags: [tools, native, core, packs]
resource: repo://electron/services/core-tool-names.ts
---

# Native Tool Roster

**Version:** v0.30.0  
**Author:** Basho Parks

This page is the **native** tool inventory. For pinned chat **models**, see [catalog.md](catalog.md). For MCP connectors, see [mcp.md](mcp.md).

---

## CORE surface (lazy always-on)

Canonical list: `CORE_SURFACE_NAMES` in `electron/services/core-tool-names.ts` (re-exported to the skill wizard as `src/data/core-surface-names.ts`).

| Name | Role |
|------|------|
| `shell_command` | Run a shell command |
| `apply_patch` | Apply a structured workspace patch |
| `workspace_context` | Read workspace / file context |
| `view_image` | Attach an image for the model |
| `web_search` | Search the web |
| `ask_user_question` | Ask the user a structured question |
| `update_plan` | Write or update the plan |
| `enter_plan_mode` | Enter plan mode |
| `exit_plan_mode` | Exit plan mode |
| `get_goal` | Read the current operational goal |
| `read_tool_result` | Page a spilled tool result |
| `skill_open` | Load a skill body on demand |

`CORE_NORMALIZE_NAMES` is a **different** list (schema fail-fast). Do not union it with the surface list. It includes `verify_workspace` and the `shell_*` auxiliaries; it does not include `web_search`.

---

## Pack bootstrap

`electron/services/tool-packs.ts` imports 24 side-effect modules. Each file must exist and call `toolRegistry.registerNative` at least once (locked by `electron/services/native-inventory-lock.test.ts`).

| Pack module | Typical surface |
|-------------|-----------------|
| `apply-patch-tool-pack` | `apply_patch` |
| `native-dev-tool-pack` | Extra local-dev tools |
| `workspace-context-tool-pack` | `workspace_context` |
| `verify-workspace-tool-pack` | `verify_workspace` (normalize set, not CORE surface) |
| `browser-tool-pack` | Browser snapshot / navigate |
| `browser-developer-tool-pack` | CDP developer mode (off by default) |
| `frontend-qa-tool-pack` | Frontend QA |
| `web-tool-pack` | `web_search` plus fetch/find |
| `current-info-tool-pack` | Date / weather style info |
| `image-generation-tool-pack` | Image generation |
| `multi-agent-run-tool-pack` | `multi_agent_run` (Task-tool analog) |
| `orchestration-tool-pack` | Fan-out / critique (off by default) |
| `spawn-task-tool-pack` | Spawn a task |
| `task-control-tool-pack` | Task / thread control |
| `loop-tool-pack` | Loop enqueue / control (off by default) |
| `notifications-tool-pack` | Desktop notifications |
| `tool-result-spill-tool-pack` | `read_tool_result` |
| `skill-open-tool-pack` | `skill_open` |
| `mcp-resource-tool-pack` | Lazy MCP resource reads |
| `artifact-tool-pack` | Artifacts |
| `pr-chat-tool-pack` | PR context reads |
| `pr-patch-tool-pack` | PR patch proposals |
| `automation-tool-pack` | Automations |
| `goal-loop-tool-pack` | Goal / loop binding |

Some CORE names (`shell_command`, plan-mode, `ask_user_question`, `get_goal`) register inline in `electron/services/tool-registry.ts`, not in a pack.

---

## What this is not

- Not the model catalog. `openwiki/domains/tools/catalog.md` documents `MODEL_CATALOG`.
- Not a rebuild of the deleted Planner→Coder→Reviewer pipeline. The live fan-out tool is `multi_agent_run` only.
- Not a plugin-native tool runtime. Plugin connectors still contribute MCP servers (C11).

Authored and reviewed by Basho Parks, copyright 2026
