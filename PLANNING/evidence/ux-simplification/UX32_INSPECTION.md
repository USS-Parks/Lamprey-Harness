# UX-32 independent source inspection

Agent /root/ux32_inspection, requested gpt-5.6-terra / high; returned completed. Runtime model/effort and token usage unobservable. Read-only instruction, not a claimed sandbox restriction. Source checkpoint 71e64c0. No edits or heavy tests by inspector.

1. BrowserPanel address Escape resets its draft but bubbles to global streaming cancel. Prevent default/propagation and preserve IME ownership.
2. WorktreeManagerModal has initial/restored focus but no Tab containment.
3. Worktree list/create/remove promises lack stale context guards and rejection handling; create can stay busy. Announce errors and protect refresh identity.
4. Narrow Workspace panel declares dialog without focus handling. Add initial/restored focus and containment while respecting nested surfaces.
5. Settings at effective 400px width allocates 45% to navigation, leaving fixed Hooks grid and model inputs clipped. Use compact navigation and full-width content; verify every leaf.
6. Titlebar single-row menus overflow at narrow scale and lack menu keyboard behavior. Reuse PopoverMenu with compact grouping and preserve window/navigation actions.

Actual app acceptance must cover browser Escape while streaming; Worktree Tab/error/stale reads; drawer focus; all 24 settings leaves at 800x600/200%; titlebar menu keyboard; three-state matrix. Existing composer geometry coverage and polite task status must be preserved. Manual assistive technology proof remains separately identified.

API-EQUIVALENT COST RECEIPT: unavailable. Native tools did not expose observed parent/delegate token usage; routed cost and same-token Astra repricing unavailable. Unknown is not zero; no savings claim.
