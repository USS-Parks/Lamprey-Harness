---
name: example-directory-skill
description: Demonstrates the directory-mode skill format with a sibling reference file. Used as a template for richer skills that ship supporting docs alongside.
allowedTools:
  - mcp:*
  - shell_command
autoInvoke: false
---

This is a directory-mode skill. Its `skill.md` sits in a folder, and any
sibling files at the same level are loaded as `supportingFiles` and made
available to the agent via the skill block.

When you invoke this skill, also read `reference.md` in the same directory
for the long-form notes — those aren't inlined into the system prompt so
the agent only spends tokens on the reference when it actually needs it.

This skill is marked `autoInvoke: false`, which means the model won't pull
it in automatically — the user has to mention it explicitly. Set
`autoInvoke: true` (or omit the field) on skills you want the model to
reach for on its own.
