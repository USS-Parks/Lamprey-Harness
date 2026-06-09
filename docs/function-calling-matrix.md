# Function Calling — Manual Smoke-Test Matrix

> FC-13 — Exercise the full pathway against real provider endpoints with shadow logging active. Document results and shadow comparisons.

**Test date:** 2026-06-08  
**Codebase:** v0.9.0 + FC-0 through FC-12  
**Shadow parser:** enabled

---

## Test Matrix

| Provider | Model | `supportsTools` | Prompt | Expected tool | Result | Shadow comparison | Notes |
|----------|-------|-----------------|--------|--------------|--------|-------------------|-------|
| DeepSeek | V4 Pro | true | "run git status" | `shell_command` | user-verification-needed | — | Requires DeepSeek API key |
| DeepSeek | V4 Flash | true | "run git status" | `shell_command` | user-verification-needed | — | Thinking mode may affect tool use |
| DeepSeek | V4 Pro | true | "search for lamprey open source" | `web_search` | user-verification-needed | — | Multi-tool turn |
| DashScope | Qwen3 Max | true | "run git status" | `shell_command` | user-verification-needed | — | Requires DashScope API key |
| DashScope | Qwen3 Coder | true | "apply a patch to fix the README" | `apply_patch` | user-verification-needed | — | Code-specific model |
| Google | Gemma 3 27B | true | "search for lamprey" | `web_search` | user-verification-needed | — | Requires Google API key |
| OpenRouter | Gemma 4 31B (free) | true | "run git status" | `shell_command` | user-verification-needed | — | Free tier, rate-limited |
| OpenRouter | Gemma 4 31B | true | "apply patch" | `apply_patch` | user-verification-needed | — | Paid tier |
| OpenRouter | (custom non-tool model) | false | "run git status" | `shell_command` (fallback) | user-verification-needed | — | Tests fallback parsing path |

---

## Test Procedure (per row)

1. Ensure the provider API key is configured in Settings → API Keys.
2. Enable shadow logging: verify `shadowParserEnabled` is `true` in settings.
3. Start a new conversation with the target model selected.
4. Send the exact prompt from the matrix.
5. Observe:
   - Did the model return structured `tool_calls`? (Check the bubble for tool-call card)
   - Did the model return tool-like prose without `tool_calls`? (Capability mismatch)
   - What does the shadow parser report? (Check debug logs for `shadow-parser` entries)
   - For fallback models: did the fallback parser extract valid tool calls?
6. Record the result in the matrix.

---

## Smoke-Test Verification Checklist

When API keys become available, verify:

- [ ] At least one DeepSeek model returns structured `tool_calls`
- [ ] At least one DashScope model returns structured `tool_calls`
- [ ] At least one Google model returns structured `tool_calls`
- [ ] Fallback parsing successfully extracts JSON tool calls from a non-tool model's text
- [ ] Fallback provenance is correctly tagged (`fb_` prefix on call IDs)
- [ ] Invalid fallback arguments are rejected (schema validation)
- [ ] Ghost-reply scenario: `<bash>` prose never dispatches as a tool
- [ ] PSEUDO_TAG_GUARD is absent from native-model system prompts
- [ ] PSEUDO_TAG_GUARD is present in fallback-model system prompts
- [ ] Shadow parser reports `nativeOnly` for native calls

---

## Shadow Comparison Summary

Since no legacy text parser exists (confirmed in FC-0 audit), the shadow always reports `difference: "nativeOnly"` when native tool calls are present, and `difference: "none"` when no tool calls exist. This is expected behavior — there is no old parser to produce false positives or mismatches.

**Verdict:** Shadow comparisons are clean by construction. The old parser was never built, so there is nothing to compare against. **FC-14 can safely remove the shadow logger.**
