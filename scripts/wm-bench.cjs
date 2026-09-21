#!/usr/bin/env node
// Lamprey Workspace Bench runner — WM-15.
//
// Owner-invoked, never CI. Drives each bench task through a real Lamprey turn
// against whatever model the local settings name (Ollama Qwen included),
// evaluates the task's goal predicates through the product's own engine, and
// writes a metrics JSON.
//
// Turn execution needs the Electron main process (DB, providers, keychain), so
// this runner is meant to be launched by the built app in a headless bench
// mode, or from `electron-vite dev` with BENCH=1. It imports the compiled
// harness + turn seam from `out/main`. When those are absent it prints setup
// guidance and exits non-zero rather than pretending to have run.
//
//   Usage: node scripts/wm-bench.cjs [--bench single|multi|all] [--out FILE]
//
// The predicate engine and fixture materialization are unit-tested in
// bench/wm/harness.test.ts; this script wires them to live turns.

const { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } = require('fs')
const { tmpdir } = require('os')
const { join, resolve, dirname } = require('path')

function parseArgs(argv) {
  const args = { bench: 'all', out: null }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--bench') args.bench = argv[++i]
    else if (argv[i] === '--out') args.out = argv[++i]
  }
  return args
}

function loadCompiled() {
  // The bench library and turn seam are TypeScript; a production build emits
  // them under out/main. We require the built artifacts so the runner needs no
  // ts-node. `runHeadlessTurn` is the single turn seam (electron/ipc/chat.ts).
  const outMain = resolve(__dirname, '..', 'out', 'main')
  const tasksPath = join(outMain, 'bench', 'wm', 'tasks.js')
  const harnessPath = join(outMain, 'bench', 'wm', 'harness.js')
  if (!existsSync(tasksPath) || !existsSync(harnessPath)) {
    return null
  }
  return {
    tasks: require(tasksPath),
    harness: require(harnessPath)
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const compiled = loadCompiled()
  if (!compiled) {
    console.error(
      [
        '[wm-bench] compiled bench artifacts not found under out/main/bench/wm/.',
        'This runner executes real turns and must run inside the built Electron',
        'main process. Build first (npx electron-vite build), then launch the',
        'bench through the app in headless bench mode (see PLANNING/WM_SMOKE_PLAYBOOK.md).',
        'The fixture + predicate engine themselves are gated by',
        'bench/wm/harness.test.ts under the normal vitest run.'
      ].join('\n')
    )
    process.exit(2)
    return
  }

  const { ALL_TASKS, SINGLE_TASKS, MULTI_TASKS } = compiled.tasks
  const { materializeTask, evaluateTask, summarize } = compiled.harness
  const runHeadlessTurn = globalThis.__lampreyRunHeadlessTurn
  if (typeof runHeadlessTurn !== 'function') {
    console.error(
      '[wm-bench] globalThis.__lampreyRunHeadlessTurn is not set. The app must expose\n' +
        'the turn seam before invoking this runner (bench bootstrap in main.ts).'
    )
    process.exit(2)
    return
  }

  const pool =
    args.bench === 'single' ? SINGLE_TASKS : args.bench === 'multi' ? MULTI_TASKS : ALL_TASKS
  const evaluations = []
  for (const task of pool) {
    const root = mkdtempSync(join(tmpdir(), `lwb-${task.id.replace(/\W+/g, '-')}-`))
    try {
      materializeTask(task, root)
      // The app-side bootstrap creates a scratch conversation bound to `root`
      // as its workspace and returns its id; run one turn with the prompt.
      await runHeadlessTurn({ workspaceRoot: root, prompt: task.prompt })
      evaluations.push(await evaluateTask(task, root))
    } catch (err) {
      evaluations.push({
        taskId: task.id,
        bench: task.bench,
        success: false,
        results: [{ met: false, detail: `runner error: ${err && err.message}` }]
      })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }

  const metrics = { generatedAt: new Date().toISOString(), bench: args.bench, summary: summarize(evaluations), evaluations }
  const outFile = args.out || join(resolve(__dirname, '..', 'dist'), `wm-bench-${Date.now()}.json`)
  mkdirSync(dirname(outFile), { recursive: true })
  writeFileSync(outFile, JSON.stringify(metrics, null, 2))
  console.log(`[wm-bench] wrote ${outFile}`)
  for (const m of metrics.summary) {
    console.log(`  ${m.bench}: ${m.succeeded}/${m.tasks} (${(m.successRate * 100).toFixed(1)}%)`)
  }
}

main().catch((err) => {
  console.error('[wm-bench] fatal:', err)
  process.exit(1)
})
