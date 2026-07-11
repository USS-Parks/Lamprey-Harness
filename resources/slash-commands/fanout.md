---
name: fanout
description: Generate competing candidates for a task and judge the best (requires Orchestration).
args:
  - task
---
Use the `agent_fanout` tool to solve this task by generating multiple competing candidates and judging the best one:

{{task}}

If several models would give useful diversity, pass them as `candidateModels`. If the `agent_fanout` tool is not available, Orchestration is turned off — tell me to enable it in Settings → Orchestration, then proceed with a single normal attempt.
