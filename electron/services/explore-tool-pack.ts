import { toolRegistry } from './tool-registry'
import { runExplore, type ExploreArgs } from './explore-subagent'

// Explore subagent — exposed as a native tool the parent model calls when
// it wants to delegate a research question to a fresh context. The
// subagent runs read-only (read_file / grep_workspace / glob_workspace /
// workspace_context), investigates, and returns a single string the
// parent integrates into its larger response.
//
// Default model is the parent's model (set per call via toolExecutionContext
// when chat.ts grows a `currentModelId` field). For now we read the
// parent's current model from the context's conversationId via the chat
// loop — done in chat.ts when it invokes the tool. To keep this
// orchestrator-agnostic, the pack itself doesn't pick the model; the
// handler accepts an explicit modelId in args (which the parent's prompt
// teaches the model not to set, defaulting to the loop's default).

toolRegistry.registerNative(
  {
    id: 'explore',
    name: 'explore',
    title: 'Explore (research subagent)',
    description:
      "Delegate a research question to a fresh-context subagent that uses the read-only workspace tools (read_file, grep_workspace, glob_workspace, workspace_context) to investigate, then returns ONE concise answer with citations. Use this when you need to dig into the codebase or attached docs without bloating your own context — the subagent's intermediate tool calls and scratch work stay isolated; you only see the final summary. Default: investigates both code and documents. Set `scope: 'code'` or `scope: 'docs'` to narrow.",
    providerKind: 'native',
    providerId: 'internal',
    inputSchema: {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description:
            'The research question the subagent should answer. Be specific — vague questions like "look around" produce vague answers. Good: "Where is the chat-send IPC handler defined and what validation does it do?" Bad: "Tell me about the code."'
        },
        scope: {
          type: 'string',
          enum: ['docs', 'code', 'both'],
          description:
            'Restrict the subagent\'s search domain. "code" for workspace files only, "docs" for attached PDFs/DOCX via RAG, "both" (default) for everything.'
        },
        max_steps: {
          type: 'number',
          description:
            'Max tool-calling iterations the subagent runs. Default 10, hard ceiling 25. Higher values let it dig deeper at the cost of more model calls.'
        }
      },
      required: ['question']
    },
    risks: ['read'],
    requiresApproval: false,
    enabled: true,
    parallelizable: false
  },
  async (args, ctx) => {
    try {
      // Inherit the parent's model by default. ctx.model is set by the chat
      // handler from the active conversation's modelId. Without it, fall back
      // to the small/fast DeepSeek tier — the subagent is a research loop,
      // not the final answerer, so a cheaper model is the right default when
      // the parent hasn't supplied one.
      const modelId = ctx.model ?? 'deepseek-v4-flash'
      const result = await runExplore(args as unknown as ExploreArgs, {
        modelId,
        workspacePath: ctx.workspacePath,
        correlationId: ctx.correlationId,
        // Thread the parent's abort signal — if the user cancels the parent
        // turn, the subagent's in-flight chatStream and tool loop both abort.
        signal: ctx.signal
      })
      const meta = `\n\n[explore: ${result.steps} step${result.steps === 1 ? '' : 's'}, ${result.toolCalls} tool call${result.toolCalls === 1 ? '' : 's'}, ${result.durationMs}ms${result.hitMaxSteps ? ', hit max_steps cap' : ''}]`
      return { result: result.answer + meta, status: 'done' }
    } catch (err) {
      return {
        result: `explore error: ${(err as Error)?.message ?? String(err)}`,
        status: 'error'
      }
    }
  }
)
