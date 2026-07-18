import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const root = join(__dirname, '..', '..')
const read = (path: string): string => readFileSync(join(root, path), 'utf8')

describe('ST-10 turn-control audit and activity wiring locks', () => {
  it('records accepted, queued, edited, reordered, rejected, and deleted actions at IPC seams', () => {
    const source = read('electron/ipc/turn-control.ts')
    for (const disposition of ['accepted', 'queued', 'edited', 'rejected', 'deleted']) {
      expect(source).toContain(`'${disposition}'`)
    }
    expect(source).toContain('buildQueueReorderedEvent(')
    expect(source).toContain('buildSubmissionRejectedEvent(')
    expect(source).toContain("type: 'turn.recovered'")
  })

  it('records delivered, rejected, and recovered only at durable delivery transitions', () => {
    const source = read('electron/services/steer-delivery.ts')
    const deliveredTransition = source.indexOf(
      "transitionFollowUp(input.steer.followUpId, 'delivered'"
    )
    const commit = source.indexOf('commit()', deliveredTransition)
    const deliveredEvent = source.indexOf("recordFollowUpAuditEvent(followUp, 'delivered'", commit)
    expect(deliveredTransition).toBeGreaterThan(-1)
    expect(commit).toBeGreaterThan(deliveredTransition)
    expect(deliveredEvent).toBeGreaterThan(commit)
    expect(source).toContain("recordFollowUpAuditEvent(rejected, 'rejected'")
    expect(source.match(/recordFollowUpAuditEvent\([^)]*'recovered'/g)?.length).toBe(2)
  })

  it('uses the specific interrupted event and keeps the activity surface bubble-free', () => {
    const interrupt = read('electron/services/turn-interrupt.ts')
    const chip = read('src/components/chat/ToolActivityChip.tsx')
    expect(interrupt).toContain("type: 'turn.interrupted'")
    expect(chip).toContain('presentFollowUpActivity(followUps)')
    expect(chip).toContain('aria-label="Follow-up activity"')
    expect(chip).not.toContain('saveMessage(')
    expect(chip).not.toContain('addMessage(')
  })

  it('never reads content-bearing input fields into event payloads', () => {
    const source = read('electron/services/turn-control-events.ts')
    expect(source).not.toMatch(/item\.(text|path|imageUrl|name|mimeType|sizeBytes)/)
    expect(source).toContain("redaction: 'metadata'")
    expect(source).toContain('TURN_CONTROL_EVENT_ITEM_CAP')
  })
})
