// Two CORE lists, one module. They disagree on purpose (K2 / AC-11).
//
// CORE_SURFACE_NAMES — lazy always-on tools shipped on every coding turn.
// CORE_NORMALIZE_NAMES — fail-fast set for schema normalization.
// Do not union these. Do not add web_search to the normalizer set.
// Do not drop verify_workspace from the normalizer set.

export const CORE_SURFACE_NAMES: readonly string[] = [
  'shell_command',
  'apply_patch',
  'workspace_context',
  'view_image',
  'web_search',
  'ask_user_question',
  'update_plan',
  'enter_plan_mode',
  'exit_plan_mode',
  'get_goal',
  'read_tool_result',
  'skill_open'
]

export const CORE_NORMALIZE_NAMES: readonly string[] = [
  'workspace_context',
  'view_image',
  'shell_command',
  'apply_patch',
  'verify_workspace',
  'shell_list',
  'shell_monitor',
  'shell_stop',
  'shell_output'
]
