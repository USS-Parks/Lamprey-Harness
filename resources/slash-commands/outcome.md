---
name: outcome
description: State a goal and a budget; the harness orchestrates to it (requires Orchestration).
args:
  - spec
---
Treat this as an outcome to achieve, with the stated budget and strategy: {{spec}}

Interpret the flags if present: `--tokens N[k|m]` and `--wall N[s|m|h]` are the budget you should stay within; `--candidates N` sizes a fan-out; `--strategy fanout|critic|single` picks the approach (default single). Then:
- For `fanout`, use the `agent_fanout` tool.
- For `critic`, use the `agent_critique` tool.
- For `single`, just do the work directly and stop when the goal is met.

The hard budget ceiling is whatever is set in Settings → Orchestration; your flags can only ask for less. If the orchestration tools are unavailable, Orchestration is off — tell me to enable it in Settings → Orchestration, then proceed single-agent.
