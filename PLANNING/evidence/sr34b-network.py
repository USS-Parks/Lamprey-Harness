import os
import subprocess

raise SystemExit(subprocess.run([
    'node', 'node_modules/vitest/vitest.mjs', 'run',
    'electron/services/rag/embeddings/service.test.ts'
], env=dict(os.environ, LAMPREY_RUN_EMBED_NETWORK='1')).returncode)
