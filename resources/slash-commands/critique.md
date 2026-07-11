---
name: critique
description: Draft, adversarially critique, and revise a task to a hard iteration cap (requires Orchestration).
args:
  - task
---
Use the `agent_critique` tool to solve this task with a generator + adversarial critic loop — draft, break it, revise, repeat:

{{task}}

If the `agent_critique` tool is not available, Orchestration is turned off — tell me to enable it in Settings → Orchestration, then proceed with a single careful attempt.
