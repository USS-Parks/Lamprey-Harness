import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'

// AC-28 — message_stage_metrics is historical RT2. No writer since Unburdening.
const electronRoot = join(__dirname, '..')

function listTsFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...listTsFiles(full))
    else if (name.endsWith('.ts')) out.push(full)
  }
  return out
}

describe('AC-28 message_stage_metrics is write-less', () => {
  it('no INSERT INTO message_stage_metrics under electron/ except schema-init', () => {
    const hits: string[] = []
    for (const file of listTsFiles(electronRoot)) {
      const text = readFileSync(file, 'utf-8')
      if (!/INSERT\s+INTO\s+message_stage_metrics/i.test(text)) continue
      if (file.endsWith(`${join('services', 'schema-init.ts')}`)) continue
      hits.push(file)
    }
    expect(hits, hits.join('\n')).toEqual([])
  })
})
