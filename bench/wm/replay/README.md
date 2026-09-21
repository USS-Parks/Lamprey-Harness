# WM-16 replay corpus

Captured live transcripts that re-drive the world model deterministically, no
network. The deterministic layers (validate, repair, rollforward, budget,
follow-through) are already network-free and fully unit-tested in
`electron/services/world-model-*.test.ts`; this corpus exists to lock the
layers against the failure DISTRIBUTION real Qwen-class models produce, which
the pure fixtures approximate but do not capture.

## How the corpus is filled

Run the WM-0 capture protocol (`PLANNING/WM_BASELINE.md` §7): 10 asks against
`qwen3:8b` via Ollama with `workspaceWorldModel: 'off'`, exporting each ask's
messages + tool_calls rows as JSON here under `captured/`. Each file is a
sequence of `{ toolName, arguments }` the model actually emitted; replaying it
through `analyzeToolCall` → `validateAnalysis` → `repairToolCall` asserts the
verdict/repair outcome the deterministic layer produces for real model output.

Until the owner runs the capture, this directory holds only this README. The
synthetic fixtures in `../tasks.ts` and the pure suites stand in; they are
labeled as synthetic, and the pre-registered live margins in
`PLANNING/WM_BASELINE.md` §6 are what a captured run is measured against.

---

Authored and reviewed by Basho Parks, copyright 2026
