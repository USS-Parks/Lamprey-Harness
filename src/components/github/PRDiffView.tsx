import { useEffect, useState } from 'react'
import { github as githubClient } from '@/lib/ipc-client'
import type {
  GitHubCompareSummary,
  GitHubPullRequest,
  GitHubPullRequestFile
} from '@/lib/github-types'

interface Props {
  owner: string
  repo: string
  pr: GitHubPullRequest
  onSendHunk?: (file: GitHubPullRequestFile) => void
}

export function PRDiffView({ owner, repo, pr, onSendHunk }: Props) {
  const [data, setData] = useState<GitHubCompareSummary | null>(null)
  const [files, setFiles] = useState<GitHubPullRequestFile[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setData(null)
    setFiles([])
    setError(null)
    void Promise.all([
      githubClient.compare(owner, repo, pr.base.ref, pr.head.ref),
      githubClient.getPullRequestFiles(owner, repo, pr.number)
    ]).then(([compare, changedFiles]) => {
      if (cancelled) return
      if (!compare.success) {
        setError(compare.error)
        return
      }
      setData(compare.data)
      if (changedFiles.success) setFiles(changedFiles.data)
    })
    return () => {
      cancelled = true
    }
  }, [owner, repo, pr.number, pr.head.ref, pr.base.ref])

  if (error) return <p className="px-2 py-2 text-[11px] text-[var(--error)]">{error}</p>
  if (!data)
    return <p className="px-2 py-2 text-[11px] text-[var(--text-muted)]">Loading diff…</p>

  const displayedFiles: GitHubPullRequestFile[] = files.length
    ? files
    : data.files.map((file) => ({
        ...file,
        sha: '',
        previousFilename: null,
        changes: file.additions + file.deletions,
        patch: null
      }))

  return (
    <div className="flex flex-col gap-2 px-2 py-2 text-[11px]">
      <div className="flex items-center gap-2 text-[var(--text-muted)]">
        <span className="uppercase tracking-wider">{data.status}</span>
        <span>
          {data.aheadBy} ahead · {data.behindBy} behind
        </span>
      </div>

      <div>
        <span className="block uppercase tracking-wider text-[var(--text-muted)]">
          Commits ({data.commits.length})
        </span>
        <ul className="mt-0.5 flex flex-col gap-0.5">
          {data.commits.slice(0, 20).map((commit) => (
            <li
              key={commit.sha}
              className="truncate text-[var(--text-secondary)]"
              title={commit.message}
            >
              <code className="mr-1 font-mono text-[var(--text-muted)]">
                {commit.sha.slice(0, 7)}
              </code>
              {commit.message.split('\n')[0]}
              {commit.author && (
                <span className="ml-1 text-[var(--text-muted)]">— {commit.author}</span>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <span className="block uppercase tracking-wider text-[var(--text-muted)]">
          Files ({files.length || data.files.length})
        </span>
        <ul className="mt-0.5 flex flex-col gap-0.5">
          {displayedFiles.map((file) => (
            <li
              key={file.filename}
              className="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-[var(--bg-tertiary)]"
            >
              <span className="rounded bg-[var(--bg-tertiary)] px-1 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                {file.status}
              </span>
              <span
                className="min-w-0 flex-1 truncate font-mono text-[var(--text-primary)]"
                title={file.filename}
              >
                {file.filename}
              </span>
              <span className="shrink-0 text-emerald-300">+{file.additions}</span>
              <span className="shrink-0 text-red-300">−{file.deletions}</span>
              {onSendHunk && file.patch && (
                <button
                  type="button"
                  onClick={() => onSendHunk(file)}
                  className="shrink-0 rounded px-1.5 py-0.5 text-[10px] text-[var(--accent)] hover:bg-[var(--bg-primary)]"
                >
                  Send hunk
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
