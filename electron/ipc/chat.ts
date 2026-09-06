import { saveStructuredUserMessage, readStructuredUserContent } from '../services/user-message-content'
import { prepareSteerInput } from '../services/steer-transcript'
import { ipcMain } from 'electron'
import { randomUUID } from 'crypto'
import { filterOrchestrationTools } from '../services/orchestration-tools'
import {
  filterBrowserDeveloperTools,
  filterLoopTools
} from '../services/gated-tool-filters'
import {
  chatOnce,
  chatStream,
  getProviderForModel,
  resolveModel,
  type ModelRequestAudit
} from '../services/providers/registry'
import { boundedJsonPreview, recordEvent } from '../services/event-log'
import { validateChatSendRequest } from './chat-validation'
import * as convStore from '../services/conversation-store'
import { isPlanModeActive } from '../services/conversation-store'
import { drainPendingDocuments } from '../services/pending-turn-documents'
import { drainPendingArtifacts } from '../services/pending-turn-artifacts'
import { interruptTurn } from '../services/turn-interrupt'
import { finalizeTurn } from '../services/finalize-turn'
import {
  resolveSingleToolCall,
  resolveToolCallWindows,
  type ResolvedToolCall
} from '../services/chat-tool-dispatch'
import { emitTurnStarted } from '../services/turn-lifecycle-events'
import {
  createQueuedFollowUpDispatchDependencies,
  dispatchNextQueuedFollowUp,
  type InjectedUserMessage,
  type QueuedFollowUpRunInput
} from '../services/queued-follow-up-dispatch'
import * as memStore from '../services/memory-store'
import { buildChaptersBlock } from '../services/chapters-store'
import {
  compressOldestMessages,
  estimateTokensForMessages,
  getEffectiveMessages
} from '../services/context-compressor'
import {
  buildTaskNotificationsBlock,
  drainAsyncEventsForPrompt
} from '../services/async-event-bridge'
import { buildSystemPrompt } from '../services/system-prompt-builder'
import { readAgentsMd } from '../services/agents-md-loader'
import { fireHooks } from '../services/hooks-runner'
import { listSkills, getSkillContent } from '../services/skill-loader'
import {
  buildApiMessagesFromStoredMessages,
  modelEchoesReasoningContent
} from '../services/chat-history'
import { readSettings } from '../services/settings-helper'
import { toolRegistry } from '../services/tool-registry'
import {
  activateLazySurface,
  isLazyActive,
  isSurfaceDowngraded, getUnlockedTools
} from '../services/tool-unlock-state'
import { maybeSpillToolResult, DEFAULT_SPILL_THRESHOLD } from '../services/tool-result-spill'

export { resolveSingleToolCall }
// SP-4 — ghost-reply guard (D5): persist a system notice when a turn fails
// before any visible reply row landed.
import {
  turnEndedGhosted,
  isUserAbortError,
  buildGhostReplyNotice
} from '../services/ghost-reply-guard'
import {
  MAX_TOOL_ROUNDS,
  TOOL_ROUND_CAP_MESSAGE,
  ToolRoundCapError
} from '../services/tool-round-cap-error'
import { type AgentRunPhase } from '../services/agent-run-phase'
import { getTaskWorkspace } from '../services/task-workspace'
import { parseFallbackToolCalls, FALLBACK_TOOL_INSTRUCTION } from '../services/fallback-tool-parser'
import { recordCapabilityCheck, isDowngraded } from '../services/providers/capability-tracker'
import { emitChatEvent } from '../services/chat-events'
import { readDeepResearchSettings } from '../services/research/adapter-cascade'
import { trace } from '../services/debug-trace'
import { routeChatTurn } from '../services/research/intent'
import {
  runDeepResearch, NoSourcesError
} from '../services/research'
// UB-5 (Unburdening Phase, 2026-06-10) — the final-response composer is
// excised: the reply the user reads is the model's own reply, always. The
// R6 reasoning trail (kept, user-directed) moved to reasoning-trail.ts and
// the agentic-coding config (mode + skills, no composer) to its own module.
import { concatReasoningTrail } from '../services/reasoning-trail'
import { loadAgenticCodingConfig } from '../services/agentic-coding-config'
import {
  turnRuntimeRegistry,
  type SettledTurnStatus,
  type TurnRuntime
} from '../services/turn-runtime'
import type { TurnKind } from '../services/turn-control-types'
import {
  consumeSteersAtBoundary,
  type SteerBoundaryResult
} from '../services/steer-delivery'
// LP-1 (Loop Phase) — wire the headless turn runner into the loop runner.
import { setLoopTurnRunner } from '../services/loop-runner'
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool
} from 'openai/resources/chat/completions'

interface ModelParams {
  temperature?: number
  topP?: number
  maxTokens?: number | null
}

function readSettingsJson(): Record<string, unknown> | null {
  // JM-12 (CC-22) — delegate to the shared mtime-cached reader instead of
  // re-reading + re-parsing settings.json (this was called once per tool
  // round of every turn).
  try {
    return readSettings()
  } catch {
    return null
  }
}

function loadModelConfig(
  raw: Record<string, unknown> | null,
  model: string
): { params: ModelParams; systemPromptOverride?: string } {
  if (!raw) return { params: {} }
  const cfg = (raw.modelConfig as Record<string, Record<string, unknown>> | undefined)?.[model]
  if (!cfg) return { params: {} }
  return {
    params: {
      temperature: typeof cfg.temperature === 'number' ? cfg.temperature : undefined,
      topP: typeof cfg.topP === 'number' ? cfg.topP : undefined,
      maxTokens:
        typeof cfg.maxTokens === 'number'
          ? cfg.maxTokens
          : cfg.maxTokens === null
            ? null
            : undefined
    },
    systemPromptOverride:
      typeof cfg.systemPromptOverride === 'string' ? cfg.systemPromptOverride : undefined
  }
}

// UB-5 — the final-response composer is excised entirely; agentic-coding
// config (mode + skills) lives in `../services/agentic-coding-config`.

// Idempotent union: preserves order of `base`, then appends ids from `extra`
// that aren't already present. Used to merge auto-activated agentic skills
// into the request's activeSkillIds without duplicating user-picked entries.
export function mergeAgenticSkillIds(base: string[], extra: string[]): string[] {
  const seen = new Set(base)
  const out = [...base]
  for (const id of extra) {
    if (id && !seen.has(id)) {
      seen.add(id)
      out.push(id)
    }
  }
  return out
}

// Tool definitions (memory_add + MCP tools) come from toolRegistry.
// Approval gating is owned by permissionsService — both live in services/.

