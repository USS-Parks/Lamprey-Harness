import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const root = join(__dirname, '..', '..')
const read = (path: string): string => readFileSync(join(root, path), 'utf8')

describe('ST-9 follow-up composer UX wiring', () => {
  it('locks Steer as the main and renderer default and exposes General controls', () => {
    const mainDefaults = read('electron/services/default-app-settings.ts')
    const rendererDefaults = read('src/stores/settings-store.ts')
    const general = read('src/components/settings/GeneralSettings.tsx')
    expect(mainDefaults).toMatch(/followUpBehavior:\s*'steer'/)
    expect(rendererDefaults).toMatch(/followUpBehavior:\s*'steer'/)
    expect(general).toContain('role="radiogroup"')
    expect(general).toContain('aria-label="Follow-up behavior"')
    expect(general).toContain("(['steer', 'queue'] as const)")
    expect(general).toContain('updateSettings({ followUpBehavior: mode })')
  })

  it('keeps the running composer editable with Enter default, Tab alternate, and separate Stop', () => {
    const input = read('src/components/chat/ChatInput.tsx')
    expect(input).toContain("if (e.key === 'Tab' && isStreaming)")
    expect(input).toContain('handleSubmit(alternateFollowUpBehavior)')
    expect(input).toMatch(/if \(e\.key === 'Enter' && !e\.shiftKey\)[\s\S]*?handleSubmit\(\)/)
    expect(input).toContain('aria-label="Stop current turn"')
    expect(input).toContain('Your draft is still editable.')
    const canSend = input.slice(input.indexOf('const canSend ='), input.indexOf('const planMode ='))
    expect(canSend).not.toContain('!isStreaming')
  })

  it('uses the Codex running-composer pattern instead of a prominent Steer button', () => {
    const input = read('src/components/chat/ChatInput.tsx')
    const actions = input.slice(
      input.indexOf('{isStreaming ? ('),
      input.indexOf(') : memoryShortcut ? (')
    )
    expect(actions).toContain('className="flex h-9 w-9')
    expect(actions).not.toContain('data-follow-up-action')
    expect(actions).not.toContain('min-w-[72px]')
    expect(actions).toContain('aria-label="Stop current turn"')
  })

  it('renders Queue and recoverable drafts above the composer with all management actions', () => {
    const queue = read('src/components/chat/FollowUpQueue.tsx')
    const view = read('src/components/chat/ChatView.tsx')
    for (const label of [
      'Edit',
      'Move queued follow-up up',
      'Move queued follow-up down',
      'Send now',
      'Delete'
    ]) {
      expect(queue).toContain(label)
    }
    expect(queue).toContain("['rejected', 'recovered']")
    expect(queue).toContain("'Recoverable follow-up draft'")
    expect(queue).toContain('aria-label="Steering follow-up pending delivery"')
    expect(queue).toContain("record.deliveryMode === 'steer' && record.status === 'accepted'")
    expect(queue).toContain('Steer')
    expect(queue).toContain('role="status"')
    expect(view.indexOf('<FollowUpQueue />')).toBeLessThan(view.indexOf('<ChatInput'))
  })

  it('routes follow-ups only through typed turn IPC with retry identity and exact target', () => {
    const store = read('src/stores/chat-store.ts')
    const action = store.slice(
      store.indexOf('submitFollowUp: async'),
      store.indexOf('updateFollowUpDraft: async')
    )
    expect(action).toContain('window.api.turn.steer({')
    expect(action).toContain('window.api.turn.queue({')
    expect(action).toContain('expectedTurnId: state.activeTurn!.turnId')
    expect(action).toContain('clientUserMessageId')
    expect(action).not.toContain('sendMessage(')
    expect(action).not.toContain('window.api.chat.send')
  })
})
