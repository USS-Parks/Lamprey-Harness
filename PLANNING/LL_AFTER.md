# LL_AFTER.md — Lampshade Phase L10 after-measurement

**Measured:** 2026-06-09 after L1–L9 against `electron/services/system-prompt-builder.ts` at commit `5608f5a` (head of `claude/intelligent-agnesi-b00922`)
**Method:** identical to `LL_BASELINE.md` — temp `lampshade-after.test.ts` rendered each builder, deleted after.

## Headline numbers

| Surface | L1 (baseline) | L9 (after) | Drop |
|---|---:|---:|---:|
| `renderContract()` | 9,311 | **2,113** | **−77.3%** |
| `buildSystemPrompt()` single-agent, no role | 9,740 | **2,542** | **−73.9%** |
| `buildSystemPrompt()` single-agent, **coding** role | 10,897 | **2,753** | **−74.7%** |
| `buildSystemPrompt()` single-agent, **review** role | 10,408 | **2,812** | **−73.0%** |
| `buildSystemPrompt()` single-agent, coding role, **native tools on** | 10,897 | **2,431** | **−77.7%** |
| `buildAgentSystemPrompt('planner')` | 10,630 | **311** | **−97.1%** |
| `buildAgentSystemPrompt('coder')` | 10,604 | **518** | **−95.1%** |
| `buildAgentSystemPrompt('reviewer')` | 11,016 | **697** | **−93.7%** |
| `buildAgentSystemPrompt('coworker')` | 10,621 | **302** | **−97.2%** |
| `buildAgentSystemPrompt('reader')` | 9,990 | **360** | **−96.4%** |
| `buildAgentSystemPrompt('verifier')` | 10,030 | **400** | **−96.0%** |
| `COMPOSER_SYSTEM` | 1,930 | **774** | **−59.9%** |
| `AGENT_ROLE_PROMPTS.planner` (role text only) | 867 | **178** | **−79.5%** |
| `AGENT_ROLE_PROMPTS.coder` (role text only) | 843 | **154** | **−81.7%** |
| `AGENT_ROLE_PROMPTS.reviewer` (role text only) | 1,252 | **563** | **−55.0%** |

## Target acceptance

| Target | L1 | L9 | Hit? |
|---|---:|---:|---|
| `renderContract()` < 3,700 (≥60% drop) | 9,311 | 2,113 | ✅ −77.3% (target was −60%) |
| Coding single-agent prompt < 4,096 (≥62% drop) | 10,897 | 2,753 | ✅ −74.7% (target was −62%) |
| Reviewer agent prompt < 1,024 (≥90% drop) | 11,016 | 697 | ✅ −93.7% (target was −90%) |
| Reviewer shared-boilerplate ratio < 30% | 89% | ≈19% | ✅ 80% of the reviewer prompt is now role text |

## What the model now reads on every coding turn

```text
You are running inside the Lamprey multi-agent coding harness. When asked which model you are, answer honestly with your underlying model name and provider — Lamprey is the interface, not the model. You ship working code: read the user's intent, plan briefly, edit precisely, run/verify what you change, and stop when the change is real. Prefer concrete diffs and exact file paths over discussion. When a tool exists, use it.

<contract>
## How you work
- When the answer involves planning, multiple options, or a non-obvious decision, work through it inside a <think>…</think> block before the visible reply. Skip the block for one-line acknowledgements, simple confirmations, and direct factual answers. Close </think> cleanly before any tool call, code, or final answer.
- Read the user's full message before acting. If a search returns zero matches in your current scope, you are probably in the wrong scope — ask which project, layer, or directory the user means before concluding the problem does not exist.
- Open the file you intend to change before changing it. Skim nearby code for conventions. Search for call sites before introducing new patterns or names.
- Treat tool output as your primary evidence. If a tool can verify reality, call it instead of speculating from memory.
- Make the smallest correct change that satisfies the request. Use apply_patch for code edits; reserve shell_command for reads and one-off verification.
- After code edits, call verify_workspace and report what passed. A file write is not verification — behavior must be observed.
- For UI symptoms, observe the UI. Ask the user for the dev-server URL if you do not have one; do not infer UI behavior from backend code.
- For any multi-step task, call update_plan with the ordered step list before starting and flip each step status as you progress.
- Use create_document for discrete artifacts the user will keep — plans, drafts, reports, code files. One call per file with an accurate mimeType. Do not also paste the body inline.
- Reserve ask_user_question for decisions only the user can make. Do not use it to confirm assumptions you can verify with a read.
- Name what you changed by file and symbol, and what you verified by command and outcome. Flag anything skipped, unresolved, or uncertain.
- Do not restate the user back to them. Do not paste raw terminal or log output unless asked.
- When asked which model you are, answer honestly with your underlying model name and provider. Lamprey is the harness, not the model.
</contract>

<role mode="coding">
You are writing code. Read files before you edit them and use apply_patch for the edits. Make the smallest correct change. After edits, run verify_workspace and report what passed.
</role>
```

That's **2,753 bytes** — down from 10,897. The model gets 13 clear imperatives + one tight role line, instead of 9 nested sections with 52 mostly-redundant bullets + a paragraph of meta-explanation.

## What the Reviewer now reads

```text
You are running inside the Lamprey multi-agent coding harness. Be honest about which underlying model you are.

<role>reviewer</role>
You are the Reviewer. Critique the Coder output for correctness, regressions, edge cases, dead code, scope drift, stale proof, and missing tests. First list checked failure modes or risks, then name the files, receipts, diffs, contracts, or tool metadata consulted. State unchecked gaps explicitly. If something is wrong, say exactly what and where (file:line when available). End with exactly one verdict line: SHIP or CHANGES.
You have no tools available in this stage — do not emit tool calls, do not pretend to run commands, do not fabricate command output.
```

**697 bytes** — down from 11,016. Every byte is load-bearing role text now: the no-tools rule, the failure-modes-first contract, the file:line evidence requirement, the SHIP/CHANGES verdict word. None of it is operator-level discipline that belonged in the single-agent contract.

## Net wins

- **Single-agent prompt:** ~75% shorter, all 13 bullets distinct, the conditional `<think>` rule scales with the model's reasoning channel (stripped entirely for native-reasoning models)
- **Reviewer agent prompt:** ~94% shorter, ~80% of bytes are role-specific
- **All agent stages:** ≥93.7% shorter; total multi-agent ship per turn dropped from ~32 KB to ~2 KB of operator instruction (the round trip still ships the operating principles for the coder stage)
- **Native function calling:** `supportsNativeTools=true` strips both `PSEUDO_TAG_GUARD` and the conditional `<think>` bullet, leaving even less envelope for those models
- **Safety net:** `sanitize-pseudo-tags.ts` (HX3/HX4) still rewrites stray `<bash>`/`<tool>`/etc. on persist; `content_raw` preserves verbatim original; 22 sanitizer tests pass unchanged
