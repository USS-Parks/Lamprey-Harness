import { isPlanModeActive } from './conversation-store'
import { fireHooks } from './hooks-runner'
import { mcpManager } from './mcp-manager'
import { toolRegistry, isMutatingDescriptor } from './tool-registry'
import { TOOL_SEARCH_TOOL, TOOL_SEARCH_TOOL_NAME } from './model-tool-surface'
import { unlockTools, recordMalformedSearch } from './tool-unlock-state'
import { partitionToolCallWindows, type ProviderToolCall } from './tool-call-windowing'
import { permissionsService, descriptorNeedsApproval } from './permissions-store'
import { inferPhaseFromDescriptor, type AgentRunPhase } from './agent-run-phase'
import { classifyToolResult } from './tool-result-status'
import { validateToolArguments } from './tool-schema-validator'
import { detectEmptyParams } from './empty-params-guard'
import { inspectShellCommand } from './dangerous-command-policy'
import { dispatchNativeTool } from './native-dispatch'
import { emitChatEvent } from './chat-events'
import { trace } from './debug-trace'
import { readSettings } from './settings-helper'
import { modeAtLeast, resolveWorldModelConfig } from './world-model-config'
import { parsePatch } from './apply-patch-tool'
import { recordPatchOutcome, recordShellOutcome } from './workspace-world-model'
import { analyzeToolCall } from './tool-action-semantics'
import { validateAnalysis, verdictToolResult } from './world-model-validate'
import { repairToolCall } from './world-model-repair'
import {
  batchNotExecutedResult,
  rollforwardCalls,
  type BatchCall
} from './world-model-rollforward'
import {
  isWorldModelTurnDowngraded,
  recordWorldModelIntervention
} from './world-model-budget'
import { recordEvent } from './event-log'

/**
 * WM-6 — count one intervention against the per-turn budget; on crossing
 * the threshold emit the downgrade event once. Never throws.
 */
function recordInterventionAndMaybeDowngrade(
  conversationId: string,
  budget: number,
  toolCallId: string,
  toolName: string,
  correlationId?: string
): void {
  try {
    const crossed = recordWorldModelIntervention(conversationId, budget)
    if (crossed) {
      recordEvent({
        type: 'world_model.downgrade',
        actorKind: 'system',
        severity: 'warning',
        conversationId,
        correlationId,
        toolCallId,
        entityKind: 'tool',
        entityId: toolName,
        payload: { budget, reason: 'per-turn intervention budget exhausted' }
      })
      trace('worldModel.turn-downgraded', { conversationId, budget })
    }
  } catch {
    // Budget accounting failures never fail the call.
  }
}

/**
 * WM-1 — feed the workspace world model from settled tool results. Pure
 * bookkeeping: never changes the result, never throws (a world-model
 * recording failure must not fail the call), and does nothing in 'off'
 * mode so the pre-phase dispatch behavior is byte-identical.
 */
function recordWorldModelOutcome(
  conversationId: string,
  toolName: string,
  args: Record<string, unknown>,
  result: string,
  status: 'done' | 'error' | 'denied',
  workspacePath: string
): void {
  try {
    if (resolveWorldModelConfig(readSettings()).mode === 'off') return
    if (toolName === 'shell_command' && typeof args.command === 'string') {
      recordShellOutcome(conversationId, args.command, status === 'done', workspacePath)
      return
    }
    if (toolName === 'apply_patch' && status === 'done' && typeof args.patch === 'string') {
      const ops = parsePatch(args.patch).map((op) => ({ kind: op.kind, path: op.path }))
      recordPatchOutcome(conversationId, ops, workspacePath)
    }
  } catch {
    // Recording is advisory; the dispatched result stands regardless.
  }
}

function emitPhase(conversationId: string, phase: AgentRunPhase): void {
  emitChatEvent('chat:phase', { conversationId, phase })
}

export interface ResolvedToolCall {
  callId: string
  result: string
}

