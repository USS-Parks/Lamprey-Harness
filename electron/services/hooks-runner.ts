import { spawn } from 'child_process'
import { listHooksForEvent, type HookEvent } from './hooks-store'

export interface HookContext {
  conversationId?: string
  toolName?: string
  promptBody?: string
  cwd?: string
}

const PROMPT_CAP = 4096

function buildEnv(event: HookEvent, ctx: HookContext): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env }
  env.LAMPREY_HOOK_EVENT = event
  env.LAMPREY_HOOK_TIMESTAMP = String(Date.now())
  if (ctx.conversationId) env.LAMPREY_HOOK_CONVERSATION_ID = ctx.conversationId
  if (ctx.toolName) env.LAMPREY_HOOK_TOOL_NAME = ctx.toolName
  if (ctx.promptBody) env.LAMPREY_HOOK_PROMPT_BODY = ctx.promptBody.slice(0, PROMPT_CAP)
  env.LAMPREY_HOOK_CWD = ctx.cwd || process.cwd()
  return env
}

// Fire-and-forget. Logs failures to stderr; never throws or blocks the
// caller. We deliberately use shell:true so the user can write commands the
// way they would in a terminal — at the cost of taking on quoting risk that
// only fires their own commands, never untrusted input.
export function fireHooks(event: HookEvent, ctx: HookContext = {}): void {
  let hooks: ReturnType<typeof listHooksForEvent>
  try {
    hooks = listHooksForEvent(event)
  } catch (err) {
    console.error('[hooks] list failed:', err)
    return
  }
  if (hooks.length === 0) return
  const env = buildEnv(event, ctx)
  for (const hook of hooks) {
    try {
      const proc = spawn(hook.command, {
        shell: true,
        env,
        cwd: ctx.cwd || process.cwd(),
        windowsHide: true,
        // Fire-and-forget: only the exit code is consumed. Piping stdout/stderr
        // without draining them lets a hook that writes >~64KB block forever on a
        // full pipe buffer, so discard both streams.
        stdio: 'ignore'
      })
      proc.on('error', (err) => {
        console.error(`[hook ${event}:${hook.label}] error:`, err.message)
      })
      proc.on('exit', (code) => {
        if (code && code !== 0) {
          console.warn(`[hook ${event}:${hook.label}] exited ${code}`)
        }
      })
    } catch (err: any) {
      console.error(`[hook ${event}:${hook.label}] spawn failed:`, err?.message)
    }
  }
}
