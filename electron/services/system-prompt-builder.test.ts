import { describe, it, expect } from 'vitest'
import {
  AGENT_ROLE_PROMPTS,
  COMPOSER_SYSTEM,
  PSEUDO_TAG_GUARD,
  buildAgentSystemPrompt,
  buildSystemPrompt,
  getRoleFragment,
  renderContract,
  type ContractRole
} from './system-prompt-builder'

// The model-resolver path in identityHead reads from providers/registry. To
// keep these tests pure / network-free, we call buildSystemPrompt without a
// modelId — that takes the no-model branch of identityHead, which is a stable
// hard-coded string. The modelId-path is exercised by chat.ts at runtime.

// L2 (Lampshade Phase, 2026-06-09) — the 9-section / 52-bullet contract was
// collapsed into one tight "How you work" block. The historical headings list
// is preserved as a comment so the diff explains itself for future readers.
//   Pre-L2 headings (deleted): Chain-of-thought (REQUIRED), Understand intent,
//   Gather context before editing, Use tools as evidence, Protect user work,
//   Verify before claiming done, Progress updates, Standalone deliverables,
//   Final response.
const EXPECTED_SECTION_HEADINGS = ['How you work']

const ALL_ROLES: ContractRole[] = [
  'coding',
  'review',
  'planning',
  'frontend',
  'document',
  'non_technical_user'
]

describe('renderContract', () => {
  it('wraps the contract in <contract>…</contract>', () => {
    const out = renderContract()
    expect(out.startsWith('<contract>')).toBe(true)
    expect(out.endsWith('</contract>')).toBe(true)
  })

  it('emits all expected section headings in order', () => {
    const out = renderContract()
    let cursor = 0
    for (const heading of EXPECTED_SECTION_HEADINGS) {
      const idx = out.indexOf(`## ${heading}`, cursor)
      expect(idx, `expected heading "## ${heading}" at/after offset ${cursor}`).toBeGreaterThanOrEqual(cursor)
      cursor = idx + heading.length
    }
  })

  it('renders each section with at least one bullet', () => {
    const out = renderContract()
    for (const heading of EXPECTED_SECTION_HEADINGS) {
      const sectionStart = out.indexOf(`## ${heading}`)
      const after = out.slice(sectionStart)
      const firstBulletIdx = after.indexOf('\n- ')
      expect(firstBulletIdx, `expected a bullet under "${heading}"`).toBeGreaterThan(0)
    }
  })
})

describe('buildSystemPrompt — default base', () => {
  it('includes the honest-identity sentence', () => {
    const out = buildSystemPrompt([], '')
    expect(out).toContain('Lamprey is the interface, not the model')
  })

  it('includes the operating block', () => {
    const out = buildSystemPrompt([], '')
    for (const heading of EXPECTED_SECTION_HEADINGS) {
      expect(out).toContain(`## ${heading}`)
    }
  })

  // L2 — the contract drops at least 60% vs L1 baseline (9,311 bytes).
  // Target: under 3,700 bytes. Locks the win against future bloat.
  it('renders under the L2 size target (< 3,700 bytes, ≥60% drop from L1)', () => {
    const out = renderContract()
    expect(out.length).toBeLessThan(3700)
  })

  // L3 — the <think> block is conditional, not mandatory. The contract must
  // contain the conditional bullet exactly once, must NOT contain the L1
  // "every single turn MUST begin with a <think>" mandate, and must NOT
  // contain the heading "Chain-of-thought (REQUIRED)" anymore.
  it('uses the conditional <think> bullet, not the every-turn mandate', () => {
    const out = renderContract()
    expect(out).toContain('When the answer involves planning')
    expect(out).not.toContain('Every single assistant turn MUST begin with a <think>')
    expect(out).not.toContain('Chain-of-thought (REQUIRED)')
  })
})

