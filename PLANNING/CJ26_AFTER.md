# Codex July 2026 parity closeout ledger

**Prompt:** CJP-WRAP

**Evidence date:** 2026-07-19

**Upstream ceiling:** Codex CLI `0.144.5` (2026-07-16), iOS `1.2026.188`
(2026-07-13), and Desktop `26.707` (2026-07-09)

**Lamprey release head:** `v0.26.0` at
`5fb8e0e46089b76b7a29b30342e41d15d3a6ffd6`

**Authority:** `LAMPREY_CODEX_JULY_2026_PARITY_PSPR.md` and its dated CJP-0 baseline

**Claim:** the approved implementation roster is closed except for parked M4. This is not a
blanket current-Codex parity claim. Every live or owner-only evidence gap remains explicit.

## 1. Disposition vocabulary

| Mark | Meaning |
| --- | --- |
| `COMPLETE` | The approved Lamprey implementation and its prescribed deterministic gate are complete. |
| `PARTIAL` | A bounded implementation or evidence claim is complete, but the full baseline row is not. |
| `PARKED` | Deliberately excluded from the approved execution; no implementation claim. |
| `SUPERSEDED` | Retained as history, but replaced as current authority or current behavior. |
| `OWNER-VERIFICATION-NEEDED` | The required packaged, GUI, provider, hosted-service, or paired-product trace is still open. |

`COMPLETE` never promotes deterministic evidence into a live desktop claim. A row can therefore
be `COMPLETE / OWNER-VERIFICATION-NEEDED` when the implementation is complete and the live
companion gate is not.

## 2. Initiative and release ledger

| Milestone | Prompt(s) | Disposition | Exact release or local cut | Release/tag commit | Live evidence boundary |
| --- | --- | --- | --- | --- | --- |
| M0 | CJP-0 | `COMPLETE` | documentation baseline only | `f88db0d06fa72146e670c8430f6849f8fd639b5a` | WindowsApps binary trace was unavailable; the paired playbook is the evidence path. |
| M1 | ST-1 through ST-12, including ST-10A/B | `COMPLETE / OWNER-VERIFICATION-NEEDED` | published `v0.20.0` | `17df19f120d2becd836f24dbe56e4ddd0aaa71ac` | Core Lamprey Steering was owner-reported working; all twelve paired Codex/Lamprey cases remain open. |
| M2 | TC-1 through TC-7 | `COMPLETE / OWNER-VERIFICATION-NEEDED` | published `v0.21.0` | `d172586a1b76cab87bcdae51af3d790c6202f416` | Eight packaged task-control checks remain open. |
| M3 | VA-1 through VA-6 | `COMPLETE / OWNER-VERIFICATION-NEEDED` | local `v0.22.0`, published in `v0.23.0` | `da8744160de02659ae974b2d0f451b41e741584b` | Packaged visualization/editing playbook remains open. |
| M4 | CM-1 through CM-6 | `PARKED` | no version, tag, or release | none | Code Mode was parked indefinitely before its threat-model/runtime spike. |
| M5 | PR-1 through PR-6 | `COMPLETE / OWNER-VERIFICATION-NEEDED` | published `v0.23.0` | `da8744160de02659ae974b2d0f451b41e741584b` | Disposable-repository GitHub workflow remains open. |
| M6 | MR-1 through MR-5 | `COMPLETE / OWNER-VERIFICATION-NEEDED` | published `v0.24.0` | `f7cc742f45f4982d96c5a49caa0c7db71fb70f09` | Local fixture plus real hosted-provider OAuth/elicitation remain open. |
| M7 | BD-1 through BD-6 | `COMPLETE / OWNER-VERIFICATION-NEEDED` | local `v0.25.0`, included in published `v0.26.0` | local wrap `1272a3d5bc9e005011e849a9356f38905c9ce5cf`; published head `5fb8e0e46089b76b7a29b30342e41d15d3a6ffd6` | Visible packaged CDP/GUI playbook remains open. |
| M8 | GA-1 through GA-6 | `COMPLETE / OWNER-VERIFICATION-NEEDED` | published `v0.26.0` | `5fb8e0e46089b76b7a29b30342e41d15d3a6ffd6` | Packaged background/restart playbook remains open. |
| M9 | CJP-WRAP | `COMPLETE` | no forced version bump | this closeout commit; see Git history | Full repository gate passed; documentation/source audit is recorded in the DEVLOG closeout. |