// Per-turn tool-call iteration ceiling. Each runChatRound recursive call
// increments `round`; we hard-stop when the counter exceeds this.
//
// Was 10 in 0.2.x — that tripped on routine codebase exploration where
// the planner needed 12-20 sequential reads to map a new repo. Codex
// and Claude Code allow 100+ rounds per agent loop; 50 is a generous
// midpoint that lets real work finish without going unbounded.
// Ceiling lives on ToolRoundCapError so a cap throw is instanceof-testable.

function emitPhase(conversationId: string, phase: AgentRunPhase): void {
  emitChatEvent('chat:phase', { conversationId, phase })
}

function dispatchQueuedFollowUpAfterCompletedTurn(input: {
  conversationId: string
  model: string
  activeSkillIds?: string[]
}): void {
  const dependencies = createQueuedFollowUpDispatchDependencies({
    settleTurn: (runtime, status) => {
      finalizeTurn({
        runtime,
        status,
        conversationId: runtime.conversationId,
        correlationId: runtime.correlationId
      })
    },
    runTurn: (queued: QueuedFollowUpRunInput) =>
      runHeadlessTurn({
        conversationId: queued.conversationId,
        model: queued.model,
        activeSkillIds: queued.activeSkillIds,
        promptBody: queued.promptBody,
        runtime: queued.runtime,
        injectedUserMessage: queued.injectedUserMessage
      })
  })
  void dispatchNextQueuedFollowUp(input, dependencies).catch((error) => {
    console.error('[chat] queued follow-up scheduling failed:', error)
  })
}

async function consumeRootSteersAtBoundary(
  runtime: TurnRuntime,
  messages: ChatCompletionMessageParam[],
  model: string
): Promise<SteerBoundaryResult> {
  return consumeSteersAtBoundary(runtime, messages, model, null)
}

