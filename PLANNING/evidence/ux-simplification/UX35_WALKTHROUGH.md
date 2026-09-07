# UX-35 daily-work walkthrough

This is the complete-task ledger for UX-35. It is not a screen recording. Each step is the existing isolated Electron fixture last accepted on Windows, plus the UX-34 G5 capture on Fire-Starter. This Linux session did not relaunch Electron.

Source under test for G5: `b06a016eaf07eda5bda9434acabc02df6d175596`. Product chrome for these flows is unchanged since accepted UX-32 except the UX-34 transcript window.

| Daily-work step | Scenario | Windows evidence |
|---|---|---|
| Choose project | `task-context-actions` | `UX15_RUN/LIFECYCLE.json` passed |
| Choose model | `compact-model-picker` | `UX14_RUN/LIFECYCLE.json` passed |
| Attach file | `compact-composer-controls` | `UX16_RUN2/LIFECYCLE.json` passed |
| Start controlled coding work | `running-local-stream` | `UX33_RUN4/LIFECYCLE.json` passed |
| Inspect live status | `current-task-status` | `UX17_RUN2/LIFECYCLE.json` passed |
| Steer | `compact-follow-up-controls` | `UX16_RUN2/LIFECYCLE.json` passed |
| Queue / edit / reorder | `compact-follow-up-controls` | same |
| Approve an action | `notices-approvals` | `UX20_RUN4/LIFECYCLE.json` passed |
| Open file | `direct-file-artifact-links` | `UX07_RUN/LIFECYCLE.json` passed |
| Open browser | `browser-task-lifecycle` | `UX08_RUN4/LIFECYCLE.json` passed |
| Open terminal | `terminal-dock-lifecycle` | `UX09_RUN3/LIFECYCLE.json` passed |
| Review a real diff | `review-real-git` | `UX33_RUN4/LIFECYCLE.json` passed |
| Contextual feedback | `review-task-continuity` | `UX10_RUN2/LIFECYCLE.json` passed |
| Failure / cancel | `current-task-status` | `UX17_RUN2/LIFECYCLE.json` passed |
| Find another task after reload | `task-navigation` | `UX23_RUN2/LIFECYCLE.json` passed |
| Second active task ownership | `task-data` | `UX21_RUN/LIFECYCLE.json` passed |

Relocation rows:

- Tools W01–W13: `workspace-capability-routes` in `UX10_RUN2`.
- Settings S01–S24: `settings-navigation` in `UX32_SETTINGS2`.
- Keyboard / three-state geometry: `UX32_KEYBOARD2` and `UX32_RUN5/ACCESSIBILITY.json`.
- Fresh setup: `UX29_KEYLESS2`.
- G5: `UX34_G5/COMPARISON.json` on Fire-Starter.

No new permission default, follow-up preference, or coding-mode default is introduced. Manual screen-reader listening was not repeated.

Authored and reviewed by Basho Parks, copyright 2026
