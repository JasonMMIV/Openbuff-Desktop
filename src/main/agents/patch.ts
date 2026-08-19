/**
 * OpenBuff agent patcher for the desktop app:
 * 1. Restores the full tool surface (including edit_transaction) on base2 and its variants
 *    by setting toolNames to programmaticConfig.fullToolSurface and disabling
 *    Progressive Tool Disclosure (progressiveToolDisclosure: false).
 *    PTD's hardcoded keyword regex (implement/fix/refactor/update/create/add)
 *    fails on common verbs like "write"/"save"/"make" and all non-English input.
 * 2. Adds native web_search to base2 (DuckDuckGo, built into agent-runtime).
 */

const BASE_AGENT_IDS = [
  'base2',
  'base2-fast',
  'base2-plan',
  'base2-execute-plan',
  'base2-fast-no-validation',
  'base2-evals',
  'base-deep',
  'base-deep-evals'
]

export function patchBundledAgents<T extends Record<string, any>>(agents: T): T {
  const patched = { ...agents } as Record<string, any>

  for (const id of BASE_AGENT_IDS) {
    const def = patched[id]
    if (!def) continue

    // When pre-generated with PTD on, def.toolNames is CORE-only and the full surface
    // is stored in programmaticConfig.fullToolSurface. Restore the full surface as toolNames.
    const fullSurface = Array.isArray(def.programmaticConfig?.fullToolSurface)
      ? [...def.programmaticConfig.fullToolSurface]
      : Array.isArray(def.toolNames)
        ? [...def.toolNames]
        : []

    // Stop agents from repeatedly calling git_status after learning the directory
    // is not a git repository — each retry burns tokens and spams the activity feed.
    // Applies to the prompt-based agents listed above (all base2 variants).
    let systemPrompt = typeof def.systemPrompt === 'string' ? def.systemPrompt : ''
    if (systemPrompt && !systemPrompt.includes('not a git repository')) {
      systemPrompt = `${systemPrompt}\n\n# Git status discipline\n\nIf \`git_status\` reports that the current directory is not a git repository (e.g. \`fatal: not a git repository\`), do not call \`git_status\` again for the rest of this turn. Rely on the runtime-injected Git observation instead.`
    }

    patched[id] = {
      ...def,
      toolNames: fullSurface,
      systemPrompt: systemPrompt || undefined,
      programmaticConfig: {
        ...(def.programmaticConfig ?? {}),
        progressiveToolDisclosure: false,
        fullToolSurface: fullSurface
      }
    }
  }

  // web_search: built into agent-runtime (DuckDuckGo), but not in base2's default toolNames
  const baseDef = patched['base2']
  if (baseDef && Array.isArray(baseDef.toolNames) && !baseDef.toolNames.includes('web_search')) {
    patched['base2'] = { ...baseDef, toolNames: [...baseDef.toolNames, 'web_search'] }
  }

  return patched as T
}