There are no `v0.22.0` or `v0.25.0` tags. Those numbers remain honest local milestone cuts.
The next published cuts intentionally combined M3 with M5 and M7 with M8 respectively.

## 3. Exact current settings and frozen boundaries

| Setting or boundary | Exact closeout state | Disposition |
| --- | --- | --- |
| `followUpBehavior` | `'steer'` canonical and renderer default; while a turn runs, the current composer requires the visible Steer or Queue action. Enter edits the draft and Tab follows ordinary focus navigation. | `COMPLETE`; the older v0.20.0 Enter/Tab shortcut wording is `SUPERSEDED`. |
| Rejected/racing Steering | Remains an editable draft; it is never silently converted to Queue or a new turn. | `COMPLETE` |
| Queue durability | Durable migration-v21 ledger; deterministic restart/recovery coverage. | `COMPLETE` for Lamprey; Codex-identical restart behavior is `OWNER-VERIFICATION-NEEDED`. |
| `browserDeveloperModeEnabled` | `false` by default. | `COMPLETE`; live CDP behavior is `OWNER-VERIFICATION-NEEDED`. |
| `loopsEnabled` | `false` by default and an outer gate for autonomous automation/goal entry points. | `COMPLETE`; packaged background/restart behavior is `OWNER-VERIFICATION-NEEDED`. |
| `orchestrationEnabled` | `false` by default; the deleted always-on pipeline remains deleted. | `COMPLETE` |
| Code Mode | No setting or runtime shipped in this initiative. | `PARKED` |
| One real turn seam | `chat:send -> runHeadlessTurn -> runChatRound` remains canonical; Queue, loops, wake-ups, goals, and automations reuse it. | `COMPLETE` |

## 4. CJP-0 official-source row closeout

This table closes every row in `CJ26_BASELINE.md` section 2. `COMPLETE` here means the source
was pinned and the approved Lamprey response was adjudicated; it does not mean every source
feature was implemented.

| CJP-0 source row | Closeout disposition | Result |
| --- | --- | --- |
| Steering and Queue UX | `COMPLETE / OWNER-VERIFICATION-NEEDED` | M1 shipped the control substrate and current explicit-action composer; paired desktop replay remains open. |
| Turn protocol | `COMPLETE` | Stable turn identity, exact expected-turn Steering, interrupt, and same-turn settlement shipped in M1. |
| Steer validation and event shape | `COMPLETE` | Typed rejection, no fallback, and bounded audit disposition tests are green. |
| Ordered user input | `COMPLETE / OWNER-VERIFICATION-NEEDED` | Ordered text/image/local-image contracts and persistence ship; mixed-attachment packaged replay remains open. |
| Active-turn steer test | `COMPLETE / OWNER-VERIFICATION-NEEDED` | Deterministic safe-boundary and sleeping-tool tests pass; paired desktop trace remains open. |
| Pending-input timing tests | `COMPLETE / OWNER-VERIFICATION-NEEDED` | Wait wake-up and selected-child continuation tests pass; live child-target trace remains open. |
| Safe-boundary and compaction tests | `COMPLETE / OWNER-VERIFICATION-NEEDED` | Tool-boundary and compaction ordering are automated; packaged trace remains open. |
| Interrupt and terminals | `COMPLETE / OWNER-VERIFICATION-NEEDED` | Exact turn interrupt is separate from terminal authority; live terminal-survival trace remains open. |
| July release delta | `PARTIAL / OWNER-VERIFICATION-NEEDED` | M1-M3 and M5-M8 shipped; M4 is parked, and the named live playbooks remain open. |
| Code Mode implementation status | `PARKED` | No generic Python/Jupyter claim and no V8-backed Code Mode implementation. |
| Browser Developer Mode | `COMPLETE / OWNER-VERIFICATION-NEEDED` | M7 is present, explicit, approval-gated, and default OFF; packaged CDP trace remains open. |
| Remote handoff | `PARKED` | Recorded as a dedicated security-bound follow-on candidate. |
| Record and Replay | `PARKED` | Recorded as a dedicated extension-surface follow-on candidate. |