describe('buildSystemPrompt — supportsNativeTools strips the <think> bullet (L3)', () => {
  it('keeps the conditional think bullet when supportsNativeTools is false/undefined', () => {
    const out = buildSystemPrompt([], '')
    expect(out).toContain('When the answer involves planning')
  })

  it('strips the conditional think bullet when supportsNativeTools is true', () => {
    const out = buildSystemPrompt(
      [],
      '',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      true // supportsNativeTools
    )
    expect(out).not.toContain('When the answer involves planning')
  })

  it('places AGENTS.md after the base contract', () => {
    const out = buildSystemPrompt([], '', undefined, 'repo-specific guidance here')
    const contractIdx = out.indexOf('</contract>')
    const agentsIdx = out.indexOf('<agents_md>')
    expect(contractIdx).toBeGreaterThan(-1)
    expect(agentsIdx).toBeGreaterThan(contractIdx)
    expect(out).toContain('repo-specific guidance here')
  })

  it('places the memory block after AGENTS.md', () => {
    const out = buildSystemPrompt([], '<memory>fact</memory>', undefined, 'agents content')
    const agentsIdx = out.indexOf('<agents_md>')
    const memoryIdx = out.indexOf('<memory>')
    expect(agentsIdx).toBeGreaterThan(-1)
    expect(memoryIdx).toBeGreaterThan(agentsIdx)
  })

  it('appends skill blocks after everything else', () => {
    const out = buildSystemPrompt(
      [{ name: 'test-skill', content: 'skill body' }],
      '<memory>fact</memory>',
      undefined,
      'agents content'
    )
    const memoryIdx = out.indexOf('<memory>')
    const skillIdx = out.indexOf('<skill name="test-skill">')
    expect(memoryIdx).toBeGreaterThan(-1)
    expect(skillIdx).toBeGreaterThan(memoryIdx)
    expect(out).toContain('skill body')
  })

  // D2 — the always-loaded `<memory_index>` block sits between the
  // legacy `<memory>` block and the skill blocks. Per the parity-plan
  // §2 invariant, the inter-block order is
  //   memory_index → skills → retrieved_context → chapters → conversation
  // so the index must precede skills.
  it('places the <memory_index> block between <memory> and skills', () => {
    const out = buildSystemPrompt(
      [{ name: 'test-skill', content: 'skill body' }],
      '<memory>m</memory>',
      undefined,
      undefined,
      undefined,
      undefined,
      '<memory_index>\n- [a](a.md) — A\n</memory_index>'
    )
    const memIdx = out.indexOf('<memory>')
    const idxIdx = out.indexOf('<memory_index>')
    const skillIdx = out.indexOf('<skill name="test-skill">')
    expect(memIdx).toBeGreaterThan(-1)
    expect(idxIdx).toBeGreaterThan(memIdx)
    expect(skillIdx).toBeGreaterThan(idxIdx)
  })

  it('drops the <memory_index> block entirely when empty', () => {
    const out = buildSystemPrompt([], '', undefined, undefined, undefined, undefined, '   ')
    expect(out).not.toContain('<memory_index>')
  })

  it('places task notifications after memory index and before skills', () => {
    const out = buildSystemPrompt(
      [{ name: 'test-skill', content: 'skill body' }],
      '<memory>fact</memory>',
      undefined,
      undefined,
      undefined,
      undefined,
      '<memory_index>\n- [a](a.md) — A\n</memory_index>',
      '<task-notifications>\n- done\n</task-notifications>'
    )
    const memoryIdx = out.indexOf('<memory>')
    const memoryIndexIdx = out.indexOf('<memory_index>')
    const notifyIdx = out.indexOf('<task-notifications>')
    const skillIdx = out.indexOf('<skill name="test-skill">')
    expect(memoryIndexIdx).toBeGreaterThan(memoryIdx)
    expect(notifyIdx).toBeGreaterThan(memoryIndexIdx)
    expect(skillIdx).toBeGreaterThan(notifyIdx)
  })

  it('places chapters after task notifications and before skills', () => {
    const out = buildSystemPrompt(
      [{ name: 'test-skill', content: 'skill body' }],
      '<memory>fact</memory>',
      undefined,
      undefined,
      undefined,
      undefined,
      '<memory_index>\n- [a](a.md) - A\n</memory_index>',
      '<task-notifications>\n- done\n</task-notifications>',
      '<chapters>\n- Schema migration\n</chapters>'
    )
    const notifyIdx = out.indexOf('<task-notifications>')
    const chaptersIdx = out.indexOf('<chapters>')
    const skillIdx = out.indexOf('<skill name="test-skill">')
    expect(chaptersIdx).toBeGreaterThan(notifyIdx)
    expect(skillIdx).toBeGreaterThan(chaptersIdx)
  })
})

describe('buildSystemPrompt — override path', () => {
  it('uses the override verbatim and omits the default contract', () => {
    const out = buildSystemPrompt([], '', 'I am a custom prompt.')
    expect(out).toContain('I am a custom prompt.')
    expect(out).not.toContain('Lamprey is the interface')
    expect(out).not.toContain('<contract>')
  })

  it('still appends AGENTS.md / memory / skills under an override', () => {
    const out = buildSystemPrompt(
      [{ name: 'skill-x', content: 'body' }],
      '<memory>m</memory>',
      'OVERRIDE',
      'AGENTS'
    )
    expect(out.startsWith('OVERRIDE')).toBe(true)
    expect(out).toContain('AGENTS')
    expect(out).toContain('<memory>m</memory>')
    expect(out).toContain('<skill name="skill-x">')
  })

  it('treats a whitespace-only override as absent', () => {
    const out = buildSystemPrompt([], '', '   \n\t  ')
    expect(out).toContain('Lamprey is the interface')
    expect(out).toContain('<contract>')
  })
})

