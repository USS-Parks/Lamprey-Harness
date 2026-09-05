# SR-31H dependency remediation

The September 5 baseline reported 27 affected package entries (including inherited findings), not 27 independently reachable application exploits. The refreshed npm audit reports zero in `sr31h-audit.json`.

Compatible lockfile updates repair YAML parsing, Mermaid rendering and DOMPurify, MCP SDK server dependencies, URI/query parsing, build tools and their transitive dependencies. The obsolete `electron-rebuild` package was replaced with maintained `@electron/rebuild` 4.2.0; the existing CLI and postinstall command remain. Node minimum is now 22.12.0, matching that tool. The installed rebuild and builder share patched node-gyp/tar dependencies rather than retaining the obsolete chain.

Two scoped overrides address upstream pins:

- Transformers 4.2.0 requests sharp 0.34.x. Override only its sharp edge to the project's patched 0.35.x version (installed 0.35.4, libvips 8.18.6). Its actual RawImage decoder and resize path passed with a locally generated PNG. This dependency can process images at runtime; it is not dismissed as build-only.
- ONNX Runtime 1.24.3 requests adm-zip 0.5.x. Override only its adm-zip edge to 0.6.x. Source inspection locates usage in `script/install-utils.js` for NuGet extraction; the same constructor, getEntry and extractEntryTo sequence passed against a locally generated archive. The installed ONNX native runtime loaded through the Transformers import.

`scripts/acceptance/dependency-runtime.cjs` retains those compatibility checks. The maintained postinstall rebuilt better-sqlite3; all 169 native tests in 21 files executed with zero skips. Production build passed. Full lint, both TypeScript projects and the default suite are also required by the prompt's commit/push hooks.

The npm registry scan is a point-in-time advisory check, not proof that dependencies contain no unknown defects. No forced major-version audit fix was used. Install lifecycle scripts were disabled during resolution; the required native rebuild was then run explicitly. Registry tarball allowance was command-scoped, with no persistent npm configuration change.

Authored and reviewed by Basho Parks, copyright 2026
