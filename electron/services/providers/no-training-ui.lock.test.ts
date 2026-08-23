import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'

const root = join(__dirname, '../../..')

function walkTs(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'out' || name === 'dist') continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walkTs(p, acc)
    else if (/\.(ts|tsx)$/.test(name) && !name.includes('.test.') && !name.includes('.lock.')) {
      acc.push(p)
    }
  }
  return acc
}

describe('TL-C6 no training UI in core', () => {
  it('src and electron product files have no LoRA/RL trainer surface', () => {
    const files = [...walkTs(join(root, 'src')), ...walkTs(join(root, 'electron'))]
    const banned =
      /LoRA trainer|RLHF trainer|Unsloth training UI|fine-tune workspace|dataset recipe studio/i
    const hits: string[] = []
    for (const file of files) {
      const text = readFileSync(file, 'utf-8')
      if (banned.test(text)) hits.push(file.replace(root + '/', ''))
    }
    expect(hits).toEqual([])
  })
})
