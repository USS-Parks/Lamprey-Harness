# TR_BASELINE.md — Tools + MCP Roster measurement lock (before)

**Prompt:** TR-0
**Captured:** 2026-08-23
**HEAD at measurement:** `cabd881` (`docs(planning): approve Tools+MCP Roster P-SPR for STS`)
**package.json version:** `0.30.0`

## 1. Tip + version

| Field | Value |
|-------|-------|
| `git rev-parse HEAD` | `cabd881` |
| `package.json` version | `0.30.0` |

## 2. Pack bootstrap (`electron/services/tool-packs.ts`)

**Import count:** 24

**Pack module basenames (import order):**

1. `apply-patch-tool-pack`
2. `native-dev-tool-pack`
3. `workspace-context-tool-pack`
4. `verify-workspace-tool-pack`
5. `browser-tool-pack`
6. `browser-developer-tool-pack`
7. `frontend-qa-tool-pack`
8. `web-tool-pack`
9. `current-info-tool-pack`
10. `image-generation-tool-pack`
11. `multi-agent-run-tool-pack`
12. `orchestration-tool-pack`
13. `spawn-task-tool-pack`
14. `task-control-tool-pack`
15. `loop-tool-pack`
16. `notifications-tool-pack`
17. `tool-result-spill-tool-pack`
18. `skill-open-tool-pack`
19. `mcp-resource-tool-pack`
20. `artifact-tool-pack`
21. `pr-chat-tool-pack`
22. `pr-patch-tool-pack`
23. `automation-tool-pack`
24. `goal-loop-tool-pack`

## 3. CORE lists (`electron/services/core-tool-names.ts`)

`CORE_SURFACE_NAMES` (verbatim):

```
shell_command
apply_patch
workspace_context
view_image
web_search
ask_user_question
update_plan
enter_plan_mode
exit_plan_mode
get_goal
read_tool_result
skill_open
```

`CORE_NORMALIZE_NAMES` (verbatim):

```
workspace_context
view_image
shell_command
apply_patch
verify_workspace
shell_list
shell_monitor
shell_stop
shell_output
```

## 4. Curated MCP catalog ids

JSON (`resources/connectors/catalog.json`) ids, in file order:

`playwright`, `filesystem`, `github`, `postgres`, `sqlite`, `memory`, `fetch`

TS (`src/data/connectors-catalog.ts`) ids, in file order:

`playwright`, `filesystem`, `github`, `postgres`, `sqlite`, `memory`, `fetch`

Both sides are the same seven.

## 5. `NATIVE_TOOL_HINTS` (`src/components/customize/NewSkillWizard.tsx`)

Verbatim:

```
shell_command
apply_patch
view_image
web_find
workspace_context
verify_workspace
```

Stale vs CORE: includes `web_find` (not on CORE surface) and `verify_workspace` (normalize-only); omits `web_search`, `ask_user_question`, `update_plan`, `enter_plan_mode`, `exit_plan_mode`, `get_goal`, `read_tool_result`, `skill_open`.

## 6. OpenWiki tools pages

Present:

- `openwiki/domains/tools/catalog.md` — **model** catalog (providers / `MODEL_CATALOG`)
- `openwiki/domains/tools/mcp.md` — MCP connectors
- `openwiki/domains/tools/index.md` — links those two only

Absent: authored native-tool inventory (`openwiki/domains/tools/native.md` does not exist).

Authored and reviewed by Basho Parks, copyright 2026
