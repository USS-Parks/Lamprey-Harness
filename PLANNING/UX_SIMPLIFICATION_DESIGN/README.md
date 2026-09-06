# Lamprey v0.33.0 — design checkpoint

**UX-02: technical checks passed; the user explicitly waived the extra review stop and ordered all 40 prompts executed.** These are static, interactive mockups. No provider request, tool execution, user profile access, Git change or release operation occurs in the preview. Example messages, diffs, permission requests and terminal output are illustrative.

Open [the interactive preview](index.html), then use Idle, Running and Reviewing in the top review bar. The Light / dark button switches the presentation. Direct starting states: [idle](index.html?state=idle), [running](index.html?state=running), [reviewing](index.html?state=review).

## What to review

1. **Conversation first.** One task list replaces the competing Activity/Task Graph/sidebar presentations. Projects, pins, recents and Needs attention remain visible. Back/forward, filters, archives, task actions and search retain their existing destinations.
2. **One compact composer.** Attachments, model, working mode and explicitly named permissions stay together. Steer/Queue has one visible preferred action and an alternate menu. Stop stays separate. The nonfunctional microphone and repeated hints are absent.
3. **Work opens beside the conversation.** Changes opens Review; file and artifact links select their resource. The existing diff's Fix this action seeds a draft while review stays visible. This does not add a source editor. Terminal is a bottom dock, with separate Hide and End process actions.
4. **One status row.** Current progress sits above the composer. Completed tool steps collapse into a readable history link. Errors, decisions and diagnostics retain their named routes rather than disappearing into transient notifications.
5. **Six settings groups.** Search uses familiar labels such as RAG, Snip, Seed Budget and Reasoning Audit. Existing settings forms and values will be reused. The preview shows their destinations, not replacement forms.

The existing Lamprey mark is reused. Typography uses the Windows system UI font, with monospace reserved for code and small keyboard hints. The proposed dark surfaces are quieter; the light variant uses the same hierarchy. This is interaction parity with the approved contract, not a claim that every feature or pixel matches the installed Codex build.

## Three states and responsive behavior

| State | Desktop | Narrow window |
|---|---|---|
| Idle | Task sidebar, compact context header, a quiet starting view and composer. Workspace/terminal closed by default. | Same routes; smaller sidebar and wrapped composer controls. Sidebar scrolls when its contents exceed the window. |
| Running | Active status, compact tool-history disclosure, queued-message strip, visible Steer/Queue preference and separate Stop. | Message history scrolls above the composer. Stop, preferred send action and queue entry remain reachable. |
| Reviewing | Conversation and draft remain beside the diff; resource tabs above; optional terminal below. | Workspace replaces message history, while the composer remains below it. Close workspace returns to the conversation; it does not close the task. |

Captured examples: [idle desktop](idle-1440.png), [running desktop](running-1440.png), [review desktop](review-1440.png), [idle narrow](idle-800.png), [running narrow](running-800.png), [review narrow](review-800.png), [review with terminal](review-with-terminal-1440.png), [settings](settings-1440.png), [light appearance](running-light-1440.png).

## Every existing destination has a home