## 5. CJP-0 historical-claim closeout

| Historical row | Closeout disposition | Current treatment |
| --- | --- | --- |
| June research called itself a complete Codex inventory | `SUPERSEDED` | Retained unchanged as history; this dated PSPR is current authority. |
| Leaked-prompt hosted-tool details used as authority | `SUPERSEDED` | Rejected as normative authority; official/version-pinned sources govern. |
| “No Code Interpreter/Python sandbox” | `SUPERSEDED` | Narrowed to no established Python/Jupyter surface; upstream V8 Code Mode was recorded and Lamprey M4 parked. |
| Hosted runs instead of agent controls | `SUPERSEDED` | July app-server turn/thread controls replaced the old inventory claim. |
| Codex-like tool surface as the parity target | `SUPERSEDED` | Historical implementation scope only, not current product parity. |
| June progress rows are factual for their plan | `COMPLETE` | Retained as historical implementation receipts, not a July inventory. |
| June Lamprey parity plan closes the structural gap | `SUPERSEDED` | It is Claude Code-focused and becomes a separate refresh candidate. |

## 6. CJP-0 Steering and Queue behavior closeout

| CJP-0 case | Lamprey implementation | Owner/live disposition |
| --- | --- | --- |
| Steering during streaming | `COMPLETE` | `OWNER-VERIFICATION-NEEDED` for paired CJ26-S01. |
| Steering during tool execution | `COMPLETE` | `OWNER-VERIFICATION-NEEDED` for paired CJ26-S02. |
| Steering during subagent wait | `COMPLETE` | `OWNER-VERIFICATION-NEEDED` for paired CJ26-S03. |
| Completion race | `COMPLETE` | `OWNER-VERIFICATION-NEEDED` for ten-attempt paired CJ26-S04. |
| Stale target | `COMPLETE` | `OWNER-VERIFICATION-NEEDED` for paired CJ26-S05. |
| Non-steerable turn | `COMPLETE` | `OWNER-VERIFICATION-NEEDED` for paired CJ26-S06. |
| Ordered attachments | `COMPLETE` | `OWNER-VERIFICATION-NEEDED` for paired CJ26-S07. |
| Queue edit/reorder/send/delete | `COMPLETE` | `OWNER-VERIFICATION-NEEDED` for paired CJ26-S08. |
| Queue restart/reconnect | `COMPLETE` as Lamprey reliability behavior | Codex-identical behavior is `OWNER-VERIFICATION-NEEDED` in CJ26-S09. |
| Interrupt/background terminal | `COMPLETE` | `OWNER-VERIFICATION-NEEDED` for paired CJ26-S10. |
| Default and shortcuts | Explicit-button treatment `COMPLETE`; v0.20.0 shortcut treatment `SUPERSEDED` | Current paired settings/keyboard trace is `OWNER-VERIFICATION-NEEDED` in CJ26-S11. |
| Mid-turn compaction | `COMPLETE` | `OWNER-VERIFICATION-NEEDED` for paired CJ26-S12. |

The executable twenty-row M1 contract matrix remains green in
`CJ26_STEERING_AFTER.md`. Its live column remains open row-for-row; the owner's successful
core Lamprey report and Codex reference screenshot do not substitute for those twelve traces.

## 7. CJP-0 Lamprey-wiring row closeout

