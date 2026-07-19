# Lamprey Provider Discovery Expansion v2 — P-SPR

**Initiative:** Current-model refresh plus long-tail API-key acceptance  
**Authoritative repository:** `C:\Users\17076\Documents\Claude\Lamprey Harness`  
**Execution branch:** `codex/provider-expansion-v2`  
**Source of truth:** This plan plus `PLANNING/PX2_BASELINE.md`  
**Authorization:** User authorized STS execution, all focused commits, and push on 2026-07-19  
**Status:** COMPLETE — implementation and local release gate passed 2026-07-19; published as v0.27.0

## Governance and scope

Add verified public OpenAI-compatible chat providers without weakening Lamprey's provider authority, keychain isolation, tool-schema normalization, or catalog honesty. Stable first-party model rosters are pinned. Volatile host catalogs are discovered live and imported. Self-hosted gateways expose an editable base URL.

This work reuses the v0.17.0 provider-expansion seams: `ProviderDescriptor`, `MODEL_CATALOG`, `resolveProviderDescriptor`, provider-key IPC, custom models, live import, catalog verification, provider parity tests, and the existing keychain. It does not introduce another credential store or dispatch path.

## Verification gates

Every prompt must pass its focused tests before commit. The phase cannot close until all of the following pass:

1. `npm.cmd run lint`
2. `npx.cmd tsc --noEmit -p tsconfig.node.json`
3. `npx.cmd tsc --noEmit -p tsconfig.web.json`
4. Focused provider, IPC, and renderer tests
5. `npm.cmd test -- --run`
6. `npm.cmd run build`
7. `npm.cmd run verify:proof -- --no-tests`
8. `git diff --check` and clean tracked status after final commit
9. Push succeeds and the remote SHA is recorded in `DEVLOG.md`

Live API-key checks are required where a key is already stored. Providers without a user-supplied key are recorded as `pending-key`, not “verified.” No test may expose a key.

## Reuse ledger

| Capability | Disposition |
|---|---|
| Provider registry and OpenAI client dispatch | Extend |
| Keychain and provider-key IPC | Reuse unchanged |
| Custom Provider endpoint support | Reuse as escape hatch |
| Live `/models` import | Extend with catalog strategies and bulk import |
| Base URL overrides | Surface in UI for configurable providers |
| Function-call schema normalization | Reuse unchanged |
| Retired model remapping | Extend |
| Provider parity and supports-tools audits | Extend |

## Sequential prompt roster

### PX2-0 — Evidence freeze and branch

Objective: capture the official-source matrix, baseline counts, exclusions, risks, and authorized branch.

Acceptance: baseline and this PSPR are present; branch is `codex/provider-expansion-v2`; unrelated `.agents/` remains untouched.

### PX2-1 — Catalog strategy seam

Objective: make live model discovery descriptor-driven for standard OpenAI lists, bare arrays, GitHub's catalog, DeepInfra's typed catalog, and providers with no compatible list.

Acceptance: unit tests prove authentication headers, response normalization, text-model filtering, collision-safe imports, and fail-closed error handling without network calls.

### PX2-2 — Current lab roster refresh

Objective: ship the current Moonshot, xAI, and direct Google Gemma roster; add retirement mappings for replaced entries.

Acceptance: exact-roster tests match first-party documentation and every pinned model references a known provider.

### PX2-3 — Aggregators and self-hosted gateway

Objective: add AIHubMix and FreeLLMAPI key cards, routing, live catalogs, and a visible FreeLLMAPI base-URL override.

Acceptance: provider list/UI tests prove key acceptance, optional address editing, and no secrets in settings other than the existing keychain path.

### PX2-4 — Direct provider pack A

Objective: add Cohere, MiniMax, NVIDIA, GitHub Models, and SambaNova.

Acceptance: descriptors, catalog strategies, seed models where stable, and parity tests pass.

### PX2-5 — Direct provider pack B

Objective: add SiliconFlow, Reka, SEA-LION, DeepInfra, and Hyperbolic.

Acceptance: nonstandard catalog normalizers and documented seed models are covered by tests.

### PX2-6 — Specialist provider pack

Objective: add Perplexity Sonar, Sarvam, and Inception Labs with their documented chat models.

Acceptance: providers that do not expose a compatible chat catalog use pinned rosters and validation probes rather than importing incompatible model IDs.

### PX2-7 — Large-catalog import UX

Objective: add filtering, select/import-all-visible, collision-safe local IDs, and conservative capability defaults to live model import.

Acceptance: renderer and IPC tests cover 100+ IDs, duplicate suppression, provider namespacing, and verbatim `apiModelId` persistence.

### PX2-8 — Catalog honesty and UI grouping

Objective: group labs, hosts/aggregators, regional/specialist providers, and local gateways; update descriptions and verification language.

Acceptance: all built-ins appear exactly once; catalog verification distinguishes verified, unsupported, missing-key, and error states.

### PX2-9 — Full verification and closeout

Objective: run the complete gate, update README/AGENTS/DEVLOG and version metadata, commit the closeout, push, and record the remote SHA.

Acceptance: every gate passes, the branch is pushed, and all user-authorized work is auditable by prompt ID and commit SHA.

## Milestones

- **M1 — Current rosters:** PX2-0 through PX2-2
- **M2 — Provider coverage:** PX2-3 through PX2-6
- **M3 — Operable long tail:** PX2-7 through PX2-8
- **M4 — Shipped:** PX2-9

## Settled defaults

- “All models” means all chat-capable IDs returned by an admitted provider's live catalog, not every media/embedding endpoint.
- Live-imported models default to 65,536 context, tools off, vision off, and reasoning off until the user or first-party metadata proves otherwise.
- A model-ID collision is stored locally as `<provider>:<model-id>` while `apiModelId` remains verbatim.
- Provider descriptors, not scattered model-name checks, own catalog/auth quirks.
- No stored key is ever read into the renderer.

## Final completion criteria

The phase is complete only when a user can save/test keys for every admitted provider, discover/import its compatible chat models, route those models to the correct endpoint, edit the FreeLLMAPI address, and run the full repository gate with no regression to existing providers.

## Execution ledger

| Prompt range | Commit | Result |
|---|---|---|
| PX2-0 | `6b18902` | Official-source baseline and authorized roster frozen |
| PX2-1–PX2-6 | `77d16ad` | Registry, catalog strategies, current rosters, and provider packs |
| PX2-7 | `0db6744` | Collision-safe bulk live-catalog import |
| PX2-8 | `f3c2f46` | API-key grouping, FreeLLMAPI address, and MiniMax reasoning |
| CI repair | `f6b55bc` | Cross-platform PowerShell AST policy tests |
| PX2-9 | release commit and `v0.27.0` tag | Documentation, final gate, push, and Bucket publication |

**Final local gate:** lint OK · tsc node+web OK · provider suites 94 passed / 0 failed ·
vitest 2848 passed / 166 skipped / 0 failed · build OK · bundle smoke PASS · renderer
smoke PASS · verify:proof exit 0.

**Honest gaps:** keyed providers without credentials available to this release remain
`pending-key`; no live authentication success is claimed for them. The 166 skipped tests
include 18 native-database suites whose installed `better-sqlite3` ABI targets Electron rather
than the release shell's Node ABI. The settings/model-import GUI still needs the owner's first
packaged-app pass.