/** AC-16 — named tool_search handler. Unlocks conversation tool state. */
export function handleToolSearch(
  callId: string,
  conversationId: string,
  args: Record<string, unknown>
): ResolvedToolCall {
  const query = typeof args.query === 'string' ? args.query.trim() : ''
  if (!query) {
    const n = recordMalformedSearch(conversationId)
    return {
      callId,
      result: JSON.stringify({
        error: 'tool_search requires a non-empty "query" string.',
        malformedCount: n
      })
    }
  }
  const matches = toolRegistry.resolveToolSearch(query)
  unlockTools(
    conversationId,
    matches.map((m) => m.name)
  )
  return {
    callId,
    result: JSON.stringify({
      query,
      unlocked: matches.map((m) => m.name),
      tools: matches,
      note: matches.length
        ? 'These tools are now available — call them directly on your next turn.'
        : 'No matching tools found. Try a different capability description.'
    })
  }
}

export async function resolveSingleToolCall(
  tc: ProviderToolCall,
  conversationId: string,
  model: string,
  workspacePath: string,
  signal: AbortSignal,
  correlationId?: string
): Promise<ResolvedToolCall> {
  signal.throwIfAborted()
  const toolName = tc.function.name
  let args: Record<string, unknown> = {}
  const rawArgs = tc.function.arguments
  try {
    args = JSON.parse(rawArgs)
  } catch {
    trace('resolveToolCall.argument-parse-failed', {
      callId: tc.id,
      conversationId,
      toolName,
      rawArgsPreview: (rawArgs || '').slice(0, 200)
    })
    return {
      callId: tc.id,
      result: JSON.stringify({
        error: 'argument_parse_failed',
        tool: toolName,
        message:
          'The arguments for this tool call were not valid JSON. Re-issue the call with corrected arguments.',
        raw_arguments: (rawArgs || '').slice(0, 2000)
      })
    }
  }

  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    return { callId: tc.id, result: JSON.stringify({
      error: 'argument_validation_failed', details: ['Tool arguments must be a JSON object.']
    }) }
  }

  {
    const schemaReq = (
      toolRegistry.getById(toolName)?.inputSchema as { required?: string[] } | undefined
    )?.required
    const detection = detectEmptyParams(toolName, rawArgs, schemaReq)
    if (detection.isEmpty) {
      trace('resolveToolCall.empty-params-detected', {
        callId: tc.id,
        conversationId,
        toolName,
        rawArgs: (rawArgs || '').trim(),
        requiredFields: detection.requiredFields
      })
      return {
        callId: tc.id,
        result: JSON.stringify({
          error: 'empty_tool_parameters',
          tool: detection.toolName,
          required_fields: detection.requiredFields,
          diagnosis: detection.diagnostic,
          hint: 'Do not re-plan. Emit the tool call immediately with minimal reasoning.'
        })
      }
    }
  }

  const descriptor = toolRegistry.getById(toolName)
  const isSearch = toolName === TOOL_SEARCH_TOOL_NAME
  if (!isSearch && !descriptor) {
    return { callId: tc.id, result: JSON.stringify({
      error: 'unknown_tool', tool: toolName,
      message: 'Tool is not registered. Discover an available tool before calling it.'
    }) }
  }
  const schema = isSearch && TOOL_SEARCH_TOOL.type === 'function'
    ? TOOL_SEARCH_TOOL.function.parameters : descriptor?.inputSchema
  if (schema) {
    const validation = validateToolArguments(toolName, args, schema)
    if (!validation.valid) {
      trace('resolveToolCall.validation-failed', {
        callId: tc.id,
        conversationId,
        toolName,
        errors: validation.errors
      })
      return {
        callId: tc.id,
        result: JSON.stringify({
          error: 'argument_validation_failed',
          details: validation.errors,
          hint: 'Check the tool schema and retry with corrected arguments.'
        })
      }
    }
    args = validation.parsed
  }
  if (isSearch) return handleToolSearch(tc.id, conversationId, args)

  // WM-3 — per-call world-model gate. In 'verify' mode and above, a call
  // whose blocking preconditions fail against the live workspace returns
  // the structured verdict instead of executing (the JM-10 corrective-result
  // shape, one round earlier). 'off' skips everything: dispatch below is
  // byte-identical to the pre-phase baseline. The gate itself must never
  // throw — a world-model defect degrades to normal dispatch, not a broken
  // turn.
  try {
    const wmConfig = resolveWorldModelConfig(readSettings())
    if (modeAtLeast(wmConfig.mode, 'verify') && !isWorldModelTurnDowngraded(conversationId)) {
      const analysis = analyzeToolCall(toolName, args)
      if (analysis) {
        let verdict = validateAnalysis(analysis, {
          workspaceRoot: workspacePath,
          conversationId
        })
        // WM-4 — repair tier. A deterministic rewrite (path normalization,
        // unique-basename resolution, whitespace re-anchor) that makes the
        // call applicable replaces the arguments and dispatch continues on
        // the standard path below; the audit row records what actually ran.
        if (!verdict.applicable && modeAtLeast(wmConfig.mode, 'repair') && wmConfig.repairBudget > 0) {
          const repair = repairToolCall(toolName, args, {
            workspaceRoot: workspacePath,
            conversationId
          })
          if (repair.outcome === 'repaired') {
            args = repair.args
            tc = {
              ...tc,
              function: { ...tc.function, arguments: JSON.stringify(repair.args) }
            }
            verdict = repair.verdict
            try {
              recordEvent({
                type: 'world_model.repair',
                actorKind: 'system',
                severity: 'info',
                conversationId,
                correlationId,
                toolCallId: tc.id,
                entityKind: 'tool',
                entityId: toolName,
                payload: {
                  tool: toolName,
                  edits: repair.notes.map((n) => ({ kind: n.kind, detail: n.detail })),
                  editsUsed: repair.editsUsed
                }
              })
            } catch {
              // Audit failures never fail the repair.
            }
            trace('resolveToolCall.world-model-repaired', {
              callId: tc.id,
              conversationId,
              toolName,
              edits: repair.notes.map((n) => n.kind)
            })
            recordInterventionAndMaybeDowngrade(
              conversationId, wmConfig.repairBudget, tc.id, toolName, correlationId
            )
          }
        }
        if (!verdict.applicable) {
          try {
            recordEvent({
              type: 'world_model.verdict',
              actorKind: 'system',
              severity: 'info',
              conversationId,
              correlationId,
              toolCallId: tc.id,
              entityKind: 'tool',
              entityId: toolName,
              payload: {
                tool: toolName,
                violationKinds: verdict.violations.map((v) => v.kind),
                paths: verdict.violations.map((v) => v.path).filter(Boolean),
                blocked: true
              }
            })
          } catch {
            // Audit failures never fail the verdict.
          }
          trace('resolveToolCall.world-model-verdict', {
            callId: tc.id,
            conversationId,
            toolName,
            violations: verdict.violations.map((v) => v.kind)
          })
          recordInterventionAndMaybeDowngrade(
            conversationId, wmConfig.repairBudget, tc.id, toolName, correlationId
          )
          return { callId: tc.id, result: verdictToolResult(toolName, verdict) }
        }
      }
    }
  } catch (wmErr) {
    trace('resolveToolCall.world-model-gate-failed', {
      callId: tc.id,
      conversationId,
      toolName,
      error: wmErr instanceof Error ? wmErr.message.slice(0, 200) : String(wmErr)
    })
  }

  const startTime = Date.now()
  trace('resolveToolCall.enter', {
    callId: tc.id,
    conversationId,
    toolName,
    parentSignalAborted: signal.aborted
  })

  const earlyDescriptor = toolRegistry.getById(toolName)
  emitChatEvent('chat:tool-call', {
    callId: tc.id,
    conversationId,
    serverId: toolName.includes('__') ? toolName.split('__')[0] : 'internal',
    toolName: toolName.includes('__') ? toolName.split('__').slice(1).join('__') : toolName,
    title: earlyDescriptor?.title ?? toolName,
    risks: earlyDescriptor?.risks ?? [],
    providerKind: earlyDescriptor?.providerKind ?? 'native',
    startedAt: startTime,
    args,
    transcriptHidden: earlyDescriptor?.transcriptHidden
  })

  toolRegistry.recordCallStart(
    {
      id: tc.id,
      toolId: toolName,
      name: toolName,
      conversationId,
      args,
      startedAt: startTime,
      status: 'running'
    },
    correlationId
  )

  let result: string
  let explicitStatus: 'done' | 'error' | 'denied' | undefined
  const checkCancelled = (): void => {
    if (!signal.aborted) return
    toolRegistry.recordCallEnd(tc.id, {
      status: 'error', error: 'Tool call cancelled; already-issued effects may have completed.',
      finishedAt: Date.now(), correlationId
    })
    signal.throwIfAborted()
  }

  if (descriptor) {
    emitPhase(conversationId, inferPhaseFromDescriptor(descriptor))
  }

  const planModeActive = isPlanModeActive(conversationId)
  const blockedByPlanMode = planModeActive && isMutatingDescriptor(descriptor)

  const shellInspection =
    toolName === 'shell_command'
      ? inspectShellCommand(
          typeof args?.command === 'string' ? args.command : '',
          args?.shell === 'bash' || args?.shell === 'powershell' ? args.shell : 'auto'
        )
      : null
  const isDangerousShellCommand =
    shellInspection?.verdict !== undefined && shellInspection.verdict !== 'safe'
  const needsApproval =
    !blockedByPlanMode && (descriptorNeedsApproval(descriptor) || isDangerousShellCommand)
  const isDangerousShellBypass =
    toolName === 'shell_command' && args?.dangerously_disable_sandbox === true
  const isFallbackProvenance = tc.id.startsWith('fb_')
  const isFallbackMutating = isFallbackProvenance && isMutatingDescriptor(descriptor)
  const callRisks = descriptor
    ? [
        ...descriptor.risks,
        ...(isDangerousShellBypass && !descriptor.risks.includes('sandboxBypass')
          ? (['sandboxBypass'] as const)
          : []),
        ...(isDangerousShellCommand && !descriptor.risks.includes('destructive')
          ? (['destructive'] as const)
          : [])
      ]
    : undefined
  const approvalOutcome =
    needsApproval && descriptor
      ? await permissionsService.requestApprovalDetailed({
          callId: tc.id,
          toolId: descriptor.id,
          name: descriptor.name,
          serverId: descriptor.providerId,
          providerKind: descriptor.providerKind,
          risks: callRisks ?? descriptor.risks,
          args,
          conversationId,
          correlationId,
          dangerous:
            isDangerousShellBypass || isDangerousShellCommand || isFallbackMutating
              ? true
              : undefined
        }, signal)
      : { decision: 'allow' as const, source: 'none' }
  checkCancelled()
  const approvalDecision = approvalOutcome.decision
  const approvalSource = blockedByPlanMode ? 'plan-mode' : approvalOutcome.source

  if (blockedByPlanMode) {
    result =
      'Blocked: plan mode is active for this conversation. Read-only tools are still available; call `exit_plan_mode` (or have the user click "Exit plan mode" in the banner) to allow mutating tools.'
    explicitStatus = 'denied'
  } else if (approvalDecision === 'deny') {
    result = 'Action denied by user.'
    explicitStatus = 'denied'
  } else {
    const preHook = await fireHooks('preToolUse', {
      conversationId,
      toolName,
      args,
      cwd: workspacePath
    })
    checkCancelled()
    if (preHook.blocked) {
      result = `Blocked by hook: ${preHook.blockReason ?? 'preToolUse refused'}`
      explicitStatus = 'denied'
    } else if (toolRegistry.hasHandler(toolName)) {
      const dispatched = await dispatchNativeTool(() =>
        toolRegistry.executeNative(toolName, args, {
          conversationId,
          workspacePath,
          model,
          signal,
          callId: tc.id,
          correlationId
        })
      )
      result = dispatched.result
      explicitStatus = dispatched.status
      checkCancelled()
      if (toolName === 'update_plan' && dispatched.status === 'done') {
        try {
          const snapshot = JSON.parse(result)
          emitChatEvent('plan:updated', { conversationId, snapshot })
        } catch {
          // Snapshot shape drifted — renderer refetches on the next
          // conversation switch.
        }
      }
    } else if (toolName.includes('__')) {
      const [serverId, ...nameParts] = toolName.split('__')
      const mcpToolName = nameParts.join('__')
      try {
        const mcpResult = await mcpManager.callTool(serverId, mcpToolName, args, signal)
        result = typeof mcpResult === 'string' ? mcpResult : JSON.stringify(mcpResult)
      } catch (err: any) {
        result = `Error: ${err.message}`
      }
    } else {
      result = `Unknown tool: ${toolName}`
    }
  }

  if (result === undefined) result = ''
  checkCancelled()
  await fireHooks('postToolUse', {
    conversationId,
    toolName,
    args,
    result,
    cwd: workspacePath
  })
  checkCancelled()

  const duration = Date.now() - startTime
  const finishedAt = startTime + duration
  const auditStatus = explicitStatus ?? classifyToolResult(result)
  recordWorldModelOutcome(conversationId, toolName, args, result, auditStatus, workspacePath)
  toolRegistry.recordCallEnd(tc.id, {
    status: auditStatus,
    result: auditStatus === 'error' ? undefined : result,
    error: auditStatus === 'error' ? result : undefined,
    finishedAt,
    approvalSource,
    correlationId
  })
  emitChatEvent('chat:tool-call-result', {
    callId: tc.id,
    conversationId,
    result,
    duration,
    status: auditStatus === 'done' ? 'success' : auditStatus
  })
  trace('resolveToolCall.return', {
    callId: tc.id,
    toolName,
    duration,
    status: auditStatus,
    resultLen: result.length
  })

  return { callId: tc.id, result }
}

