# UX interaction acceptance

Run the production build first (`npm run build`), then:

```
node scripts/acceptance/ux.cjs PLANNING/evidence/ux-simplification/<new-run-directory>
```

The output directory must be new and inside the checkout. The runner reuses `electron-fixture.cjs`, actual main/preload/renderer IPC, a temporary SQLite profile, a temporary Git repository, and a loopback streaming endpoint. Bundled plugins are disabled and no saved credentials are loaded. The window is shown inactive for valid animation timing; it does not request keyboard focus. Do not interact with that fixture window during measurements.

`ux-scenarios.json` names the representative cases currently implemented. Missing cases fail completion; it is not a claim that every UX contract has already passed. The runner emits screenshots, raw five-run timing measurements, runtime metadata and a cleanup receipt. Absolute performance targets are evaluated at UX-33/34, not silently imposed on the known-slow baseline.

`--fail-after-launch` deliberately fails after Electron launch. It must exit nonzero while recording removal of the isolated profile and closure of the local server. Reusing an output directory or supplying an outside path also fails before starting Electron.

The original UX-00 runner was extracted here at UX-03. Historical measurements and screenshots remain in `PLANNING/evidence/ux-simplification/`; their source commit preserves the original runner. Extend this runner with subsequent prompt scenarios instead of creating duplicate harnesses. Component-only browser lifecycle tests remain supplementary. Actual browser/terminal lifecycle cases are included, alongside direct files/artifacts, two-repository review and the full thirteen-route workspace walk. The expanded performance and viewport matrix remains UX-33 through UX-35.

Authored and reviewed by Basho Parks, copyright 2026