| Baseline concern | Closeout disposition | After state |
| --- | --- | --- |
| Real turn seam | `COMPLETE` | Preserved and reused by every approved control path. |
| Active run state | `COMPLETE` | Replaced by stable `TurnRuntime` identity and exact-once settlement. |
| Cancellation | `COMPLETE` | Turn-aware interrupt remains separate from Steering and terminal cleanup. |
| Tool continuation | `COMPLETE` | Steering drains only at tested model-continuation boundaries. |
| Async next-turn delivery | `COMPLETE` | Canonical Queue delivery reuses the next-turn seam without becoming Steering. |
| Persistence | `COMPLETE` | Additive migrations v21-v32 cover turns/follow-ups and later approved milestone state. |
| Renderer streaming state | `COMPLETE` | Active-turn state is reconciled per conversation. |
| Composer lock | `COMPLETE` | Composer remains editable while a turn runs and exposes explicit Steer/Queue actions. |
| Event filtering | `COMPLETE` | Turn/follow-up identity and reconciliation extend the existing conversation filter. |
| Attachments | `COMPLETE / OWNER-VERIFICATION-NEEDED` | Ordered typed inputs ship; live mixed-attachment behavior remains open. |
| Subagents | `COMPLETE / OWNER-VERIFICATION-NEEDED` | Existing run identity gained bounded wait/wake/target control; live child targeting remains open. |
| Spawn and notification | `COMPLETE` | Existing notification semantics were reused. |
| Audit events | `COMPLETE` | Every follow-up disposition is bounded and excludes attachment bytes/content. |
| Preload surface | `COMPLETE` | Narrow typed turn/task/artifact/MCP/browser/automation/goal IPC ships. |
| Tool authority | `COMPLETE` | New model tools retain descriptor risk, approval, audit, cancellation, and lazy-surface authority. |
| Background terminals | `COMPLETE / OWNER-VERIFICATION-NEEDED` | Interrupt does not imply termination; packaged survival trace remains open. |
| Remote handoff, Record/Replay, Office suites | `PARKED` | Split into explicit follow-on candidates; no core implementation claim. |

The baseline's missing `conversation_turns`, `turn_followups`, `expectedTurnId`, and
`clientUserMessageId` primitives were supplied by M1. The baseline's 54-tool/13-schema and
prompt-byte measurements remain dated CJP-0 measurements, not current counts; later milestone
tools intentionally changed the registry.

## 8. Test, skip, and GUI-trace ledger

| Cut | Deterministic receipt recorded at wrap | Explicit skip boundary | Owner/live evidence |
| --- | --- | --- | --- |
| M1 / v0.20.0 | Steering cohort: 27 files, 277 passed, 9 skipped; all 20 normative rows mapped once; independent Node-SQLite turn-control integration 8/8. | One nine-test native cohort skipped under the then-confirmed ABI mismatch; not relabeled pass. | Twelve paired Codex/Lamprey cases open; core Lamprey path reported working. |
| M2 / v0.21.0 | Full suite 2,653 passed / 143 skipped / 0 failed; Electron-native migration/schema 19/19; build and smokes pass. | Sixteen ABI-guarded files reported skipped by host Node. | Eight packaged task-control checks open. |
| M3 / local v0.22.0 | Full suite 2,688 passed / 159 skipped / 0 failed; Electron-native M3 DB cohort 38/38; build and smokes pass. | Eighteen native-DB files disclosed by the proof gate. | Packaged artifact/editing playbook open. |
| M5 / v0.23.0 | Full suite 2,717 passed / 162 skipped / 0 failed; Electron-native v27-v29/M5 cohort 29/29; build and smokes pass. | Native ABI skips disclosed separately. | Disposable GitHub workflow open. |
| M6 / v0.24.0 | Full suite 2,752 passed / 162 skipped / 0 failed; build, smokes, proof, and diff check pass. | Eighteen native-DB files disclosed; M6 adds no migration. | Local-fixture and hosted-provider OAuth/elicitation workflows open. |
| M7 / local v0.25.0 | Full suite 2,792 passed / 162 skipped / 0 failed; build and smokes pass. | Eighteen ABI-guarded files disclosed; focused M7 cohorts had zero skips. | Visible packaged Browser Developer playbook open. |
| M8 / v0.26.0 | Full suite 2,834 passed / 165 skipped / 0 failed; build, smokes, and `verify:proof --require-smokes` pass. | Eighteen ABI-guarded files disclosed; M8 Node-SQLite migration/restart cohorts ran. | Packaged background/restart playbook open. |
| M9 / CJP-WRAP | Build, lint, tsc node/web, 246 passing files, 2,834 passing tests / 165 skipped / 0 failed, bundle smoke, renderer smoke, and `verify:proof --require-smokes` all pass. | Fifteen files are skipped overall; proof accounting names 18 native-DB files whose `better-sqlite3` suites do not load under host Node. | No GUI trace is manufactured by this docs-only closeout. |