export function registerChatHandlers(): void {
  ipcMain.handle('chat:send', async (_event, request) => {
    // Defensive: the renderer is trusted but a malformed payload (hot
    // reload race, programmatic caller, future SDK consumer) must not
    // crash the handler. Validate the shape before doing anything.
    const validation = validateChatSendRequest(request)
    if (!validation.ok) {
      return { success: false, error: validation.error }
    }
    const { content: rawContent, model, activeSkillIds } = validation.value
    // D3 — the prompt body the rest of the handler sees may have a
    // /research or --no-research prefix stripped off it. The actual
    // routing decision is made below before any model dispatch.
    let content = rawContent
    let conversationId = validation.value.conversationId

    // Hoisted so the catch block can reference it when an exception fires
    // before the TurnRuntime registration runs. Generated here so the
    // chat.error event always carries a
    // correlationId, even when the user typed into a conversation that
    // failed to materialise.
    const correlationId = randomUUID()
    let turnRuntime: TurnRuntime | null = null

    try {
      if (conversationId === 'new' || !conversationId) {
        const conv = convStore.createConversation(model)
        conversationId = conv.id
      }

      if (!convStore.getConversation(conversationId)) throw new Error('The task no longer exists.')
      if (turnRuntimeRegistry.lookupActive(conversationId)) throw new Error('This task already has an active turn. Use Steer or Queue.')
      const orderedInput = validation.value.input
      if (orderedInput?.some(item => item.type !== 'text') && !resolveModel(model).supportsVision) throw new Error('This model does not support images. Choose a vision model or remove the images.')
      let prepared = orderedInput ? await prepareSteerInput(orderedInput) : null
      const userMessageId = randomUUID()

      // D3 — Deep research routing decision. Strips any /research or
      // --no-research prefix from the prompt and, when auto-trigger is
      // enabled in settings (defaults to off until D10 ships the real
      // orchestrator), runs the intent classifier. The /research prefix
      // forces the pipeline regardless of the auto-trigger setting.
      const deepResearchSettings = readDeepResearchSettings()
      let researchRoute: Awaited<ReturnType<typeof routeChatTurn>> | null = null
      try {
        researchRoute = orderedInput?.some(item => item.type !== 'text') ? null : await routeChatTurn(orderedInput?.filter(item => item.type === 'text').map(item => item.text).join('\n\n') ?? rawContent, {
          autoTrigger: deepResearchSettings.autoTrigger,
          planMode: isPlanModeActive(conversationId),
          modelOverride: deepResearchSettings.classifierModel
        })
      } catch (err) {
        console.warn('[chat] research routing decision threw; falling back to normal flow:', err)
      }
      if (researchRoute) {
        // Use the cleaned body (prefix stripped) for the saved message and
        // every downstream model call.
        content = researchRoute.kind === 'research' ? researchRoute.body : researchRoute.content
        if (prepared) prepared = await prepareSteerInput([{ type: 'text', text: content }])
      }

      if (turnRuntimeRegistry.lookupActive(conversationId)) throw new Error('This task already has an active turn. Use Steer or Queue.')
      saveStructuredUserMessage({
        id: userMessageId,
        conversationId,
        role: 'user',
        content: prepared?.displayContent ?? content,
        model
      }, prepared?.apiMessage.role === 'user' ? prepared.apiMessage.content : undefined)

      // ST-3: one stable identity spans research, research fallback, and
      // ordinary dispatch. Loops and wake-ups register through the same
      // registry inside runHeadlessTurn.
      turnRuntime = turnRuntimeRegistry.register({
        conversationId,
        correlationId,
        kind: 'regular'
      })
      emitTurnStarted(turnRuntime)

      // If routing chose the research pipeline, hand off to runDeepResearch
      // and emit its outcome as the assistant message. Most errors fall
      // through to the outer catch which emits a chat:error event so the
      // user sees the problem. EXCEPTION: a NoSourcesError (R1+R2) is
      // recoverable — we persist a system note about the failed search and
      // fall through to a normal chat turn so the model can answer from
      // training knowledge instead of ghosting the conversation.
      if (researchRoute && researchRoute.kind === 'research') {
        // The shared runtime lets chat:cancel interrupt research and remains
        // active if NoSourcesError falls through to ordinary dispatch.
        try {
          const outcome = await runDeepResearch({
            question: researchRoute.body,
            depth: researchRoute.depth,
            conversationId,
            correlationId,
            abortSignal: turnRuntime.signal
          })
          // D11 will register the artifact with the renderer; D10's job
          // is to drop the assistant message containing the executive
          // summary and a clickable link to the on-disk markdown.
          convStore.saveMessage({
            id: randomUUID(),
            conversationId,
            role: 'assistant',
            content: `${outcome.summary}\n\n**Sources:** ${outcome.sourceCount} (${outcome.acceptedCount} accepted, ${outcome.singleSourceCount} single-source, ${outcome.disputedCount} disputed) · Providers: ${outcome.providersUsed.join(', ') || 'none'}\n\n[Open full report](artifact://research/${outcome.filename})`,
            model
          })
          finalizeTurn({
            runtime: turnRuntime,
            status: 'completed',
            conversationId,
            model,
            activeSkillIds,
            correlationId,
            steerRecoveryReason:
              'research completed before pending Steering reached an ordinary model boundary',
            dispatchQueue: dispatchQueuedFollowUpAfterCompletedTurn
          })
          return {
            success: true,
            data: { conversationId, correlationId, turnId: turnRuntime.turnId }
          }
        } catch (researchErr: unknown) {
          if (researchErr instanceof NoSourcesError) {
            // R1+R2 — recoverable. Persist a SYSTEM-role message that
            // tells the model (and the user, in the transcript) that the
            // search cascade returned nothing. The fall-through runs the
            // normal chat dispatch which picks this system note up via
            // promptHistory below.
            const trail = researchErr.summary()
            convStore.saveMessage({
              id: randomUUID(),
              conversationId,
              role: 'system',
              content:
                'Deep research fallback: the web-search cascade returned no usable sources for this prompt. ' +
                'Answer from training knowledge ONLY. Be explicit that web search returned nothing, name any ' +
                'limitations (no recent events, no citations), and offer to retry with a narrower query or ' +
                'after the user configures a Brave Search / SerpAPI key in Settings → API Keys.\n\n' +
                `Search provider trail:\n${trail}`,
              model
            })
            // Tell the renderer the research stage failed cleanly so the
            // banner closes; the next phase emit (`understanding`) then
            // re-opens the normal-chat lifecycle.
            emitChatEvent('chat:error', {
              conversationId,
              error: `Research cascade returned no sources — falling back to model knowledge.`
            })
            // Fall through to the normal-chat dispatch below. Do NOT return.
          } else {
            // Anything else from runDeepResearch (FabricatedCitationError,
            // DeepResearchCancelledError, hard exceptions) keeps the
            // existing behaviour: surface to the outer catch as chat:error.
            throw researchErr
          }
        }
      }

      // LP-1 (Loop Phase) — the normal-dispatch body (prompt assembly + tools
      // + abort registration + runChatRound + cleanup) is now `runHeadlessTurn`
      // so a loop iteration or a fired `schedule_wakeup` wake-up can run the
      // identical turn in the main process. The user message was already
      // persisted above; runHeadlessTurn owns abort registration + cleanup.
      await runHeadlessTurn({
        conversationId,
        model,
        activeSkillIds,
        correlationId,
        promptBody: content,
        runtime: turnRuntime,
        ...(prepared ? { injectedUserMessage: { messageId: userMessageId, apiMessage: prepared.apiMessage } } : {})
      })
      // JM-8 (CC-20) — same success payload shape as the research path.
      // AC-10: headless `finally` already ran finalizeTurn.
      return {
        success: true,
        data: { conversationId, correlationId, turnId: turnRuntime.turnId }
      }
    } catch (err: any) {
      // JM-8 (CC-20) — a thrown string/undefined used to produce
      // { success:false, error: undefined }, violating the IPC contract.
      const errMsg = err instanceof Error ? err.message : String(err ?? 'unknown error')
      if (turnRuntime) {
        finalizeTurn({
          runtime: turnRuntime,
          status: turnRuntime.signal.aborted || isUserAbortError(err) ? 'cancelled' : 'failed',
          conversationId,
          correlationId,
          steerRecoveryReason: `turn failed before Steering delivery: ${errMsg}`
        })
      }
      emitPhase(conversationId, 'error')
      emitChatEvent('chat:error', { conversationId, error: errMsg })
      // Mirror into the event spine so the timeline reader sees the failure
      // alongside any model/tool/agent events that completed before the throw.
      try {
        recordEvent({
          type: 'chat.error',
          actorKind: 'system',
          severity: 'error',
          conversationId,
          correlationId,
          payload: {
            errorPreview: boundedJsonPreview(errMsg),
            errorClass: err?.name
          }
        })
      } catch (e) {
        console.error('[chat] chat.error event failed:', e)
      }
      return { success: false, error: errMsg }
    }
  })

  ipcMain.handle('chat:cancel', async (_event, conversationId) => {
    const run = turnRuntimeRegistry.lookupActive(conversationId)
    if (!run) {
      return { success: true, data: null }
    }
    return await interruptTurn({ conversationId, expectedTurnId: run.turnId })
  })

  ipcMain.handle('chat:generateTitle', async (_event, content: string) => {
    try {
      const rawResult = await chatOnce(
        [
          {
            role: 'system',
            content:
              'Generate a concise 3–5 word title for a conversation that begins with the user message below. Reply with ONLY the title — no quotes, no punctuation, no trailing period.'
          },
          { role: 'user', content }
        ],
        'deepseek-v4-flash',
        // JM-12 (CC-23) — chatOnce has no inactivity watchdog (only the SDK's
        // ~10-minute default); a stalled provider pinned this IPC for minutes.
        AbortSignal.timeout(30_000)
      )
      const cleaned = rawResult.content
        .replace(/^["'\s]+|["'\s]+$/g, '')
        .replace(/[.!?]+$/g, '')
        .slice(0, 60)
      return { success: true, data: cleaned || content.slice(0, 40) }
    } catch (err: any) {
      return { success: false, error: err?.message ?? 'Title generation failed' }
    }
  })

  // mcp:approveToolCall used to live here because chat.ts owned the pending
  // confirmation promises. It now lives in electron/ipc/permissions.ts and
  // routes through permissionsService.

  // LP-1 (Loop Phase) — wire the headless turn runner into the loop runner so a
  // fired schedule_wakeup wake-up (and, from LP-3, a loop iteration) runs a
  // real turn instead of leaving the injected user message unanswered (G1).
  setLoopTurnRunner((runnerInput) =>
    runHeadlessTurn({
      conversationId: runnerInput.conversationId,
      model: runnerInput.model,
      promptBody: runnerInput.promptBody,
      signal: runnerInput.signal
    })
  )
}

export type RunChatRoundResult = { message: unknown } | null

/**
 * runHeadlessTurn's result widens RunChatRoundResult with a context-aware token
 * estimate (Loop Phase gap-closure): the chars of the FULL message stack sent
 * to the model (system prompt + history + the iteration prompt) plus the reply,
 * over ~4 chars/token. This replaces the prior promptBody-only estimate, which
 * ignored the system prompt + history that dominate a turn's real token cost.
 * Multi-round tool turns still undercount the re-sent context, so iteration +
 * wall-clock remain the hard caps; the token budget is the soft guard.
 */
export type HeadlessTurnResult = { message: unknown; tokensEstimate: number } | null

/**
 * LP-1 (Loop Phase) — the headless turn runner. Factored out of `chat:send`
 * so a loop iteration or a fired `schedule_wakeup` wake-up can run a real chat
 * turn in the main process, with the window closed or another conversation
 * focused. The CALLER persists the triggering user message first (chat:send
 * does; fireDueWakeups does; the loop controller's runTurn seam does for
 * iteration prompts — JM-2). This function assembles the prompt + tools,
 * registers a TurnRuntime (so chat:cancel AND a loop's cancel both
 * interrupt it), runs runChatRound, and owns its own cleanup in a `finally` —
 * a throwing turn never leaks the registry entry.
 */
export async function runHeadlessTurn(input: {
  conversationId: string
  model: string
  activeSkillIds?: string[]
  correlationId?: string
  /** Body for the promptSubmit hook (the user/wake-up text). */
  promptBody?: string
  /** External cancel signal (e.g. a loop's controller) — aborts the turn. */
  signal?: AbortSignal
  /** Existing runtime used by interactive research fallback. */
  runtime?: TurnRuntime
  /** Loops and wake-ups default to regular; reserved kinds reject Steering. */
  turnKind?: TurnKind
  /** Structured queued input whose display row was already persisted. */
  injectedUserMessage?: InjectedUserMessage
}): Promise<HeadlessTurnResult> {
  const { conversationId, model } = input
  const correlationId = input.runtime?.correlationId ?? input.correlationId ?? randomUUID()
  const activeSkillIds = input.activeSkillIds ?? []

  const runtime = input.runtime
    ? input.runtime
    : turnRuntimeRegistry.register({
        conversationId,
        correlationId,
        kind: input.turnKind ?? 'regular'
      })
  if (!input.runtime) emitTurnStarted(runtime)
  if (runtime.conversationId !== conversationId) {
    throw new Error('turn-runtime: runtime conversation does not match headless turn input')
  }
  const unlinkExternalSignal = input.signal ? runtime.linkAbortSignal(input.signal) : (): void => {}
  let settlementStatus: SettledTurnStatus = 'completed'

  try {
    emitPhase(conversationId, 'understanding')

    void fireHooks('promptSubmit', { conversationId, promptBody: input.promptBody ?? '' })

    // Track 2 / E5 — auto context compression. Run BEFORE pulling
    // history so the next turn's prompt sees the compressed view.
    let promptHistory
    try {
      const modelInfo = resolveModel(model)
      const ctxWindow = modelInfo.contextWindow ?? 128_000
      const preview = getEffectiveMessages(conversationId)
      const inMemoryTokens = estimateTokensForMessages(preview)
      const r = compressOldestMessages(conversationId, ctxWindow, { inMemoryTokens })
      if (r) {
        emitChatEvent('chat:compressed', {
          conversationId,
          summaryMessageId: r.summaryMessageId,
          compressedCount: r.compressedCount,
          reductionPct: r.reductionPct
        })
      }
      promptHistory = (r ? getEffectiveMessages(conversationId) : preview).filter(
        (message) => message.id !== input.injectedUserMessage?.messageId
      )
    } catch (err) {
      console.error('[chat] context compression failed:', err)
      promptHistory = getEffectiveMessages(conversationId).filter(
        (message) => message.id !== input.injectedUserMessage?.messageId
      )
    }
    const memoryBlock = memStore.buildMemoryBlock()
    const memoryIndexBlock = memStore.buildMemoryIndexBlock()
    const taskNotificationsBlock = buildTaskNotificationsBlock(
      drainAsyncEventsForPrompt(conversationId)
    )

    const settingsRaw = readSettingsJson()
    const agentic = loadAgenticCodingConfig(settingsRaw)

    const effectiveSkillIds = agentic.mode
      ? mergeAgenticSkillIds(activeSkillIds, agentic.skills)
      : activeSkillIds

    let skillContents: {
      name: string
      content: string
      allowedTools?: string[]
      description?: string
    }[] = []
    if (effectiveSkillIds.length > 0) {
      const skills = listSkills()
      skillContents = effectiveSkillIds
        .map((id: string) => {
          const skill = skills.find((s) => s.id === id)
          if (!skill) return null
          const skillBody = getSkillContent(id)
          if (!skillBody) return null
          return {
            name: skill.name,
            content: skillBody,
            ...(skill.allowedTools ? { allowedTools: skill.allowedTools } : {}),
            ...(skill.description ? { description: skill.description } : {})
          }
        })
        .filter(Boolean) as {
        name: string
        content: string
        allowedTools?: string[]
        description?: string
      }[]
    }

    // HY4 — lazy skill bodies follow the tool-surface mode. JM-12 (CC-17):
    // same normalization as buildDispatchTools — exactly 'lazy' activates.
    // The old `!== 'full'` gate meant a typo'd value produced the full tool
    // catalog WITH stubbed skill bodies, a state no phase intended.
    const lazySkillBodies =
      ((settingsRaw as { toolSurface?: string } | null)?.toolSurface ?? 'full') === 'lazy'

    const { params: modelParams, systemPromptOverride } = loadModelConfig(settingsRaw, model)
    const activeWorkspace = getTaskWorkspace(conversationId)
    const agentsMd = readAgentsMd(activeWorkspace)
    const chaptersBlock = buildChaptersBlock(conversationId)
    const supportsTools = resolveModel(model).supportsTools
    const systemPrompt = buildSystemPrompt(
      skillContents,
      memoryBlock,
      systemPromptOverride,
      agentsMd,
      model,
      agentic.mode ? 'coding' : undefined,
      memoryIndexBlock,
      taskNotificationsBlock,
      chaptersBlock,
      supportsTools,
      lazySkillBodies
    )

    const activeProvider = getProviderForModel(model)
    const tools: ChatCompletionTool[] = buildDispatchTools(
      conversationId,
      activeProvider,
      settingsRaw
    )

    const historyWithInputs = resolveModel(model).supportsVision ? promptHistory.map(message => message.role === 'user' ? { ...message, apiUserContent: readStructuredUserContent(message.id) } : message) : promptHistory
    const apiMessages = buildApiMessagesFromStoredMessages(systemPrompt, historyWithInputs, model)
    if (input.injectedUserMessage) apiMessages.push(input.injectedUserMessage.apiMessage)

    // JM-12 (CC-11) — per-round token accounting. The old estimate counted the
    // initial message stack ONCE, but every tool round re-sends the whole
    // growing stack; a 10-round turn's real input was ~10× the estimate, making
    // loop token ceilings decorative. runChatRound now accumulates the chars
    // actually sent each round plus the chars received back.
    const charCounter = { sent: 0, received: 0 }

    const workspacePath = activeWorkspace
    const result = await runChatRound(
      conversationId,
      model,
      apiMessages,
      tools.length > 0 ? tools : undefined,
      workspacePath,
      runtime.signal,
      0,
      modelParams,
      correlationId,
      [],
      Date.now(),
      charCounter,
      runtime
    )
    if (!result) return null
    return {
      message: (result as { message: unknown }).message,
      tokensEstimate: Math.ceil((charCounter.sent + charCounter.received) / 4)
    }
  } catch (err) {
    const errObj = err instanceof Error ? err : { message: String(err) }
    settlementStatus = runtime.signal.aborted || isUserAbortError(errObj) ? 'cancelled' : 'failed'
    // JM-4 (CC-9) — ghost-reply guard for headless callers. The SP-4 guard
    // lived only in chat:send's catch, so a failed loop iteration or wake-up
    // turn left the injected user message permanently unanswered (the exact
    // G1/D5 ghost class). Persist the notice here so every caller gets it;
    // chat:send's own guard then sees the system row and stands down.
    try {
      if (!runtime.signal.aborted && !isUserAbortError(errObj)) {
        const rows = convStore.getMessages(conversationId)
        if (turnEndedGhosted(rows)) {
          const notice = convStore.saveMessage({
            id: randomUUID(),
            conversationId,
            role: 'system',
            content: buildGhostReplyNotice(errObj.message),
            model: 'lamprey-safety-net',
            stage: 'system'
          })
          emitChatEvent('chat:done', { conversationId, message: notice })
        }
      }
    } catch (guardErr) {
      console.error('[chat] headless ghost-reply guard failed:', guardErr)
    }
    throw err
  } finally {
    unlinkExternalSignal()
    finalizeTurn({
      runtime,
      status: settlementStatus,
      conversationId,
      model,
      activeSkillIds,
      correlationId,
      dispatchQueue: dispatchQueuedFollowUpAfterCompletedTurn
    })
  }
}

/**
 * HY2 — Build the tool array handed to the model for a turn. `'full'` (the
 * SP-1 era default, also used when unset or downgraded) returns the entire
 * normalized catalog, identical to the pre-Hygiene dispatch. `'lazy'` (opt-in)
 * returns the core set + `tool_search` + any tools already unlocked for this
 * conversation.
 */
function buildDispatchTools(
  conversationId: string,
  provider: string,
  settingsRaw: unknown
): ChatCompletionTool[] {
  // AO-6 — strip the orchestration tools unless the master toggle is on, so
  // ZERO orchestration tool-schema bytes reach the model by default.
  const mode = (settingsRaw as { toolSurface?: string } | undefined)?.toolSurface ?? 'full'
  if (mode === 'lazy' && !isSurfaceDowngraded(conversationId)) {
    activateLazySurface(conversationId)
    return applyGatedPackFilters(
      toolRegistry.getModelToolSurface(provider, {
        unlockedNames: getUnlockedTools(conversationId)
      }),
      settingsRaw
    )
  }
  return applyGatedPackFilters(toolRegistry.getNormalizedToolsForProvider(provider), settingsRaw)
}

function applyGatedPackFilters(
  tools: ChatCompletionTool[],
  settingsRaw: unknown
): ChatCompletionTool[] {
  const s = (settingsRaw ?? {}) as {
    orchestrationEnabled?: boolean
    loopsEnabled?: boolean
    browserDeveloperModeEnabled?: boolean
  }
  return filterBrowserDeveloperTools(
    filterLoopTools(
      filterOrchestrationTools(tools, s.orchestrationEnabled === true),
      s.loopsEnabled === true
    ),
    s.browserDeveloperModeEnabled === true
  )
}

/**
 * HY2 — Recompute the tool array between tool-call rounds so tools unlocked by
 * a `tool_search` call this round are callable next round. In `'full'` mode
 * (and for non-lazy conversations) the array passes through unchanged; a
 * mid-loop downgrade rebuilds the full catalog.
 */
function rebuildToolsForNextRound(
  conversationId: string,
  model: string,
  currentTools: ChatCompletionTool[] | undefined
): ChatCompletionTool[] | undefined {
  const settingsRaw = readSettingsJson()
  if (isLazyActive(conversationId)) {
    return applyGatedPackFilters(
      toolRegistry.getModelToolSurface(getProviderForModel(model), {
        unlockedNames: getUnlockedTools(conversationId)
      }),
      settingsRaw
    )
  }
  if (isSurfaceDowngraded(conversationId)) {
    return applyGatedPackFilters(
      toolRegistry.getNormalizedToolsForProvider(getProviderForModel(model)),
      settingsRaw
    )
  }
  return currentTools
}

export async function runChatRound(
  conversationId: string,
  model: string,
  messages: ChatCompletionMessageParam[],
  tools: ChatCompletionTool[] | undefined,
  workspacePath: string,
  signal: AbortSignal,
  round: number,
  params?: ModelParams,
  correlationId?: string,
  /** Reasoning Audit Phase R6 — cumulative reasoning trail. Pre-existing
   *  rounds' chain-of-thought; this round appends its own onDone.
   *  Threaded through recursion so the FINAL round folds the whole trail
   *  into the saved row's `reasoning` column via concatReasoningTrail().
   *  Defaults to [] at the top-level call so callers don't need to pass it. */
  roundReasonings: string[] = [],
  turnStartedAt: number = Date.now(),
  // JM-12 (CC-11) — accumulates the chars actually sent (the full stack, per
  // round, since every round re-sends it) and received. Shared by reference
  // through the recursion; runHeadlessTurn owns it and derives tokensEstimate.
  charCounter?: { sent: number; received: number },
  runtime?: TurnRuntime
): Promise<RunChatRoundResult> {
  trace('runChatRound.enter', {
    conversationId,
    correlationId,
    model,
    round,
    messagesCount: messages.length,
    toolsCount: tools?.length ?? 0,
    parentSignalAborted: signal.aborted
  })
  if (round >= MAX_TOOL_ROUNDS) {
    emitPhase(conversationId, 'error')
    emitChatEvent('chat:error', {
      conversationId,
      // Tool calls completed in rounds 0..MAX_TOOL_ROUNDS-1 ARE persisted —
      // re-prompting with "continue" picks up where the model left off
      // because the history reflects the partial work.
      error: TOOL_ROUND_CAP_MESSAGE
    })
    throw new ToolRoundCapError()
  }

  const descriptor = resolveModel(model)
  // FC-10 — when the capability tracker has downgraded this model for this
  // conversation, treat it as supportsTools: false going forward. The
  // fallback parser (FC-6/FC-8) handles tool invocation from text.
  const actuallySupportsTools = descriptor.supportsTools && !isDowngraded(conversationId, model)
  const effectiveTools = actuallySupportsTools ? tools : undefined

  // JM-10 (CC-4) — a fallback model must be TOLD the contract. Since FC-6/FC-8
  // shipped, FALLBACK_TOOL_INSTRUCTION had zero injection sites: non-native
  // and FC-10-downgraded models were expected to emit {"action":...,"input":...}
  // without ever seeing the format or the tool list, so the whole fallback
  // dispatch path was dead and a downgrade silently meant "tools stop working".
  // Running here (every round, idempotent) also covers mid-conversation
  // downgrades — the contract lands on the next round's system message.
  if (!actuallySupportsTools && tools && tools.length > 0) {
    ensureFallbackContract(messages, tools)
  }

  const audit: ModelRequestAudit | undefined = correlationId
    ? { correlationId, conversationId, purpose: 'main' }
    : undefined

  if (charCounter) {
    charCounter.sent += messages.reduce((n, m) => {
      const c = (m as { content?: unknown }).content
      const base = typeof c === 'string' ? c.length : c == null ? 0 : JSON.stringify(c).length
      const tc = (m as { tool_calls?: unknown }).tool_calls
      return n + base + (tc ? JSON.stringify(tc).length : 0)
    }, 0)
  }

  return new Promise<RunChatRoundResult>((resolve, reject) => {
    // JM-8 (CC-1) — chatStream's own returned promise is captured below.
    // A pre-stream throw (missing API key, unknown provider) rejects that
    // promise WITHOUT ever firing onDone/onError; before the catch at the
    // bottom, such a throw never settled this wrapper — the turn hung
    // forever (spinner stuck, ghost guard never ran, abort entry leaked).
    chatStream(
      messages,
      model,
      effectiveTools,
      {
        onChunk: (chunk) => {
          emitChatEvent('chat:chunk', { conversationId, content: chunk })
        },
        onReasoning: (chunk) => {
          emitChatEvent('chat:reasoning', { conversationId, content: chunk })
        },
        onVitals: (v) => {
          emitChatEvent('chat:streaming-vitals', {
            conversationId,
            lastChunkAt: v.lastChunkAt,
            msSinceLastChunk: v.msSinceLastChunk,
            chunkCount: v.chunkCount,
            tokenEstimate: v.tokenEstimate,
            attemptElapsedMs: v.attemptElapsedMs
          })
        },
        onDone: async (fullContent, toolCalls, fullReasoning) => {
          // JM-8 (CC-3) — the whole body runs inside try/catch. chatStream
          // fires onDone without awaiting it, so a throw from saveMessage or
          // a rejected approval used to become an unhandled rejection while
          // this wrapper never settled (the v0.9.2 class of failure: renderer
          // hangs, no error row, no ghost notice).
          try {
            trace('runChatRound.onDone', {
              conversationId,
              round,
              contentLen: fullContent.length,
              reasoningLen: fullReasoning?.length ?? 0,
              toolCallsCount: toolCalls?.length ?? 0
            })

            if (charCounter) {
              charCounter.received += fullContent.length + (fullReasoning?.length ?? 0)
            }

            // FC-10 — capability mismatch detection. When the model is flagged
            // supportsTools but returns tool-like text without tool_calls,
            // track consecutive mismatches. Downgraded models bypass future
            // native-tool attempts and go straight to fallback parsing.
            if (descriptor.supportsTools) {
              const gotToolCalls = !!(toolCalls && toolCalls.length > 0)
              const toolsWereSent = effectiveTools !== undefined
              const warning = recordCapabilityCheck(
                conversationId,
                model,
                toolsWereSent,
                gotToolCalls,
                fullContent
              )
              if (warning) {
                trace('runChatRound.capability-mismatch', {
                  conversationId,
                  model,
                  warning
                })
                // Log but don't block — the user's current turn proceeds normally
              }
            }

            // FC-8 — when the model does not support native tool calling
            // (toolCalls is empty/null), attempt fallback parsing from the
            // text content. Fallback models are instructed to output JSON
            // following the fallback contract. If a valid fallback call is
            // found, convert it to the native toolCalls format and dispatch
            // through the same pathway.
            //
            // FC-10 — also run capability mismatch detection. When a native
            // model returns tool-like syntax but no tool_calls, track
            // consecutive mismatches. After 3, temporarily downgrade to
            // fallback mode so the user's turn isn't wasted.
            let effectiveToolCalls = toolCalls
            // Fallback parsing triggers when: (a) model doesn't support tools
            // natively, OR (b) model has been downgraded due to capability mismatch.
            const needsFallbackParsing =
              !descriptor.supportsTools || isDowngraded(conversationId, model)
            if ((!effectiveToolCalls || effectiveToolCalls.length === 0) && needsFallbackParsing) {
              const fallbackTools = (tools ?? []).map((t) => {
                const fn = (t as { function?: { name?: string; parameters?: unknown; description?: string } }).function
                return {
                  name: fn?.name ?? '',
                  inputSchema: fn?.parameters ?? {},
                  description: fn?.description
                }
              }).filter((t) => t.name)
              const fallbackResult = parseFallbackToolCalls(fullContent, fallbackTools)
              if (
                fallbackResult &&
                !fallbackResult.isFinalAnswer &&
                fallbackResult.calls.length > 0
              ) {
                // Convert fallback ToolCallRequest[] to ProviderToolCall[]
                effectiveToolCalls = fallbackResult.calls.map((fc) => ({
                  id: fc.id,
                  type: 'function' as const,
                  function: { name: fc.name, arguments: JSON.stringify(fc.arguments) }
                }))
                trace('runChatRound.fallback-parsed', {
                  conversationId,
                  round,
                  callCount: effectiveToolCalls.length,
                  provenance: 'fallback'
                })
              } else if (fallbackResult?.validationError) {
                // JM-10 (CC-13) — the model clearly ATTEMPTED a tool call but it
                // failed validation (unknown tool / bad arguments). The old path
                // rendered the raw JSON blob as the visible final answer and the
                // model never learned why its call failed. Run one corrective
                // round instead: the attempt and the correction are persisted so
                // the transcript stays honest, and the feedback is fed back
                // in-memory. round+1 still counts toward MAX_TOOL_ROUNDS, so a
                // model stuck emitting bad JSON cannot loop forever.
                const ve = fallbackResult.validationError
                trace('runChatRound.fallback-validation-failed', {
                  conversationId,
                  round,
                  tool: ve.toolName,
                  errors: ve.errors.join('; ').slice(0, 300)
                })
                const feedback =
                  `Your "${ve.toolName}" tool call failed validation: ${ve.errors.join('; ')}. ` +
                  'Re-issue ONE corrected JSON object per the tool-calling instructions, ' +
                  'or output {"action":"final","answer":"..."} to answer without the tool.'
                convStore.saveMessage({
                  id: randomUUID(),
                  conversationId,
                  role: 'assistant',
                  content: fullContent,
                  model,
                  reasoning: fullReasoning
                })
                convStore.saveMessage({
                  id: randomUUID(),
                  conversationId,
                  role: 'system',
                  content: `Tool-call validation failed (${ve.toolName}): ${ve.errors.join('; ')}`,
                  stage: 'system'
                })
                messages.push({ role: 'assistant', content: fullContent } as any)
                messages.push({ role: 'user', content: feedback } as any)
                if (runtime) {
                  await consumeRootSteersAtBoundary(runtime, messages, model)
                }
                const correctiveReasonings =
                  fullReasoning && fullReasoning.length > 0
                    ? [...roundReasonings, fullReasoning]
                    : roundReasonings
                const next = await runChatRound(
                  conversationId,
                  model,
                  messages,
                  rebuildToolsForNextRound(conversationId, model, tools),
                  workspacePath,
                  signal,
                  round + 1,
                  params,
                  correlationId,
                  correctiveReasonings,
                  turnStartedAt,
                  charCounter,
                  runtime
                )
                resolve(next)
                return
              }
            }

            if (!effectiveToolCalls || effectiveToolCalls.length === 0) {
              // UB-5 (Unburdening Phase, 2026-06-10) — the final-response
              // composer that used to rewrite the reply here is EXCISED. The
              // content the model streamed IS the reply, byte-for-byte. The
              // UB-4 note still applies: no proof gate, no trust notice, no
              // proof_status write.
              // Mid-round drain (OD-5): attach pending docs/artifacts to this
              // in-flight assistant row. Not a turn-closer — finalizeTurn owns
              // the close-drain when the runtime settles.
              const documents = drainPendingDocuments(correlationId)
              const artifacts = drainPendingArtifacts(correlationId)
              // R6 (kept) — fold every round's chain-of-thought into the saved
              // row. Single-shot turns (no prior tool rounds) persist the raw
              // reasoning unchanged; multi-round turns get the numbered trail,
              // capped at MAX_REASONING_BYTES with the honest truncation marker.
              const finalReasoning =
                roundReasonings.length > 0
                  ? concatReasoningTrail([...roundReasonings, fullReasoning ?? ''], undefined)
                  : fullReasoning
              const assistantMsg = convStore.saveMessage({
                id: randomUUID(),
                conversationId,
                role: 'assistant',
                content: fullContent,
                model,
                reasoning: finalReasoning,
                documents,
                artifacts
              })
              const hasRootSteer =
                runtime?.pendingSteers.some((steer) => steer.targetAgentRunId === null) ?? false
              if (runtime && hasRootSteer) {
                messages.push({
                  role: 'assistant',
                  content: fullContent || '',
                  ...(fullReasoning &&
                    modelEchoesReasoningContent(model) && {
                      reasoning_content: fullReasoning
                    })
                } as ChatCompletionMessageParam)
                emitChatEvent('chat:round-complete', {
                  conversationId,
                  turnId: runtime.turnId,
                  message: assistantMsg
                })
                const delivered = await consumeRootSteersAtBoundary(runtime, messages, model)
                if (delivered.delivered > 0) {
                  const continuationReasonings =
                    fullReasoning && fullReasoning.length > 0
                      ? [...roundReasonings, fullReasoning]
                      : roundReasonings
                  const next = await runChatRound(
                    conversationId,
                    model,
                    messages,
                    rebuildToolsForNextRound(conversationId, model, tools),
                    workspacePath,
                    signal,
                    round + 1,
                    params,
                    correlationId,
                    continuationReasonings,
                    turnStartedAt,
                    charCounter,
                    runtime
                  )
                  resolve(next)
                  return
                }
              }
              emitPhase(conversationId, 'done')
              emitChatEvent('chat:done', { conversationId, message: assistantMsg })
              void fireHooks('agentStop', { conversationId })
              resolve({ message: assistantMsg })
              return
            }

            const persistedToolCalls = effectiveToolCalls.map((tc) => ({
              id: tc.id,
              type: 'function' as const,
              function: { name: tc.function.name, arguments: tc.function.arguments }
            }))

            convStore.saveMessage({
              id: randomUUID(),
              conversationId,
              role: 'assistant',
              content: fullContent || '',
              model,
              toolCalls: persistedToolCalls,
              reasoning: fullReasoning
            })

            messages.push({
              role: 'assistant',
              content: fullContent || null,
              tool_calls: persistedToolCalls,
              // JM-9 (CC-15) — echo reasoning only to models whose API contract
              // wants it (DeepSeek V4, resolved through the retirement map);
              // strict compat layers 400 on the nonstandard field.
              ...(fullReasoning &&
                modelEchoesReasoningContent(model) && { reasoning_content: fullReasoning })
            } as any)

            // Group the model's tool_calls into execution windows: contiguous
            // spans of parallelizable calls run via Promise.all; non-parallel
            // calls run one at a time. The final tool-role messages are pushed
            // in tool_call array order regardless of completion order so the
            // next API round sees a consistent sequence.
            const resolved: ResolvedToolCall[] = await resolveToolCallWindows(
              effectiveToolCalls,
              conversationId,
              model,
              workspacePath,
              signal,
              correlationId
            )
            signal.throwIfAborted()

            // HY3 — spill threshold (chars). Default DEFAULT_SPILL_THRESHOLD;
            // `toolResultSpill: false` or `toolResultSpillBytes: 0` disables it.
            const spillSettings = readSettingsJson() ?? {}
            const spillThreshold =
              spillSettings.toolResultSpill === false
                ? 0
                : typeof spillSettings.toolResultSpillBytes === 'number'
                  ? spillSettings.toolResultSpillBytes
                  : DEFAULT_SPILL_THRESHOLD
            for (const r of resolved) {
              // Persist the FULL result — the UI shows it in full.
              convStore.saveMessage({
                id: randomUUID(),
                conversationId,
                role: 'tool',
                content: r.result,
                toolCallId: r.callId
              })
              // Feed the MODEL a head+tail preview when the result is large; the
              // full text stays on disk, reachable via read_tool_result.
              const spill = maybeSpillToolResult(r.result, { threshold: spillThreshold })
              messages.push({
                role: 'tool',
                content: spill.result,
                tool_call_id: r.callId
              } as any)
            }

            // R6 — fold THIS round's reasoning into the cumulative trail
            // before recursing. The final round (no tool calls + composer
            // ran) reads the trail off the `roundReasonings` parameter
            // and folds it into the saved composer-row's reasoning column.
            // ST-5 safe boundary: every tool window and result append above
            // completes before Steering can enter the transcript. A mutating
            // tool is never preempted midway through its side effect.
            if (runtime) {
              await consumeRootSteersAtBoundary(runtime, messages, model)
            }

            const nextRoundReasonings =
              fullReasoning && fullReasoning.length > 0
                ? [...roundReasonings, fullReasoning]
                : roundReasonings
            const next = await runChatRound(
              conversationId,
              model,
              messages,
              // HY2 — fold in any tools unlocked by a tool_search this round.
              rebuildToolsForNextRound(conversationId, model, tools),
              workspacePath,
              signal,
              round + 1,
              params,
              correlationId,
              nextRoundReasonings,
              turnStartedAt,
              charCounter,
              runtime
            )
            resolve(next)
          } catch (err) {
            // CC-3 — settle the wrapper on ANY onDone-body throw.
            reject(err instanceof Error ? err : new Error(String(err)))
          }
        },
        onError: (error, partial) => {
          try {
            trace('runChatRound.onError', {
              conversationId,
              round,
              errorPreview: String(error).slice(0, 200),
              partialContentLen: partial?.content?.length ?? 0,
              partialReasoningLen: partial?.reasoning?.length ?? 0
            })
            // Permanently fix data loss on stream errors: if the provider
            // streamed body or reasoning before failing, persist it as an
            // assistant message instead of letting it evaporate. Without
            // this, every stream error silently discarded everything the
            // user already saw on screen — including thousands of tokens
            // of chain-of-thought from reasoning models.
            //
            // We emit `chat:done` FIRST with the persisted partial so the
            // renderer transitions the on-screen streaming buffers into a
            // durable message via finishStream (which adds it to the
            // messages array and clears the streaming state). Then we emit
            // `chat:error` so the failure still surfaces as a toast.
            const hasPartial = !!(partial && (partial.content || partial.reasoning))
            if (hasPartial) {
              try {
                // Mid-round drain (OD-5): attach pending docs/artifacts to the
                // partial assistant row. Not a turn-closer — finalizeTurn owns
                // the close-drain when the runtime settles.
                const documents = drainPendingDocuments(correlationId)
                const artifacts = drainPendingArtifacts(correlationId)
                const errorMarker = `\n\n_[stream interrupted: ${error}]_`
                const assistantMsg = convStore.saveMessage({
                  id: randomUUID(),
                  conversationId,
                  role: 'assistant',
                  content: (partial!.content || '') + errorMarker,
                  model,
                  reasoning: partial!.reasoning,
                  documents,
                  artifacts
                })
                emitChatEvent('chat:done', {
                  conversationId,
                  message: assistantMsg
                })
              } catch (e) {
                console.error('[chat] failed to persist partial on stream error:', e)
              }
            }

            emitPhase(conversationId, 'error')
            emitChatEvent('chat:error', { conversationId, error })
            // Mirror provider-side stream errors into the spine. `model.request.failed`
            // is already emitted from inside chatStream for the underlying API
            // failure; this `chat.error` row pins the orchestration-layer
            // outcome so the chat-turn timeline reads cleanly even when the
            // provider stream short-circuits before any tool round runs.
            if (correlationId) {
              try {
                recordEvent({
                  type: 'chat.error',
                  actorKind: 'system',
                  severity: 'error',
                  conversationId,
                  correlationId,
                  payload: {
                    errorPreview: boundedJsonPreview(error),
                    source: 'stream'
                  }
                })
              } catch (e) {
                console.error('[chat] chat.error event failed:', e)
              }
            }
            reject(new Error(error))
          } catch (err) {
            // CC-3 — even the error path must settle the wrapper.
            reject(err instanceof Error ? err : new Error(String(err)))
          }
        }
      },
      signal,
      params,
      audit
    ).catch((err) => {
      // JM-8 (CC-1) — a throw BEFORE the stream loop (missing key, unknown
      // provider) fires neither onDone nor onError. Surface it like a stream
      // error and settle the wrapper so the turn ends instead of hanging.
      const msg = err instanceof Error ? err.message : String(err)
      trace('runChatRound.preStreamThrow', {
        conversationId,
        round,
        errorPreview: msg.slice(0, 200)
      })
      emitPhase(conversationId, 'error')
      emitChatEvent('chat:error', { conversationId, error: msg })
      reject(err instanceof Error ? err : new Error(msg))
    })
  })
}

// JM-10 (CC-4) — the marker doubles as the idempotence check: once the block
// is appended to the system message it stays for the rest of the turn.
const FALLBACK_CONTRACT_MARKER = 'Tool calling instructions:'

function renderFallbackToolBlock(tools: ChatCompletionTool[]): string {
  const lines = tools
    .filter((t): t is Extract<ChatCompletionTool, { type: 'function' }> => t.type === 'function')
    .map((t) => {
      const fn = t.function
      const desc = (fn.description ?? '').replace(/\s+/g, ' ').trim().slice(0, 200)
      return `- ${fn.name}: ${desc}\n  input schema: ${JSON.stringify(fn.parameters ?? {})}`
    })
  return `Available tools:\n${lines.join('\n')}\n\n${FALLBACK_TOOL_INSTRUCTION}`
}

function ensureFallbackContract(
  messages: ChatCompletionMessageParam[],
  tools: ChatCompletionTool[]
): void {
  const sys = messages[0]
  if (!sys || sys.role !== 'system' || typeof sys.content !== 'string') return
  if (sys.content.includes(FALLBACK_CONTRACT_MARKER)) return
  sys.content = `${sys.content}\n\n${renderFallbackToolBlock(tools)}`
}
