# Browser Developer Mode after matrix

**Milestone:** M7 / BD-1 through BD-6

**Snapshot:** v0.25.0 local milestone on `codex/steering-parity`, not published

**Baseline:** `CJ26_BASELINE.md` dated 2026-07-17

## Outcome

M7 is implementation-complete. Its deterministic gates pass and the feature remains OFF by
default. Live packaged-app parity remains `USER-VERIFICATION-NEEDED`; this matrix does not
promote source or headless evidence into a desktop-behavior claim.

## Baseline-to-after matrix

| Baseline requirement | After state | Evidence | Disposition |
| --- | --- | --- | --- |
| Explicit gated CDP mode | One CDP owner, version fallback, cancellation, target cleanup, default OFF | `browser-cdp-session.test.ts`, packaged headless smoke | Implemented |
| Console and network inspection | Redacted, filterable, cursor-paged 500-entry buffers per target/navigation | `browser-developer-observer.test.ts` | Implemented |
| Bodies are exceptional | Exact observed request, text-safe MIME, approval, redaction, 64 KiB cap | observer/tool-pack/policy tests | Implemented |
| DOM, accessibility, runtime, layout, performance, trace | Structured caps; three fixed runtime probes; no model-authored page code | `browser-developer-inspection.test.ts` | Implemented |
| Screenshot evidence and annotations | Bounded PNG capture, stable reference, coordinates visible in Browser panel | inspection and UI-wiring tests | Implemented; live visual check open |
| Domain trust | Exact HTTP(S) origin Ask/Allow/Deny; no sibling or port bleed | `browser-developer-policy.test.ts` | Implemented |
| Sensitive/mutating approval | Shared risk metadata and existing approval authority | policy/tool-pack/approval tests | Implemented |
| Dangerous shell handling | Windows PowerShell AST inspection; destructive or uninspectable source forces one-shot approval | `dangerous-command-policy.test.ts`, chat approval cohort | Implemented |
| Existing Browser UI | Dev toolbar shows target, recording, counts, evidence, clear/detach, per-site policy | UI-wiring test, build, renderer smoke | Implemented; owner GUI receipt open |

## Frozen bounds

- 500 console entries and 500 network entries per observed target.
- 200 returned entries per observation page.
- 64 KiB response-body maximum.
- 500 DOM or accessibility nodes and 200 KB structured-result maximum.
- 10-second trace, 1,000 returned trace events.
- 15 MiB screenshot, 50 annotations, 100 in-memory evidence records.
- One bounded renderer status read per second while the Dev toolbar is open.

## Honest gaps

- `PLANNING/CJ26_BROWSER_DEVELOPER_PLAYBOOK.md` has not been run in a visible packaged app.
- No owner fixture receipt yet proves live console/network increments, annotation placement,
  navigation-race behavior, or exact-origin rejection in the GUI.
- Captured PNG files are not garbage-collected by the in-memory Clear action; they remain in
  `userData/artifacts/browser-developer/` for deliberate owner cleanup.
- v0.25.0 is a local version wrap only. No push, tag, release, Bucket run, or artifact
  publication was authorized.

## Verdict

**ADOPTED as an OFF-by-default local implementation.** A future public or parity-complete
claim requires the owner playbook receipt and separate publication authority.

---

Authored and reviewed by Basho Parks, copyright 2026
