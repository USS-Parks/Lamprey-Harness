#!/usr/bin/env node
/**
 * check-ai-artifacts.cjs — staged-diff scan for machine-residue LOC (JM-0).
 *
 * Blocks commits whose ADDED lines carry high-precision markers of unreviewed
 * machine output: elision placeholders, assistant voice, stub markers, or
 * secret placeholders. The list is deliberately narrow — a false positive
 * costs a human minutes, a false negative costs the repo its authorship bar.
 *
 * Bypass (deliberate human decision only): ALLOW_AI_ARTIFACTS=1 git commit …
 */
'use strict';

const { execSync } = require('node:child_process');

if (process.env.ALLOW_AI_ARTIFACTS === '1') {
  console.log('check-ai-artifacts: bypassed via ALLOW_AI_ARTIFACTS=1');
  process.exit(0);
}

// Prose and fixture paths get a pass on comment-voice rules; code does not.
// The scanner and hooks are exempt: the denylist has to spell out what it bans.
const CODE_EXT = /\.(ts|tsx|js|jsx|cjs|mjs|css|yml|yaml|json|ps1|sh)$/i;
const EXEMPT_PATH = /^(PLANNING|docs|DEVLOG|README|CONTRIBUTING|SESSION-LOG|research|scripts\/hooks\/|scripts\/check-ai-artifacts\.cjs)\b|\.md$/i;

/** Rules applied to every added line in non-exempt files. */
const UNIVERSAL_RULES = [
  { re: /\.\.\.\s*(existing|rest of(?: the)?|remaining)\s*(code|file|imports?|logic)/i, why: 'elision placeholder ("... existing code ...")' },
  { re: /rest of (?:the )?(?:code|file|function) (?:remains|stays|is) (?:unchanged|the same)/i, why: 'elision placeholder ("rest of the file unchanged")' },
  { re: /<(UNCHANGED|PLACEHOLDER|YOUR[_ ]CODE[_ ]HERE)>/i, why: 'placeholder tag' },
  { re: /\b(YOUR_API_KEY(?:_HERE)?|your-api-key-here|sk-xxxx)\b/, why: 'placeholder secret' },
  { re: /\bAs an AI\b/i, why: 'assistant voice ("As an AI")' },
  { re: /I['’]m sorry, but\b/i, why: 'assistant apology voice' },
  { re: /\bI cannot assist\b/i, why: 'assistant refusal voice' },
];

/** Rules applied only to code files (comments/strings in source). */
const CODE_RULES = [
  { re: /\/\/\s*(Let['’]s|Now we|Now let['’]s|First, we)\b/, why: 'conversational narration comment' },
  { re: /\/\/\s*TODO:? implement\b/i, why: 'machine stub ("TODO: implement")' },
  { re: /\bThis (?:function|method|component) (?:is responsible for|simply)\b/i, why: 'narration comment restating the code' },
];

let diff;
try {
  diff = execSync('git diff --cached -U0 --diff-filter=ACMR --no-color', {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
} catch (err) {
  console.error('check-ai-artifacts: could not read staged diff:', err.message);
  process.exit(1);
}

const findings = [];
let file = null;
let exempt = false;
let isCode = false;
let newLine = 0;

for (const raw of diff.split('\n')) {
  if (raw.startsWith('+++ b/')) {
    file = raw.slice(6);
    exempt = EXEMPT_PATH.test(file);
    isCode = CODE_EXT.test(file);
    continue;
  }
  if (raw.startsWith('@@')) {
    const m = /\+(\d+)/.exec(raw);
    newLine = m ? Number(m[1]) : 0;
    continue;
  }
  if (!raw.startsWith('+') || raw.startsWith('+++')) continue;
  const line = raw.slice(1);
  const lineNo = newLine++;
  if (!file || exempt) continue;

  for (const rule of UNIVERSAL_RULES) {
    if (rule.re.test(line)) findings.push({ file, lineNo, why: rule.why, line });
  }
  if (isCode) {
    for (const rule of CODE_RULES) {
      if (rule.re.test(line)) findings.push({ file, lineNo, why: rule.why, line });
    }
  }
}

if (findings.length) {
  console.error('check-ai-artifacts: BLOCKED — staged lines read as unreviewed machine output:\n');
  for (const f of findings.slice(0, 20)) {
    console.error(`  ${f.file}:${f.lineNo} — ${f.why}`);
    console.error(`    ${f.line.trim().slice(0, 120)}`);
  }
  if (findings.length > 20) console.error(`  …and ${findings.length - 20} more`);
  console.error('\nRewrite the lines like a person shipped them, or bypass deliberately with ALLOW_AI_ARTIFACTS=1.');
  process.exit(1);
}

process.exit(0);
