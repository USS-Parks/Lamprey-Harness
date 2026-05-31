import { MarkdownRenderer } from '@/components/artifacts/MarkdownRenderer'
import { parseReasoning } from '@/lib/reasoning'
import { useThemedIcon } from '@/lib/themed-icon'
import { ReasoningBlock } from './ReasoningBlock'
import codingLight from '@assets/Lamprey Coding Icon.png'
import codingDark from '@assets/Lamprey Coding Icon Dark View.png'

interface StreamingTextProps {
  content: string
  model?: string
}

export function StreamingText({ content, model }: StreamingTextProps) {
  const codingIconUrl = useThemedIcon(codingLight, codingDark)
  const isReasoner = model === 'deepseek-reasoner'
  const { reasoning, body, isThinking } = isReasoner
    ? parseReasoning(content)
    : { reasoning: null as string | null, body: content, isThinking: false }

  return (
    <div>
      {reasoning && <ReasoningBlock content={reasoning} isThinking={isThinking} />}
      <MarkdownRenderer content={body} />
      <img
        src={codingIconUrl}
        alt=""
        aria-hidden
        className="icon-asset ml-0.5 inline-block h-6 w-6 animate-pulse object-contain align-text-bottom"
      />
    </div>
  )
}