export async function resolveToolCallWindows(
  calls: ProviderToolCall[],
  conversationId: string,
  model: string,
  workspacePath: string,
  signal: AbortSignal,
  correlationId?: string
): Promise<ResolvedToolCall[]> {
  // WM-5 — whole-batch rollforward before the first dispatch. A violation
  // at index > 0 means a later call is doomed by an earlier call's effects
  // (or its own preconditions): the invalid plan executes NOTHING, the
  // violating call gets its verdict, and every other call gets a
  // batch_not_executed note. An index-0 violation falls through — the
  // per-call gate (WM-3/WM-4, including repair) owns single-call causes.
  // Never throws: a rollforward defect degrades to normal dispatch.
  try {
    if (calls.length > 1 && !isWorldModelTurnDowngraded(conversationId)) {
      const wmConfig = resolveWorldModelConfig(readSettings())
      if (modeAtLeast(wmConfig.mode, 'verify')) {
        const batch: BatchCall[] = calls.map((c) => {
          try {
            const parsed = JSON.parse(c.function.arguments)
            return {
              toolName: c.function.name,
              args:
                parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
            }
          } catch {
            return { toolName: c.function.name, args: null }
          }
        })
        const rf = rollforwardCalls(batch, {
          workspaceRoot: workspacePath,
          conversationId
        })
        if (!rf.ok && rf.firstViolation && rf.firstViolation.index > 0) {
          const v = rf.firstViolation
          try {
            recordEvent({
              type: 'world_model.verdict',
              actorKind: 'system',
              severity: 'info',
              conversationId,
              correlationId,
              toolCallId: calls[v.index].id,
              entityKind: 'tool',
              entityId: v.toolName,
              payload: {
                tool: v.toolName,
                batch: true,
                batchSize: calls.length,
                violationIndex: v.index,
                violationKinds: v.verdict.violations.map((x) => x.kind),
                paths: v.verdict.violations.map((x) => x.path).filter(Boolean),
                blocked: true
              }
            })
          } catch {
            // Audit failures never fail the verdict.
          }
          trace('resolveToolCallWindows.rollforward-blocked', {
            conversationId,
            batchSize: calls.length,
            violationIndex: v.index,
            tool: v.toolName
          })
          recordInterventionAndMaybeDowngrade(
            conversationId, wmConfig.repairBudget, calls[v.index].id, v.toolName, correlationId
          )
          return calls.map((c, i) => ({
            callId: c.id,
            result:
              i === v.index
                ? verdictToolResult(v.toolName, v.verdict)
                : batchNotExecutedResult(v.index, v.toolName)
          }))
        }
      }
    }
  } catch (rfErr) {
    trace('resolveToolCallWindows.rollforward-failed', {
      conversationId,
      error: rfErr instanceof Error ? rfErr.message.slice(0, 200) : String(rfErr)
    })
  }

  const resolved: ResolvedToolCall[] = new Array(calls.length)
  const windows = partitionToolCallWindows(calls, (id) => toolRegistry.getById(id))
  for (const win of windows) {
    signal.throwIfAborted()
    if (win.kind === 'parallel') {
      const settled = await Promise.all(
        win.indices.map((idx) =>
          resolveSingleToolCall(
            calls[idx],
            conversationId,
            model,
            workspacePath,
            signal,
            correlationId
          )
        )
      )
      for (let i = 0; i < win.indices.length; i++) {
        resolved[win.indices[i]] = settled[i]
      }
    } else {
      resolved[win.index] = await resolveSingleToolCall(
        calls[win.index],
        conversationId,
        model,
        workspacePath,
        signal,
        correlationId
      )
    }
  }
  signal.throwIfAborted()
  return resolved
}
