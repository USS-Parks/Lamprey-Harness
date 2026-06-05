# Reference notes for example-directory-skill

This file exists to demonstrate that directory-mode skills can carry
arbitrary sibling content alongside their `skill.md`. The skill loader
discovers it and reports its filename in `LoadedSkill.supportingFiles`;
the agent can then open it on demand without bloating the system prompt.

Use this pattern when a skill needs:
- a long examples / cheat-sheet doc the agent only reads on demand
- a JSON config or schema referenced from inside the skill
- a small script the skill calls out to
