import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

interface AutomatedEvidence {
  file: string
  contains: string[]
}

interface SteeringContractRow {
  row: number
  contract: string
  evidence: AutomatedEvidence[]
}

const root = join(__dirname, '..', '..')

const rows: SteeringContractRow[] = [
  {
    row: 1,
    contract: 'Same in-flight turn',
    evidence: [
      {
        file: 'electron/services/steering-boundary-wiring.test.ts',
        contains: [
          'threads one TurnRuntime',
          'turns a streamed final answer into an intermediate row'
        ]
      }
    ]
  },
  {
    row: 2,
    contract: 'Separate next-turn queue',
    evidence: [
      {
        file: 'electron/services/queued-follow-up-dispatch.test.ts',
        contains: ['claims the first position synchronously and dispatches exactly one item']
      }
    ]
  },
  {
    row: 3,
    contract: 'Stable identity',
    evidence: [
      {
        file: 'electron/services/turn-runtime.test.ts',
        contains: [
          'registers one persisted running identity per conversation',
          'applies the typed expected-turn and steerability guard'
        ]
      }
    ]
  },
  {
    row: 4,
    contract: 'Idempotent client identity',
    evidence: [
      {
        file: 'electron/ipc/turn-control.test.ts',
        contains: ['deduplicates an exact client retry even after the target turn settles']
      }
    ]
  },
  {
    row: 5,
    contract: 'Input parity',
    evidence: [
      {
        file: 'electron/services/turn-control-types.test.ts',
        contains: [
          'preserves ordered text, image, and local-image items with metadata',
          'rejects invalid or unsupported input before persistence'
        ]
      },
      {
        file: 'electron/services/steer-transcript.test.ts',
        contains: [
          'preserves mixed item order and metadata while keeping bytes and local paths out of display metadata'
        ]
      }
    ]
  },
  {
    row: 6,
    contract: 'No settings override',
    evidence: [
      {
        file: 'electron/services/turn-control-types.test.ts',
        contains: ['rejects the settings override field']
      }
    ]
  },
  {
    row: 7,
    contract: 'Safe delivery boundary',
    evidence: [
      {
        file: 'electron/services/steering-round-harness.test.ts',
        contains: [
          'never preempts a mutating tool and delivers before the following model dispatch'
        ]
      }
    ]
  },
  {
    row: 8,
    contract: 'Streaming race behavior',
    evidence: [
      {
        file: 'electron/services/steering-round-harness.test.ts',
        contains: [
          'holds a streaming Steer until output reaches the continuation boundary',
          'lets completion win atomically and rejects post-completion injection'
        ]
      }
    ]
  },
  {
    row: 9,
    contract: 'Tool-wait behavior',
    evidence: [
      {
        file: 'electron/services/steering-boundary-wiring.test.ts',
        contains: ['waits for every tool side effect and result append before consuming Steering']
      }
    ]
  },
  {
    row: 10,
    contract: 'Agent-wait behavior',
    evidence: [
      {
        file: 'electron/services/agent-wait.test.ts',
        contains: ['releases a root wait without aborting the in-flight work']
      },
      {
        file: 'electron/services/subagent-runner.test.ts',
        contains: [
          'continues the same child run after targeted input reaches its safe model boundary'
        ]
      }
    ]
  },
  {
    row: 11,
    contract: 'Non-steerable kinds',
    evidence: [
      {
        file: 'electron/services/turn-control-types.test.ts',
        contains: ['rejects non-steerable turn kind', 'rejects non-running turn status']
      },
      {
        file: 'src/lib/follow-up-state.test.ts',
        contains: ['retains rejected and restart-recovered Steering as editable drafts']
      }
    ]
  },
  {
    row: 12,
    contract: 'Composer remains usable',
    evidence: [
      {
        file: 'electron/services/follow-up-composer-wiring.test.ts',
        contains: ['keeps the running composer editable', 'separate Stop']
      }
    ]
  },
  {
    row: 13,
    contract: 'Configurable default',
    evidence: [
      {
        file: 'electron/services/follow-up-composer-wiring.test.ts',
        contains: ['locks Steer as the main and renderer default', 'Enter default, Tab alternate']
      }
    ]
  },
  {
    row: 14,
    contract: 'Queue management',
    evidence: [
      {
        file: 'electron/ipc/turn-control.test.ts',
        contains: ['lists, edits, reorders, and deletes owned queued records']
      },
      {
        file: 'electron/services/follow-up-composer-wiring.test.ts',
        contains: ['with all management actions']
      }
    ]
  },
  {
    row: 15,
    contract: 'Durability',
    evidence: [
      {
        file: 'electron/services/turn-control-db-integration.test.ts',
        contains: ['recovers running turns and accepted steers but preserves Queue']
      },
      {
        file: 'src/lib/follow-up-state.test.ts',
        contains: ['rehydrates running identity and deterministic Queue state after reload']
      }
    ]
  },
  {
    row: 16,
    contract: 'Interrupt separation',
    evidence: [
      {
        file: 'electron/services/turn-interrupt.test.ts',
        contains: ['recovers retained Steering, aborts, and settles the exact turn once']
      },
      {
        file: 'electron/ipc/turn-interrupt-wiring.test.ts',
        contains: ['contains no background terminal or process cleanup authority']
      }
    ]
  },
  {
    row: 17,
    contract: 'Root and child attribution',
    evidence: [
      {
        file: 'electron/services/turn-control-events.test.ts',
        contains: ['records identity, status, and input shape without content']
      },
      {
        file: 'electron/ipc/turn-control.test.ts',
        contains: ['accepts only the selected live child']
      }
    ]
  },
  {
    row: 18,
    contract: 'Audit/event truth',
    evidence: [
      {
        file: 'electron/services/turn-control-audit-wiring.test.ts',
        contains: [
          'records accepted, queued, edited, reordered, rejected, and deleted actions',
          'records delivered, rejected, and recovered only at durable delivery transitions'
        ]
      }
    ]
  },
  {
    row: 19,
    contract: 'One seam',
    evidence: [
      {
        file: 'electron/services/queued-follow-up-dispatch.test.ts',
        contains: [
          'runs only through runHeadlessTurn and injects the structured message exactly once'
        ]
      },
      {
        file: 'electron/services/loop-turn-wiring.test.ts',
        contains: [
          'runHeadlessTurn builds API messages from persisted history',
          'fireDueWakeups keeps its persist-then-run contract'
        ]
      }
    ]
  },
  {
    row: 20,
    contract: 'Failure visibility',
    evidence: [
      {
        file: 'electron/services/steer-transcript.test.ts',
        contains: [
          'rejects an unreadable item without dropping a later valid Steer',
          'recovers every pending target on provider failure'
        ]
      },
      {
        file: 'electron/services/queued-follow-up-dispatch.test.ts',
        contains: ['leaves later items queued', 'does not relabel an already-delivered follow-up']
      }
    ]
  }
]

describe('ST-11 normative Steering matrix coverage', () => {
  it('maps every canonical row exactly once in order', () => {
    expect(rows.map((row) => row.row)).toEqual(Array.from({ length: 20 }, (_, index) => index + 1))
    expect(new Set(rows.map((row) => row.contract)).size).toBe(20)
  })

  it.each(rows)('row $row — $contract has executable automated evidence', ({ evidence }) => {
    expect(evidence.length).toBeGreaterThan(0)
    for (const item of evidence) {
      const source = readFileSync(join(root, item.file), 'utf8')
      expect(source).toMatch(/\b(?:it|test)(?:\.each)?\s*\(/)
      for (const expected of item.contains) expect(source).toContain(expected)
    }
  })
})