## 9. Approved prompt commit ledger

These are the focused implementation commits. Release corrections and publication metadata are
listed separately so they do not masquerade as roster prompts.

| Prompt | Commit SHA | Prompt | Commit SHA |
| --- | --- | --- | --- |
| CJP-0 | `f88db0d06fa72146e670c8430f6849f8fd639b5a` | ST-1 | `24ce0aa89eb85245b482dcffc221d4452bffc189` |
| ST-2 | `4e72861f048fabca0ace46b27f1459eddda53ed0` | ST-3 | `91d5eca09da7e74dc5a88bb8f4e2001a7c7a91af` |
| ST-4 | `cfcf2a9053846d760d5f79782f35797fcf5466e6` | ST-5 | `cc62e5e6c501dca4d1e83c3824db3feae2e7f069` |
| ST-6 | `9241b0900384a0d076a423bd973aae7d0f746daa` | ST-7 | `c2084011ae2a4078575340a7e94b3e0eb8595c94` |
| ST-8 | `f20b8d171bc656d336560b405793deca759957f2` | ST-9 | `da67656613b880142c34c272b55af58490fa2940` |
| ST-10 | `2a9ecf7f4d2be8291a8a9cc49f924958cfb82fab` | ST-10A | `781756e219cf70f5dc58b8240665f4786eb6d6d1` |
| ST-10B | `f774447f88d3bbd936a1719b493c2b4bcf9b10ec` | ST-11 | `b1a3cba94adab9b7e890e6124a578109ab9c1fe4` |
| ST-12 | `17df19f120d2becd836f24dbe56e4ddd0aaa71ac` | TC-1 | `63e3043e17fdbdae9416f6f4b91a41937f587cec` |
| TC-2 | `e335d213a84ebc844f6e98ce7fca83dd1fe0f247` | TC-3 | `138ae69d4b764fb4fe4b4c86598739c561f779e2` |
| TC-4 | `25da1c0da61456363b9ae5c3317e3a550b8235f6` | TC-5 | `8d675b5dab4c4aaf5ffb4e1a29076bb2ea589745` |
| TC-6 | `79f8bf82e09c2117e9fa7d3756468f2f0c1168a6` | TC-7 | `49cdcb09532333d39e215a5692228df690903181` |
| VA-1 | `7c16b1dfc7738142ab6656bcd6e0127c2929149f` | VA-2 | `c2cbbc28c2e212a3f417f44243557eb7704092d5` |
| VA-3 | `0239248a8cf2a6c8b4b669b1f56a84796e08a621` | VA-4 | `7ec796288d2be363b7584411a31fbd314b927743` |
| VA-5 | `fd7b03921b42105670f45da6beb31906c8bfb183` | VA-6 | `c0911315df6d221f4aa1f2a29db89a2cde7b1a14` |
| PR-1 | `914c7de0e4a3640bd6b96526f13269003a9fa36c` | PR-2 | `adff7d9f592de9c16b3a14cc06e9f717a26064b8` |
| PR-3 | `85dac82887b64938bd2f94e6c1e8ed3913535d32` | PR-4 | `8dccfbca48b4440aa704e22021a2e98b6cd90ab2` |
| PR-5 | `8493e3011bfee220b82bf0d9a1337223829e7934` | PR-6 | `ffa8a69c598a0c4d19eb1fa09e879f0c2829305a` |
| MR-1 | `acd3a83f17ca6ee28b5fea7a93326b019312723b` | MR-2 | `4579974395b5ef3db0b13d3f67d6f772ab551cb1` |
| MR-3 | `1d65e3fb0dd2a5b29975aebeadbacc374c4f5ad2` | MR-4 | `fba4d6d2ae4f524c2ca63963738c690c21bbad2a` |
| MR-5 | `b91509bfd443aadc58ff91fa70839d7bc4f61b77` | BD-1 | `250dc20a2d6c82287dc68df49a9d1b7763a1c6a2` |
| BD-2 | `3bb8507f764a54fba5f5e808d7ad18b7042274ac` | BD-3 | `7a97b4f53d25ec6f8d912f4ca723671027bac952` |
| BD-4 | `1397c47c8a479ad83ea5cd2b0ee98ccbae66da4c` | BD-5 | `fabe199fff00014f8f05388fe2c21506600b58b2` |
| BD-6 | `1272a3d5bc9e005011e849a9356f38905c9ce5cf` | GA-1 | `94be70602d0ad15916fd2021aed22d2f332ca06e` |
| GA-2 | `d08d2ff4ce4156a94294b27467d45e1b26af90b0` | GA-3 | `f1c1f78a2585ceb79b541a6ebd66c4af3def03b5` |
| GA-4 | `bb582075cafc431b6b00f5ab0ba6a07d11886cfe` | GA-5 | `0bc81c4268f9be69385f2c1bd535b486829b7e4e` |
| GA-6 | `55ea558cfbe23c57de2a0622e8a10a4a8ef1bf4b` | CJP-WRAP | current closeout commit; see Git history |

