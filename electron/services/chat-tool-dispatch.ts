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
        })
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
