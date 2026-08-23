// Shared CORE surface list for renderer hints (NewSkillWizard).
// Must stay equal to electron/services/core-tool-names.ts CORE_SURFACE_NAMES.
// Locked by electron/services/core-surface-hints.test.ts.

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