describe('buildSystemPrompt — contract role layering', () => {
  it('injects the requested role fragment after the base contract', () => {
    const out = buildSystemPrompt([], '', undefined, undefined, undefined, 'coding')
    expect(out).toContain('<role mode="coding">')
    // L4 — fragment opener is "You are writing code." (was "You are in coding mode.")
    expect(out).toContain('You are writing code.')
    const contractIdx = out.indexOf('</contract>')
    const roleIdx = out.indexOf('<role mode="coding">')
    expect(roleIdx).toBeGreaterThan(contractIdx)
  })

  it('omits the role block when no role is supplied', () => {
    const out = buildSystemPrompt([], '')
    expect(out).not.toContain('<role mode=')
  })

  it('layers the role on top of an override too', () => {
    const out = buildSystemPrompt(
      [],
      '',
      'CUSTOM',
      undefined,
      undefined,
      'review'
    )
    expect(out).toContain('CUSTOM')
    expect(out).toContain('<role mode="review">')
    expect(out).toContain('SHIP if the change is good to merge')
  })
})

describe('getRoleFragment', () => {
  it('returns a non-empty string for every defined role', () => {
    for (const role of ALL_ROLES) {
      const text = getRoleFragment(role)
      expect(text.length, `role "${role}" should have a fragment`).toBeGreaterThan(40)
    }
  })

  // L4 — each fragment is 2–3 tight imperatives, not a meta-explanation
  // paragraph. The 280-byte upper bound locks the win against future bloat.
  it('keeps each fragment under 280 bytes (L4 tight-imperatives bound)', () => {
    for (const role of ALL_ROLES) {
      const text = getRoleFragment(role)
      expect(text.length, `role "${role}" fragment too long: ${text.length} bytes`).toBeLessThan(280)
    }
  })

  it('coding fragment references apply_patch and verification', () => {
    const text = getRoleFragment('coding')
    expect(text).toContain('apply_patch')
    expect(text.toLowerCase()).toMatch(/verif|typecheck|test script/)
  })

  it('frontend fragment requires visual verification, not just typecheck', () => {
    const text = getRoleFragment('frontend')
    expect(text).toContain('browser_screenshot')
    expect(text.toLowerCase()).toContain('typecheck')
  })

  it('non_technical_user fragment forbids developer jargon by example', () => {
    const text = getRoleFragment('non_technical_user')
    expect(text.toLowerCase()).toContain('jargon')
    expect(text).toContain('tsc')
  })
})

describe('buildAgentSystemPrompt (multi-agentic primitive)', () => {
  it('emits the role tag and role-specific block', () => {
    const out = buildAgentSystemPrompt('planner')
    expect(out).toContain('<role>planner</role>')
    expect(out).toContain(AGENT_ROLE_PROMPTS.planner)
  })

  // L5 — sub-agent stages no longer receive the full single-agent contract.
  // They receive a slim identity head, an optional operating-principles
  // excerpt (coder only), and the role prompt.
  it('uses the slim identity head, not the full contract (L5)', () => {
    const out = buildAgentSystemPrompt('coder')
    expect(out).toContain('Lamprey multi-agent coding harness')
    expect(out).toContain('Be honest about which underlying model you are.')
    expect(out).not.toContain('<contract>')
    expect(out).not.toContain('## How you work')
  })

  it('adds the coder operating-principles block for the coder role only (L5)', () => {
    const coderOut = buildAgentSystemPrompt('coder')
    expect(coderOut).toContain('<operating_principles>')
    expect(coderOut).toContain('Make the smallest correct change')

    const plannerOut = buildAgentSystemPrompt('planner')
    expect(plannerOut).not.toContain('<operating_principles>')

    const reviewerOut = buildAgentSystemPrompt('reviewer')
    expect(reviewerOut).not.toContain('<operating_principles>')
  })

  // L5 — rendered Reviewer prompt drops at least 70% vs L1 baseline (the
  // plan's L5-only acceptance bound). L6 will tighten to ≥ 90% once the
  // PSEUDO_TAG_GUARD bake-in is removed from the reviewer role text.
  // L1 baseline was 11,016 bytes; ≥70% drop = under 3,305 bytes.
  it('renders the reviewer prompt under the L5 size target (< 3,305 bytes, ≥70% drop from L1)', () => {
    const out = buildAgentSystemPrompt('reviewer')
    expect(out.length).toBeLessThan(3305)
  })

  it('respects an explicit base override', () => {
    const out = buildAgentSystemPrompt('reviewer', 'BASE')
    expect(out.startsWith('BASE')).toBe(true)
    expect(out).toContain('<role>reviewer</role>')
    expect(out).not.toContain('<contract>')
  })
})