| UX-01 ID / destination | Preview route | Implementation constraint |
|---|---|---|
| W01 Files | Commands → Files; resource + menu; file tab | Reuse tree/filter/preview, correct path and line, permission-aware opens |
| W02 Side chat | Commands → Side chat; message/block actions in detail route | Preserve seed content and lineage |
| W03 Browser | Resource + → Browser; Commands → Browser | Existing pages, navigation and Developer Mode; real session lifecycle remains required |
| W04 Review | Header Changes; Review tab; Commands → Review | Task repository, stage/unstage/discard decision, hunk draft and existing PR review |
| W05 Terminal | Bottom Terminal; Commands → Terminal | Hide preserves process; End process remains explicit |
| W06 Environment | Header project/branch context | Project, branch, work mode, commit/push and PR actions remain available |
| W07 Sources | Resource + or Commands → Sources | Source links retain task ownership and safe external opens |
| W08 Artifacts | Resource + or Commands → Artifacts; inline output link | Preserve viewer and export/open actions |
| W09 Plan | Status step count; Commands → Plan | Plan approval remains independent of coding and permissions |
| W10 Background tasks | Status/history detail; Commands → Background tasks | Full tool history and live job controls survive |
| W11 After action | Status View details; Commands → After action | Search/filter/export, full errors and evidence remain available |
| W12 Loops | Automations → Loops; Commands → Loops | Pause/resume/stop/remove and backlog operations survive |
| W13 Agents | Commands → Agents; Activity details | Identity, grants, spending and existing revoke/stop paths survive |
| Workflows | Commands → Workflow library | Run/dry-run/edit/create/meta-scaffold retained |
| Memory | Commands → Memory | **Keep Ctrl+Shift+M**; do not silently reassign it to models |
| Customize | Sidebar Customize; Tools & Extensions → Skills, Connectors & Plugins | Existing three-column management view retained |
| Task operations | Task header ···; sidebar filters; All tasks & archives | Rename/pin/archive/fork/delete remain separate; archive is reversible |
| Pending decisions | Needs attention; task status | Open the owning task and use the existing scoped decision path |

Settings coverage (all 24 old IDs remain accepted during implementation):

- **General:** General, Automations.
- **Appearance:** Appearance.
- **Models & Connections:** Models, API Keys, GitHub.
- **Tools & Extensions:** Web Tools, Current Info, Image Gen, Tools, Library, RAG; a link to Customize.
- **Permissions:** Permissions.
- **Advanced:** Coding Mode, Plans & Goals, Hooks, Loops, Orchestration, Snip, Timeouts, Seed Budget, Reasoning Audit, Persistence, Activity.

## Focus, errors and empty states

Focus order follows sidebar → task header → conversation actions → composer → workspace → bottom panel. Explicit opens move focus into their target; incidental agent output cannot. Closing a dialog returns focus to the opener. Resource tabs support arrow keys and Home/End. Modal Escape wins over the global Stop behavior. The prototype demonstrates dialog focus and tab navigation; the real Electron acceptance must cover all editor/browser/terminal and IME conflicts.

An empty workspace offers Files, Browser and Artifacts through its add menu. A missing file or unavailable tool needs a named error and retry/return route in the resource itself. Review must show Loading before its first Git result, and distinguish clean, changed and failed states. A failed turn stays visible in task status with full error details. Unsent/rejected input retains its attachments and draft. A pending approval stays visible in Needs attention until resolved. These states are specified for implementation; the three primary mockups do not claim to exercise their real backend behavior.

At narrow widths, essential controls remain visible and inner message/code areas scroll. Do not solve clipping by hiding Stop, permissions or required decisions. Text/UI scaling, reduced motion, full contrast checks, screen-reader announcements and the complete G4 matrix remain real-product gates at UX-32/35.

## Verification and approval boundary

`node PLANNING/UX_SIMPLIFICATION_DESIGN/check.cjs` uses headless installed Chrome to check the static preview at 1440×900 and 800×600. It verifies no horizontal page overflow, composer/Stop visibility, queue preference, retained demo draft, hunk-to-draft continuity, terminal show/hide, six settings groups and search aliases, Escape focus restoration, all 13 command destinations plus workflows/Memory, no page errors and no HTTP requests. `review-check.json` records those results. They are not production acceptance or proof of real tool execution.

The checkpoint comes from [the approved PSPR, Authorization and stop points](../LAMPREY_UX_SIMPLIFICATION_PSPR.md): “Wait for design approval before UX-03 unless the user explicitly approves proceeding without a second design review.” Full STS/Bucket authorization remains recorded; this is the retained design decision, not a request to authorize publishing again.

**Review decision requested:** approve these layouts and navigation contracts, or identify revisions. UX-02 stays unchecked and its design files stay uncommitted until that gate passes. After approval, commit/push UX-02, verify hosted checks and continue UX-03 in order toward v0.33.0.

Authored and reviewed by Basho Parks, copyright 2026

## Authorization update

The user rejected the added review stop and ordered the full roster executed. The earlier review-boundary wording above is superseded. Continue from this design without another approval request; retain all technical acceptance gates.

Authored and reviewed by Basho Parks, copyright 2026
