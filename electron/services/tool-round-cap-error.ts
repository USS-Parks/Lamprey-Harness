// AC-1 — typed tool-round cap. runChatRound used to emit chat:error and
// return null; runHeadlessTurn treated that null as a clean end and the
// finally settled `completed`. A throw cannot be confused with that path.

export const MAX_TOOL_ROUNDS = 50

export const TOOL_ROUND_CAP_MESSAGE =
  `Tool-call cap reached (${MAX_TOOL_ROUNDS} rounds this stage). Re-prompt with "continue" to keep going — the partial work is saved.`

export class ToolRoundCapError extends Error {
  override readonly name = 'ToolRoundCapError'

  constructor() {
    super(TOOL_ROUND_CAP_MESSAGE)
    Object.setPrototypeOf(this, new.target.prototype)
  }
}
