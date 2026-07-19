# Codex July 2026 follow-on PSPR candidates

**Recorded by:** CJP-WRAP

**Date:** 2026-07-19

**Approval state:** candidates only; none is a drafted or approved PSPR

These boundaries prevent unfinished or newly observed product areas from silently expanding
`LAMPREY_CODEX_JULY_2026_PARITY_PSPR.md`. Each candidate requires its own dated baseline,
reuse ledger, threat/authority analysis, verification gates, roster, and explicit approval.

| Candidate PSPR | Bounded question | Required first gate | Explicit exclusions from the candidate seed |
| --- | --- | --- | --- |
| `LAMPREY_CLAUDE_CODE_REFRESH_PSPR.md` | Refresh the Claude Code target against a pinned current release and adjudicate Lamprey's historical Claude-focused parity documents. | Official/version-pinned Claude inventory plus owner traces; mark every June claim retained, narrowed, stale, or superseded. | No changes to the completed Codex July ledger; no multi-agent pipeline revival. |
| `LAMPREY_RECORD_AND_REPLAY_PSPR.md` | Decide whether Record and Replay belongs in a core extension seam or a plugin after browser/artifact contracts are stable. | Threat model covering captured credentials, page data, executable steps, replay authority, redaction, retention, and user consent. | No ambient recording, credential capture, silent replay, or direct bypass of tool approvals. |
| `LAMPREY_COMPUTER_USE_AND_CHROME_PSPR.md` | Evaluate privileged desktop Computer Use and existing-profile Chrome control as opt-in plugin capabilities. | Host/input/browser-profile authority model with visible consent, target confinement, kill authority, audit, and owner-operated live tests. | No core always-on input control, no background profile takeover, no hidden credential/session reuse. |
| `LAMPREY_REMOTE_CONTROL_AND_HANDOFF_PSPR.md` | Evaluate local-to-remote task handoff, remote connection, and worktree continuation across a trust boundary. | Identity, credential, repository/worktree, network, revocation, and reconciliation threat model plus a disposable-host proof. | No implicit SSH, no silent credential copying, no cross-host mutation before explicit authority. |
| `LAMPREY_OFFICE_AND_SITES_PLUGIN_PSPR.md` | Define plugin-backed Documents, PDF, Sheets, Slides, and Sites artifact suites around the existing artifact/revision spine. | Per-format fidelity and sandbox matrix, source-of-truth rules, export verification, external-service consent, and fixture corpus. | No Office/Sites implementation in core; no claim that headless structure proves visual fidelity. |

## Shared candidate rules

1. Pin the upstream product/version and evidence date before planning behavior.
2. Reuse the existing turn, artifact, plugin, approval, audit, cancellation, and storage spines.
3. Default privileged power OFF unless a separate threat gate proves an inert always-on surface.
4. Require live evidence for GUI, credential, hosted-service, remote, or integration behavior.
5. Drafting any named file above is not authorization to execute it.

---

Authored and reviewed by Basho Parks, copyright 2026
