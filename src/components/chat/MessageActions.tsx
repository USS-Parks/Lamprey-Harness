import { useState } from 'react'
import { toast } from '@/stores/toast-store'
import copyLight from '@assets/Lamprey Copy Icon.png'
import copyDark from '@assets/Lamprey Copy Icon Dark View.png'
import thumbsUpLight from '@assets/Lamprey Thumbs Up Icon.png'
import thumbsUpDark from '@assets/Lamprey Thumbs Up Icon Dark View.png'
import thumbsDownLight from '@assets/Lamprey Thumbs Down Icon.png'
import thumbsDownDark from '@assets/Lamprey Thumbs Down Icon Dark View.png'
import forkLight from '@assets/Lamprey Work-Fork Icon.png'
import forkDark from '@assets/Lamprey Work-Fork Icon Dark View.png'
import pinLight from '@assets/Lamprey Pin As Chapter Icon.png'
import pinDark from '@assets/Lamprey Pin As Chapter Icon Dark View.png'

interface MessageActionsProps {
  content: string
  onFork?: () => void
  onPin?: () => void
}

type Vote = 'up' | 'down' | null

interface ActionButtonProps {
  iconLight: string
  iconDark: string
  title: string
  onClick: () => void
  active?: boolean
}

function ActionButton({ iconLight, iconDark, title, onClick, active }: ActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
        active
          ? 'bg-[var(--accent-dim)] ring-1 ring-[var(--accent)]'
          : 'hover:bg-[var(--bg-tertiary)]'
      }`}
    >
      <span className="relative flex h-[18px] w-[18px] items-center justify-center">
        <img
          src={iconLight}
          alt=""
          aria-hidden
          className="themed-variant-light icon-asset h-[18px] w-[18px] object-contain"
        />
        <img
          src={iconDark}
          alt=""
          aria-hidden
          className="themed-variant-dark icon-asset h-[18px] w-[18px] object-contain"
        />
      </span>
    </button>
  )
}

function CheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-[var(--accent)]"
      aria-hidden
    >
      <path d="M20 6L9 17l-5-5" />
    </svg>
  )
}

export function MessageActions({ content, onFork, onPin }: MessageActionsProps) {
  const [vote, setVote] = useState<Vote>(null)
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('Could not copy to clipboard')
    }
  }

  const setVoteWith = (v: Vote) => {
    setVote((prev) => (prev === v ? null : v))
  }

  const handleFork = () => {
    if (onFork) onFork()
    else toast.info('Fork from this message — coming soon')
  }

  const handlePin = () => {
    if (onPin) onPin()
    else toast.info('Pin as memory chapter — coming soon')
  }

  return (
    <div className="mt-2 flex items-center gap-1 pl-1">
      {copied ? (
        <button
          type="button"
          title="Copied"
          aria-label="Copied"
          className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--accent-dim)]"
        >
          <CheckIcon />
        </button>
      ) : (
        <ActionButton
          iconLight={copyLight}
          iconDark={copyDark}
          title="Copy"
          onClick={handleCopy}
        />
      )}
      <ActionButton
        iconLight={thumbsUpLight}
        iconDark={thumbsUpDark}
        title="Good response"
        onClick={() => setVoteWith('up')}
        active={vote === 'up'}
      />
      <ActionButton
        iconLight={thumbsDownLight}
        iconDark={thumbsDownDark}
        title="Bad response"
        onClick={() => setVoteWith('down')}
        active={vote === 'down'}
      />
      <ActionButton
        iconLight={forkLight}
        iconDark={forkDark}
        title="Fork from here"
        onClick={handleFork}
      />
      <ActionButton
        iconLight={pinLight}
        iconDark={pinDark}
        title="Pin as memory chapter"
        onClick={handlePin}
      />
    </div>
  )
}
