import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  FOLLOW_UP_ACTORS,
  FOLLOW_UP_DELIVERY_MODES,
  FOLLOW_UP_REJECTION_REASONS,
  FOLLOW_UP_STATUSES,
  TURN_KINDS,
  TURN_STATUSES,
  clientMessageDedupeKey,
  guardExpectedTurn,
  isTerminalFollowUpStatus,
  isTerminalTurnStatus,
  validateFollowUpSubmission,
  validateTurnInputItems,
  type ActiveTurnIdentity,
  type TurnId
} from './turn-control-types'

const activeRegularTurn: ActiveTurnIdentity = {
  conversationId: 'conversation-1',
  turnId: 'turn-1' as TurnId,
  kind: 'regular',
  status: 'running'
}

function rendererLiterals(name: string): string[] {
  const source = readFileSync(resolve(process.cwd(), 'src/lib/turn-control-types.ts'), 'utf8')
  const match = source.match(new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\] as const`))
  if (!match?.[1]) throw new Error(`renderer contract array not found: ${name}`)
  return [...match[1].matchAll(/'([^']+)'/g)].map((item) => item[1])
}

describe('turn-control contracts', () => {
  it('keeps main and renderer literal vocabularies in exact parity', () => {
    expect(rendererLiterals('TURN_KINDS')).toEqual(TURN_KINDS)
    expect(rendererLiterals('TURN_STATUSES')).toEqual(TURN_STATUSES)
    expect(rendererLiterals('FOLLOW_UP_DELIVERY_MODES')).toEqual(FOLLOW_UP_DELIVERY_MODES)
    expect(rendererLiterals('FOLLOW_UP_STATUSES')).toEqual(FOLLOW_UP_STATUSES)
    expect(rendererLiterals('FOLLOW_UP_REJECTION_REASONS')).toEqual(FOLLOW_UP_REJECTION_REASONS)
    expect(rendererLiterals('FOLLOW_UP_ACTORS')).toEqual(FOLLOW_UP_ACTORS)
  })

  it('preserves ordered text, image, and local-image items with metadata', () => {
    const input = [
      { type: 'text', text: 'first' },
      {
        type: 'image',
        imageUrl: 'data:image/png;base64,AA==',
        mimeType: 'image/png',
        name: 'inline.png',
        sizeBytes: 1,
        width: 1,
        height: 1
      },
      {
        type: 'localImage',
        path: 'C:\\workspace\\local.png',
        mimeType: 'image/png',
        name: 'local.png',
        sizeBytes: 2,
        width: 2,
        height: 2
      }
    ]

    const result = validateTurnInputItems(input)
    expect(result).toEqual({ ok: true, value: input })
  })

  it.each([
    { input: [], reason: 'invalidInput' },
    { input: [{ type: 'audio', url: 'x' }], reason: 'unsupportedInput' },
    { input: [{ type: 'text', text: '' }], reason: 'invalidInput' },
    {
      input: [{ type: 'image', imageUrl: 'x', mimeType: 'text/plain' }],
      reason: 'unsupportedInput'
    },
    {
      input: [{ type: 'localImage', path: ' local.png' }],
      reason: 'invalidInput'
    },
    {
      input: [{ type: 'text', text: 'ok', unexpected: true }],
      reason: 'invalidInput'
    }
  ])('rejects invalid or unsupported input before persistence: $reason', ({ input, reason }) => {
    const result = validateTurnInputItems(input)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.rejection.reason).toBe(reason)
  })

  it('validates a strict Steer submission and defaults actor to user', () => {
    const result = validateFollowUpSubmission({
      conversationId: 'conversation-1',
      deliveryMode: 'steer',
      expectedTurnId: 'turn-1',
      clientUserMessageId: 'client-1',
      input: [{ type: 'text', text: 'change course' }]
    })

    expect(result).toEqual({
      ok: true,
      value: {
        conversationId: 'conversation-1',
        deliveryMode: 'steer',
        expectedTurnId: 'turn-1',
        clientUserMessageId: 'client-1',
        actor: 'user',
        input: [{ type: 'text', text: 'change course' }]
      }
    })
  })

  it('validates Queue without an active-turn target', () => {
    const result = validateFollowUpSubmission({
      conversationId: 'conversation-1',
      deliveryMode: 'queue',
      actor: 'model',
      sourceTaskId: 'task-1',
      input: [{ type: 'text', text: 'do this next' }]
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.expectedTurnId).toBeUndefined()
  })

  it.each([
    [{ deliveryMode: 'steer', input: [{ type: 'text', text: 'x' }] }, 'conversationId'],
    [
      { conversationId: 'c', deliveryMode: 'steer', input: [{ type: 'text', text: 'x' }] },
      'expectedTurnId'
    ],
    [
      {
        conversationId: 'c',
        deliveryMode: 'queue',
        expectedTurnId: 'turn-1',
        input: [{ type: 'text', text: 'x' }]
      },
      'expectedTurnId'
    ],
    [
      {
        conversationId: 'c',
        deliveryMode: 'steer',
        expectedTurnId: 'turn-1',
        input: [{ type: 'text', text: 'x' }],
        extra: true
      },
      'extra'
    ]
  ])('rejects malformed submissions at %s', (partial, field) => {
    const result = validateFollowUpSubmission(partial)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.rejection.field).toBe(field)
  })

  it.each(['model', 'workspacePath', 'approvalMode', 'sandboxMode', 'activeSkillIds', 'turnKind'])(
    'rejects the settings override field %s',
    (field) => {
      const result = validateFollowUpSubmission({
        conversationId: 'c',
        deliveryMode: 'steer',
        expectedTurnId: 'turn-1',
        input: [{ type: 'text', text: 'x' }],
        [field]: 'override'
      })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.rejection.reason).toBe('settingsOverride')
    }
  )

  it('accepts only the exact active regular running turn', () => {
    expect(guardExpectedTurn(activeRegularTurn, 'turn-1')).toEqual({
      ok: true,
      turn: activeRegularTurn
    })
  })

  it('rejects when there is no active turn', () => {
    const result = guardExpectedTurn(null, 'turn-1')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.rejection.reason).toBe('noActiveTurn')
  })

  it('rejects a stale expected turn ID with both IDs visible', () => {
    const result = guardExpectedTurn(activeRegularTurn, 'turn-stale')
    expect(result).toEqual({
      ok: false,
      rejection: {
        reason: 'turnMismatch',
        message: 'The active turn no longer matches the requested turn.',
        expectedTurnId: 'turn-stale',
        activeTurnId: 'turn-1'
      }
    })
  })

  it.each(['review', 'manualCompaction', 'terminal'] as const)(
    'rejects non-steerable turn kind %s',
    (kind) => {
      const result = guardExpectedTurn({ ...activeRegularTurn, kind }, 'turn-1')
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.rejection.reason).toBe('nonSteerableTurn')
    }
  )

  it.each(['completed', 'interrupted', 'cancelled', 'failed', 'recovered'] as const)(
    'rejects non-running turn status %s',
    (status) => {
      const result = guardExpectedTurn({ ...activeRegularTurn, status }, 'turn-1')
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.rejection.reason).toBe('turnNotRunning')
    }
  )

  it('builds collision-safe client-message dedupe keys', () => {
    expect(clientMessageDedupeKey('a|b', 'c')).not.toBe(clientMessageDedupeKey('a', 'b|c'))
    expect(clientMessageDedupeKey('conversation-1', 'client-1')).toBe(
      '["conversation-1","client-1"]'
    )
  })

  it('classifies terminal turn and follow-up statuses', () => {
    expect(isTerminalTurnStatus('running')).toBe(false)
    expect(isTerminalTurnStatus('completed')).toBe(true)
    expect(isTerminalFollowUpStatus('accepted')).toBe(false)
    expect(isTerminalFollowUpStatus('queued')).toBe(false)
    expect(isTerminalFollowUpStatus('delivered')).toBe(true)
    expect(isTerminalFollowUpStatus('deleted')).toBe(true)
  })
})