// RT1 + HX2 — load-bearing reviewer rules that survive L6 unchanged. The
// pseudo-tag-listing tests are gone (L6 dropped PSEUDO_TAG_GUARD from every
// injection site; `sanitizePseudoTags` in `sanitize-pseudo-tags.ts` is now
// the safety net), but the no-tools / SHIP-CHANGES / file:line / checked-
// failure-modes invariants still must hold.
describe('AGENT_ROLE_PROMPTS.reviewer — invariants preserved through L6', () => {
  const reviewer = AGENT_ROLE_PROMPTS.reviewer

  it('declares the reviewer has no tools in this stage', () => {
    expect(reviewer).toMatch(/no tools available/i)
    expect(reviewer).toMatch(/do not emit tool calls/i)
  })

  it('preserves the SHIP / CHANGES / file:line contract', () => {
    expect(reviewer).toContain('SHIP')
    expect(reviewer).toContain('CHANGES')
    expect(reviewer.toLowerCase()).toContain('file:line')
  })

  it('requires checked failure modes and evidence', () => {
    expect(reviewer).toMatch(/checked failure modes/i)
    expect(reviewer).toMatch(/receipts, diffs, contracts, or tool metadata/i)
    expect(reviewer).toMatch(/unchecked gaps/i)
  })

  // L6 — propagation test now asserts no-tools + SHIP land in the rendered
  // prompt. The prior `<bash>` / fenced-Markdown assertions are gone — L6
  // intentionally removed PSEUDO_TAG_GUARD from every injection site.
  it('propagates the load-bearing rules into buildAgentSystemPrompt output', () => {
    const out = buildAgentSystemPrompt('reviewer')
    expect(out).toMatch(/no tools available/i)
    expect(out).toContain('SHIP')
  })
})

// L6 (Lampshade Phase, 2026-06-09) — PSEUDO_TAG_GUARD is no longer injected
// into any prompt. The exported constant stays for backward compatibility
// (@deprecated). The persist-side `sanitizePseudoTags` is the safety net.
describe('PSEUDO_TAG_GUARD — deprecated; absent from every prompt path (L6)', () => {
  it('the constant is still exported (backward compat)', () => {
    expect(typeof PSEUDO_TAG_GUARD).toBe('string')
    expect(PSEUDO_TAG_GUARD.length).toBeGreaterThan(100)
  })

  it('is absent from every AGENT_ROLE_PROMPTS entry', () => {
    for (const role of Object.keys(AGENT_ROLE_PROMPTS)) {
      expect(AGENT_ROLE_PROMPTS[role], `role "${role}" still embeds PSEUDO_TAG_GUARD`).not.toContain(
        PSEUDO_TAG_GUARD
      )
    }
  })

  it('is absent from COMPOSER_SYSTEM', () => {
    expect(COMPOSER_SYSTEM).not.toContain(PSEUDO_TAG_GUARD)
  })

  it('every rendered agent prompt is free of the literal <bash> substring', () => {
    for (const role of Object.keys(AGENT_ROLE_PROMPTS) as Array<keyof typeof AGENT_ROLE_PROMPTS>) {
      const out = buildAgentSystemPrompt(role)
      expect(out, `role "${role}" rendered prompt still names <bash>`).not.toContain('<bash>')
    }
  })

  it('rendered single-agent prompt is free of the literal <bash> substring', () => {
    expect(buildSystemPrompt([], '')).not.toContain('<bash>')
    expect(
      buildSystemPrompt([], '', undefined, undefined, undefined, 'coding')
    ).not.toContain('<bash>')
  })

  // L6 — tightened reviewer size lock. Now that PSEUDO_TAG_GUARD (~700 B)
  // is gone from the reviewer role text, the L5 size lock can tighten to
  // the original plan target of <1,024 bytes (≥90% drop from L1's 11,016).
  it('rendered reviewer prompt under 1,024 bytes (L6 tightens L5)', () => {
    const out = buildAgentSystemPrompt('reviewer')
    expect(out.length).toBeLessThan(1024)
  })
})
