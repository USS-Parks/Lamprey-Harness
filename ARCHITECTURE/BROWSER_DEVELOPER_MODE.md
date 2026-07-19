# Browser Developer Mode

**Version:** v0.25.0 local milestone, not published

**Default:** OFF (`browserDeveloperModeEnabled: false`)

Browser Developer Mode adds bounded Chrome DevTools Protocol inspection to Lamprey's existing
in-app browser. It does not add arbitrary page-world execution, a second browser runtime, or
a parallel permission system.

## Session ownership

`BrowserCdpSessionService` is the only CDP attachment owner. It negotiates protocol `1.3`
first and lets Electron select its current protocol as the fallback, binds cancellation,
rejects conflicting owners, and detaches cleanly when a target closes. The existing preview
network observer may share this owner without enabling Developer Mode; disabling Developer
Mode detaches sessions that acquired a developer consumer but leaves preview-only sessions
alone.

Invoked from: `electron/services/browser-manager.ts:482`,
`electron/services/browser-developer-observer.ts:33`.

## Observation and inspection boundary

Eight strict lazy tools are registered in `browser-developer-tool-pack.ts`:

| Surface | Bound |
| --- | --- |
| Console and network metadata | 500 entries per target, target-bound cursor, navigation generation |
| Response body | exact observed request, text-safe MIME only, 64 KiB maximum, credential redaction |
| DOM or accessibility snapshot | 500 nodes maximum, 200 KB structured result |
| Runtime inspection | three fixed probes; the model cannot supply source code |
| Performance and layout | fixed metric allowlist |
| Trace | fixed passive categories, 10 seconds and 1,000 events maximum |
| Screenshot evidence | PNG, 15 MiB maximum, 50 bounded annotation references |

Console text, URLs, headers, errors, DOM strings, and response bodies pass through the shared
credential-shaped redaction rules. Snapshot, runtime, performance, and screenshot evidence
is discarded if the top-frame URL changes during capture. Trace output reports navigation
change explicitly.

Invoked from: `electron/services/browser-developer-observer.ts:226`,
`electron/services/browser-developer-inspection.ts:250`,
`electron/services/browser-developer-tool-pack.ts:19`.

## Trust and approval

Developer attachment requires all of the following:

1. the global setting is enabled;
2. the active target is HTTP(S);
3. the exact lower-cased origin, including port, has policy `allow`.

Missing policy is `ask`; `deny` is authoritative. Trust does not cross subdomains, schemes,
or ports. Metadata tools are read risk. Response bodies and sensitive context are
read/network/secret and require approval. Browser mutation is write/network/destructive and
requires approval through the existing tool permission path.

The same milestone strengthens shell approval. Windows PowerShell source is parsed as data
by the platform AST parser and never executed during inspection. Destructive commands,
dynamic or encoded execution, parser errors, unavailable parsing, and oversized input force
one-shot dangerous approval; persisted allow rules cannot bypass that decision.

Invoked from: `electron/services/browser-developer-policy.ts:45`,
`electron/services/dangerous-command-policy.ts:85`, `electron/ipc/chat.ts:1626`.

## Renderer boundary

The Browser panel's Dev toolbar is a view and command surface, not an authority. Typed preload
IPC asks the main process for a bounded status snapshot once per second and sends explicit
enable, site-policy, attach, detach, capture, and clear actions. The main process owns settings,
trust, CDP sessions, observations, and evidence records.

The toolbar shows the current target, CDP protocol, recording state, console/network counts,
exact-origin policy, screenshot references, byte counts, and annotations. Clear removes the
current target's in-memory observations and evidence records. Captured PNG files remain under
`userData/artifacts/browser-developer/` until owner cleanup.

Invoked from: `electron/ipc/browser.ts:144`, `electron/preload.ts:1042`,
`src/components/tools/panels/BrowserPanel.tsx:66`.

## Verification boundary

Automated tests cover lifecycle, protocol fallback, cancellation, ownership, disabled mode,
redaction, caps, cursor and navigation behavior, fixed inspection probes, trace cleanup,
origin policy, approval metadata, PowerShell AST classification, IPC/preload/UI wiring,
build, bundle smoke, and renderer smoke.

`PLANNING/CJ26_BROWSER_DEVELOPER_PLAYBOOK.md` is the owner-operated live gate. Until its
visible packaged-app receipt exists, v0.25.0 has structural and headless implementation
evidence but does not claim completed live Browser Developer parity.

---

Authored and reviewed by Basho Parks, copyright 2026
