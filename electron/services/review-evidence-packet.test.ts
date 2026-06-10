import { describe, expect, it } from 'vitest'
import {
  buildReviewEvidencePacket,
  extractDiffSnippets,
  parseNameStatus
} from './review-evidence-packet'

describe('review evidence packet', () => {
  it('parses name-status output', () => {
    expect(parseNameStatus('M\tsrc/a.ts\nA src/b.ts\n')).toEqual([
      { status: 'M', path: 'src/a.ts' },
      { status: 'A', path: 'src/b.ts' }
    ])
  })

  it('extracts bounded changed-hunk snippets', () => {
    const snippets = extractDiffSnippets(
      [
        'diff --git a/src/a.ts b/src/a.ts',
        '+++ b/src/a.ts',
        '@@ -1,3 +1,3 @@',
        ' const a = 1',
        '-const b = 2',
        '+const b = 3'
      ].join('\n')
    )

    expect(snippets).toMatchObject([
      {
        file: 'src/a.ts',
        header: '@@ -1,3 +1,3 @@'
      }
    ])
    expect(snippets[0].snippet).toContain('+const b = 3')
  })

  it('includes the builder narrative whenever it is provided', async () => {
    const packet = await buildReviewEvidencePacket({
      conversationId: 'conv-1',
      correlationId: 'corr-1',
      workspacePath: 'C:/repo',
      userGoal: 'fix proof gate',
      builderNarrative: 'I definitely fixed everything. Trust me.',
      deps: {
        now: () => 123,
        getActiveContract: () => ({
          id: 'ctr_1',
          conversationId: 'conv-1',
          status: 'active',
          implicit: false,
          source: 'user',
          goal: 'fix proof gate',
          acceptanceCriteria: ['banner appears'],
          expectedFiles: ['src/components/chat/ProofGateBanner.tsx'],
          nonGoals: ['rewrite chat'],
          verificationCommands: ['npm test'],
          requiredReceiptKinds: ['verify'],
          createdAt: 1,
          updatedAt: 1
        }),
        listReceipts: () => [
          {
            id: 'prf_1',
            conversationId: 'conv-1',
            kind: 'verify',
            status: 'passed',
            workspacePath: 'C:/repo',
            cwd: 'C:/repo',
            command: 'npm test',
            commandHash: 'cmdhash',
            exitCode: 0,
            startedAt: 10,
            finishedAt: 20,
            durationMs: 10,
            stdoutHash: 'out',
            stderrHash: 'err',
            outputPreview: '',
            outputTruncated: false,
            metrics: { passed: 1 },
            gitHead: 'abc',
            dirty: true,
            diffHash: 'diff',
            gitDirty: true,
            timedOut: false,
            createdBy: 'agent',
            createdAt: 21,
            stdoutPreview: '',
            stderrPreview: '',
            stdoutTruncated: false,
            stderrTruncated: false,
            stdoutBytes: 0,
            stderrBytes: 0,
            parsedMetrics: { passed: 1 }
          }
        ],
        listToolCalls: () => [
          {
            id: 'tool_1',
            toolId: 'apply_patch',
            name: 'apply_patch',
            conversationId: 'conv-1',
            args: {},
            startedAt: 30,
            finishedAt: 40,
            status: 'done'
          }
        ],
        runGit: async (args) => {
          if (args.includes('--name-status')) {
            return { stdout: 'M\tsrc/components/chat/ProofGateBanner.tsx\n', stderr: '', code: 0 }
          }
          return {
            stdout: [
              'diff --git a/src/components/chat/ProofGateBanner.tsx b/src/components/chat/ProofGateBanner.tsx',
              '+++ b/src/components/chat/ProofGateBanner.tsx',
              '@@ -1 +1 @@',
              '-old',
              '+new'
            ].join('\n'),
            stderr: '',
            code: 0
          }
        }
      }
    })

    expect(packet.kind).toBe('review_evidence_packet')
    expect(packet.contract?.id).toBe('ctr_1')
    expect(packet.git.changedFiles[0].path).toBe('src/components/chat/ProofGateBanner.tsx')
    expect(packet.proof.receipts[0]).toMatchObject({
      id: 'prf_1',
      parsedMetrics: { passed: 1 }
    })
    expect(packet.proof.staleGreenWarnings[0]).toContain('prf_1')
    expect(packet.toolCalls[0]).toMatchObject({ id: 'tool_1', name: 'apply_patch' })
    expect(packet.builderNarrative).toBe('I definitely fixed everything. Trust me.')
    expect(JSON.stringify(packet)).toContain('Trust me')
  })

  it('omits the builder narrative field when none is supplied', async () => {
    const packet = await buildReviewEvidencePacket({
      conversationId: 'conv-1',
      workspacePath: 'C:/repo',
      deps: {
        getActiveContract: () => null,
        listReceipts: () => [],
        listToolCalls: () => [],
        runGit: async () => ({ stdout: '', stderr: '', code: 0 })
      }
    })

    expect(packet.builderNarrative).toBeUndefined()
  })
})