M4 has no prompt SHA because it was never approved or executed.

### Release corrections and publication commits

| Purpose | Commit SHA |
| --- | --- |
| v0.20.0 publication record | `84b39d7bfddfd8133179450d6ca2b050b44d6b6f` |
| Steering wiring newline correction | `83a6d0ca577a5ae09cfe4a1cf1881c11c5c33739` |
| v0.21.0 corrected release/tag head | `d172586a1b76cab87bcdae51af3d790c6202f416` |
| v0.21.0 publication record | `4c8d5da655f61a58ba2794836d5cecbd2751c886` |
| v0.23.0 release-head preparation | `da8744160de02659ae974b2d0f451b41e741584b` |
| v0.23.0 raced-asset content verification | `d9d53786ca71550861883a61bf8088b43e3275d8` |
| Explicit Steering/Queue action correction | `4b88836ec1a6a2a2a199b542385a254dd77e0cb2` |
| v0.24.0 production release | `f7cc742f45f4982d96c5a49caa0c7db71fb70f09` |
| v0.24.0 publication receipt | `6fd378abd7ec841ae6ea9b2153dec8bf942867d8` |
| v0.26.0 publication metadata/tag head | `5fb8e0e46089b76b7a29b30342e41d15d3a6ffd6` |

## 10. Honest gaps and follow-on boundary

The following remain open and are not defects concealed by the closeout:

- `CJ26_SMOKE_PLAYBOOK.md`: all twelve paired current-Codex/Lamprey desktop cases.
- `CJ26_TASK_CONTROL_PLAYBOOK.md`: eight packaged task-control checks.
- `CJ26_ARTIFACT_EDITING_PLAYBOOK.md`: packaged visualization and direct-edit workflow.
- `CJ26_PR_CHAT_PLAYBOOK.md`: disposable live GitHub review and patch workflow.
- `CJ26_MCP_PLAYBOOK.md`: local fixture plus real hosted-provider OAuth/elicitation.
- `CJ26_BROWSER_DEVELOPER_PLAYBOOK.md`: visible packaged CDP/GUI behavior.
- `GA_AUTOMATION_GOAL_PLAYBOOK.md`: packaged background, sleep/resume, and restart behavior.
- M4 Code Mode: deliberately parked indefinitely; no threat-gate result or implementation.
- Browser evidence files remain owner-cleaned; M8 is local scheduling, not a cloud scheduler.

The separate candidate boundaries are recorded in `CJ26_FOLLOW_ON_CANDIDATES.md`. They are not
approved PSPRs and do not extend this dated July roster.

## 11. Closeout verdict

The July 2026 PSPR is the current Codex parity authority for the pinned upstream ceiling.
M0-M3 and M5-M9 are implementation-complete; M4 is parked. The
initiative has materially expanded Lamprey's current control surfaces, but the remaining live
evidence prevents a blanket parity verdict. A later Codex build requires a dated addendum or a
new PSPR rather than silent reinterpretation of these rows.

---

Authored and reviewed by Basho Parks, copyright 2026
