import { OpenbuffClient, type PrintModeEvent, type RunState } from '@openbuff/sdk'
import type { BrowserWindow } from 'electron'
import { applySettingsToEnv, saveTaskCheckpoint, loadSettings } from './settings'
import { bundledAgents } from './agents/bundled-agents'
import { patchBundledAgents } from './agents/patch'
import { loadProjectLocalAgents, type LocalAgentsResult } from './agents/local-agents'
import type { QueryIndexData, QueryIndexQuery, QueryIndexResult } from '../shared/codebase-index'

/**
 * Embeds OpenbuffClient in the main process.
 * - Events (tool_call, text, subagent_start, etc.) are normalized and pushed to the renderer
 * - Stream chunks are forwarded live (assistant message text)
 */

export interface UiEvent {
  type: string
  text?: string
  toolName?: string
  status?: string
  agentType?: string
  model?: string
  message?: string
  files?: string[]
  used?: number
  max?: number
  totalCost?: number
  queryInput?: QueryIndexQuery
  queryIndex?: QueryIndexData
  raw?: unknown
}

/** File paths a tool mutates, keyed by tool name (mirrors the SDK's PATH_INPUTS). */
function extractMutationFiles(toolName: string, input: unknown): string[] {
  if (!input || typeof input !== 'object') return []
  const rec = input as Record<string, unknown>
  const paths: string[] = []
  const push = (p: unknown): void => {
    if (typeof p === 'string' && p.trim()) paths.push(p.trim())
  }
  switch (toolName) {
    case 'edit_transaction': {
      const edits = rec.edits
      if (Array.isArray(edits)) {
        for (const e of edits) {
          if (e && typeof e === 'object') push((e as Record<string, unknown>).path)
        }
      }
      break
    }
    case 'apply_patch': {
      const op = rec.operation
      if (op && typeof op === 'object') push((op as Record<string, unknown>).path)
      push(rec.path)
      break
    }
    case 'write_file':
    case 'str_replace':
    case 'replace_range':
    case 'rewrite_symbol':
    case 'create_file':
    case 'move_file':
    case 'delete_file':
      push(rec.path)
      if (toolName === 'move_file') push(rec.newPath)
      break
    default:
      return []
  }
  return paths
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeQueryIndexInput(input: unknown): QueryIndexQuery | undefined {
  if (!isRecord(input)) return undefined
  const query: QueryIndexQuery = {}
  if (typeof input.query === 'string') query.query = input.query
  if (typeof input.limit === 'number') query.limit = input.limit
  if (typeof input.mode === 'string') query.mode = input.mode
  if (typeof input.from === 'string') query.from = input.from
  if (typeof input.to === 'string') query.to = input.to
  if (Array.isArray(input.fileTypes)) query.fileTypes = input.fileTypes.filter((v): v is string => typeof v === 'string')
  if (Array.isArray(input.pathPrefixes)) query.pathPrefixes = input.pathPrefixes.filter((v): v is string => typeof v === 'string')
  return query
}

function normalizeQueryIndexResult(value: unknown): QueryIndexResult | null {
  if (!isRecord(value) || typeof value.path !== 'string') return null
  const result: QueryIndexResult = { path: value.path }
  if (typeof value.indexedHash === 'string') result.indexedHash = value.indexedHash
  if (typeof value.score === 'number') result.score = value.score
  if (Array.isArray(value.matchedOn)) result.matchedOn = value.matchedOn.filter((v): v is string => typeof v === 'string')
  if (Array.isArray(value.symbols)) result.symbols = value.symbols.filter((v): v is string => typeof v === 'string')
  if (Array.isArray(value.headings)) result.headings = value.headings.filter((v): v is string => typeof v === 'string')
  if (Array.isArray(value.matchedSnippets)) result.matchedSnippets = value.matchedSnippets.filter((v): v is string => typeof v === 'string')
  if (typeof value.explanation === 'string') result.explanation = value.explanation
  if (Array.isArray(value.relatedFiles)) {
    result.relatedFiles = value.relatedFiles.filter(isRecord).flatMap((related) => {
      if (typeof related.path !== 'string') return []
      return [{
        path: related.path,
        ...(typeof related.score === 'number' ? { score: related.score } : {}),
        ...(typeof related.reason === 'string' ? { reason: related.reason } : {}),
        ...(typeof related.via === 'string' ? { via: related.via } : {})
      }]
    })
  }
  return result
}

function extractQueryIndexData(output: unknown): QueryIndexData | undefined {
  const items = Array.isArray(output) ? output : [output]
  for (const item of items) {
    if (!isRecord(item)) continue
    const candidate = item.type === 'json' && isRecord(item.value) ? item.value : item
    if (!isRecord(candidate) || !Array.isArray(candidate.results)) continue
    const results = candidate.results.flatMap((value) => {
      const result = normalizeQueryIndexResult(value)
      return result ? [result] : []
    })
    const data: QueryIndexData = { results }
    if (typeof candidate.kind === 'string') data.kind = candidate.kind
    if (typeof candidate.schemaVersion === 'number') data.schemaVersion = candidate.schemaVersion
    if (typeof candidate.totalIndexed === 'number') data.totalIndexed = candidate.totalIndexed
    if (typeof candidate.indexAge === 'number') data.indexAge = candidate.indexAge
    if (typeof candidate.message === 'string') data.message = candidate.message
    if (isRecord(candidate.status)) data.status = candidate.status as QueryIndexData['status']
    if (isRecord(candidate.snapshot)) data.snapshot = candidate.snapshot as QueryIndexData['snapshot']
    return data
  }
  return undefined
}

let client: OpenbuffClient | null = null
let currentCwd: string | undefined
let currentAbort: AbortController | null = null
let mainWindow: BrowserWindow | null = null
let pendingApprovalResolver: ((approved: boolean) => void) | null = null

export function respondApproval(approved: boolean): void {
  if (pendingApprovalResolver) {
    const fn = pendingApprovalResolver
    pendingApprovalResolver = null
    fn(approved)
  }
}
/** Custom agents loaded for the current cwd (used by the Settings status panel). */
let lastLocalAgents: LocalAgentsResult = { agents: [], validationErrors: [] }


export function attachWindow(win: BrowserWindow): void {
  mainWindow = win
}

function sendEvent(event: UiEvent): void {
  if (event.type === 'ignored') return
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('openbuff:event', event)
  }
}

/** Normalize the SDK's PrintModeEvent into a compact event the UI can render */
function normalizeEvent(event: PrintModeEvent): UiEvent {
  const e = event as unknown as Record<string, unknown>
  const type = String(e.type ?? 'unknown')
  const base: UiEvent = { type }
  switch (type) {
    case 'text':
      base.text = String(e.text ?? '')
      break
    case 'tool_call':
      base.toolName = String(e.toolName ?? '')
      base.status = 'running'
      base.agentType = e.agentType ? String(e.agentType) : undefined
      if (
        base.toolName === 'add_message' ||
        base.toolName === 'set_messages' ||
        base.toolName === 'set_output' ||
        base.toolName === 'end_turn' ||
        base.toolName === 'git_status' ||
        base.toolName === 'check_job' ||
        base.toolName === 'check_background_agent' ||
        base.toolName === 'list_jobs'
      ) {
        return { type: 'ignored' }
      }
      if (base.toolName === 'suggest_followups') {
        if (e.input) {
          try {
            base.message = typeof e.input === 'string' ? e.input : JSON.stringify(e.input)
          } catch {
            // ignore
          }
        }
        return base
      }
      if (base.toolName === 'query_index') base.queryInput = normalizeQueryIndexInput(e.input)
      // Track files this run modifies so the UI can offer "revert changes up to this point".
      const mutated = extractMutationFiles(base.toolName, e.input)
      if (mutated.length > 0) base.files = mutated
      break
    case 'tool_start':
      base.toolName = String(e.toolName ?? '')
      base.status = 'running'
      base.agentType = e.agentType ? String(e.agentType) : undefined
      if (
        base.toolName === 'add_message' ||
        base.toolName === 'set_messages' ||
        base.toolName === 'set_output' ||
        base.toolName === 'end_turn' ||
        base.toolName === 'git_status' ||
        base.toolName === 'check_job' ||
        base.toolName === 'check_background_agent' ||
        base.toolName === 'list_jobs' ||
        base.toolName === 'suggest_followups' ||
        base.toolName === 'run_file_change_hooks' ||
        base.toolName === 'run_targeted_validation'
      ) {
        return { type: 'ignored' }
      }
      break
    case 'tool_result': {
      base.toolName = String(e.toolName ?? '')
      base.status = String(e.status ?? 'done')
      base.agentType = e.agentType ? String(e.agentType) : undefined
      if (
        base.toolName === 'add_message' ||
        base.toolName === 'set_messages' ||
        base.toolName === 'set_output' ||
        base.toolName === 'end_turn' ||
        base.toolName === 'git_status' ||
        base.toolName === 'check_job' ||
        base.toolName === 'check_background_agent' ||
        base.toolName === 'list_jobs' ||
        base.toolName === 'suggest_followups' ||
        base.toolName === 'run_file_change_hooks' ||
        base.toolName === 'run_targeted_validation'
      ) {
        return { type: 'ignored' }
      }
      if (base.toolName === 'spawn_agents' || base.toolName === 'spawn_agent_inline') {
        base.message = 'Subagents finished'
        break
      }
      if (base.toolName === 'query_index') {
        const queryIndex = extractQueryIndexData(e.output)
        if (queryIndex) {
          base.queryIndex = queryIndex
          base.message = queryIndex.message ?? `Found ${queryIndex.results.length} indexed file result(s).`
        }
      }
      // Carry tool output text into the UI so completed tools don't render as an empty line
      const output = e.output
      if (Array.isArray(output)) {
        const parts: string[] = []
        for (const o of output) {
          if (o && typeof o === 'object') {
            if (o.type === 'text' && typeof o.text === 'string') parts.push(o.text)
            else if (o.type === 'json' && o.value !== undefined) {
              try {
                const v = o.value
                parts.push(typeof v === 'string' ? v : JSON.stringify(v))
              } catch {
                // ignore serialization failure
              }
            } else if (o.type === 'media') {
              parts.push(`[${String(o.mediaType ?? 'media')}]`)
            }
          } else if (typeof o === 'string') {
            parts.push(o)
          }
        }
        const joined = parts.join('\n').slice(0, 4000)
        if (joined && !base.queryIndex) base.message = joined
      }
      break
    }
    case 'subagent_start':
      base.agentType = String(e.agentType ?? '')
      base.model = e.model ? String(e.model) : undefined
      if (e.prompt) base.message = String(e.prompt)
      break
    case 'subagent_finish':
      base.agentType = String(e.agentType ?? '')
      base.status = 'done'
      if (e.output) {
        try {
          base.message = typeof e.output === 'string' ? e.output : JSON.stringify(e.output)
        } catch {
          // ignore
        }
      }
      break
    case 'start':
      base.agentType = String(e.agentType ?? '')
      base.status = 'started'
      break
    case 'finish':
      base.status = 'done'
      base.totalCost = typeof e.totalCost === 'number' ? e.totalCost : undefined
      break
    case 'error': {
      const msg = String(e.error ?? e.message ?? '')
      // SDK-internal schema validation warnings on streaming chunks (e.g. some OpenAI-compatible
      // endpoints omit the tool_calls index) or followups termination warning — harmless, don't surface to the user
      if (
        msg.includes('Type validation failed') ||
        msg.includes('suggest_followups already ended') ||
        msg.includes('No more non-terminal tools are available after followups')
      ) {
        return { type: 'ignored' }
      }
      base.message = msg
      break
    }
    case 'phase':
      base.status = String(e.status ?? '')
      break
    case 'reasoning_delta':
      base.text = String(e.delta ?? e.chunk ?? e.text ?? '')
      break
    case 'provider_status':
      base.message = String(e.status ?? '')
      break
    case 'context_window':
      base.used = typeof e.used === 'number' ? e.used : undefined
      base.max = typeof e.max === 'number' ? e.max : undefined
      break
    case 'download':
      base.message = String(e.label ?? '')
      base.status = String(e.status ?? '')
      break
    default:
      base.raw = e
  }
  return base
}

export function isRunning(): boolean {
  return currentAbort !== null
}

/** Custom agents (.agents/) discovered for the current project. */
export function getLastLocalAgents(): LocalAgentsResult {
  return lastLocalAgents
}

/** Load custom agents for a project and merge them over the bundled definitions. */
async function buildAgentDefinitions(cwd: string): Promise<{ definitions: Record<string, any>; local: LocalAgentsResult }> {
  const local = await loadProjectLocalAgents(cwd)
  lastLocalAgents = local
  const merged: Record<string, any> = { ...patchBundledAgents(bundledAgents) }
  // Project/home agents override bundled ones with the same id (CLI behavior).
  for (const [id, def] of Object.entries(local.agents)) {
    merged[id] = def
  }
  // Expose custom agents to the main agent so base2 can spawn them.
  const customIds = local.agents.map((a) => a.id)
  const baseDef = merged['base2']
  if (baseDef && customIds.length > 0) {
    const existing = new Set(baseDef.spawnableAgents ?? [])
    const added = customIds.filter((id) => !existing.has(id))
    if (added.length > 0) {
      merged['base2'] = { ...baseDef, spawnableAgents: [...(baseDef.spawnableAgents ?? []), ...added] }
    }
  }
  return { definitions: merged, local }
}

export interface RunPromptOptions {
  /** Resume an interrupted turn: the user prompt is already in the run state's history. */
  resume?: boolean
  /** Task id used to persist mid-turn checkpoints (crash recovery). */
  taskId?: string
}

export async function runPrompt(
  cwd: string,
  prompt: string,
  previousRun: RunState | undefined,
  onDone: (runState: RunState | null, error: string | null) => void,
  opts: RunPromptOptions = {}
): Promise<void> {
  if (currentAbort) {
    onDone(null, 'Another task is already running')
    return
  }
  currentCwd = cwd
  currentAbort = new AbortController()

  try {
    // Apply provider settings (API key + config path) before each run
    applySettingsToEnv()

    // Load custom agents (.agents/). A broken agent file must never block the whole
    // run — fall back to the bundled definitions and report the load failure.
    let definitions: Record<string, any>
    try {
      const built = await buildAgentDefinitions(cwd)
      definitions = built.definitions
    } catch (agentLoadError) {
      definitions = patchBundledAgents(bundledAgents)
      sendEvent({ type: 'error', message: `Custom agents failed to load: ${agentLoadError instanceof Error ? agentLoadError.message : String(agentLoadError)}` })
    }
    const currentSettings = loadSettings()
    client = new OpenbuffClient({
      cwd,
      agentDefinitions: Object.values(definitions),
      approvalMode: currentSettings.approvalMode ?? 'balanced',
      requestApproval: async (request: { action: string; target: string; reason?: string; risk?: string }) => {
        if (!mainWindow || mainWindow.isDestroyed()) return false

        // Cancel previous pending approval if any
        if (pendingApprovalResolver) {
          const prev = pendingApprovalResolver
          pendingApprovalResolver = null
          prev(false)
        }

        sendEvent({
          type: 'approval_request',
          message: `${request.action}: ${request.target}`,
          raw: request
        })

        return new Promise<boolean>((resolve) => {
          pendingApprovalResolver = resolve
        })
      },
      handleEvent: (event) => {
        sendEvent(normalizeEvent(event))
      },
      handleStreamChunk: (chunk) => {
        // Only the main agent's plain-text chunks belong in the assistant bubble.
        // Sub-agent / reasoning chunks are forwarded as events so the UI can
        // choose to render them separately — they must not be appended to the
        // main assistant message (that caused duplicated/spliced replies).
        if (typeof chunk === 'string') {
          sendEvent({ type: 'stream', text: chunk })
        } else if (chunk && typeof chunk === 'object' && 'chunk' in chunk) {
          if (chunk.type === 'subagent_chunk') {
            sendEvent({ type: 'subagent_stream', text: String(chunk.chunk), agentType: chunk.agentType ? String(chunk.agentType) : undefined })
          } else if (chunk.type === 'reasoning_chunk') {
            sendEvent({ type: 'reasoning_stream', text: String(chunk.chunk) })
          }
        }
      },
      runTimeoutMs: 30 * 60 * 1000 // 30-minute safety timeout
    })

    const runState = await client.run({
      agent: 'base2',
      prompt,
      previousRun,
      signal: currentAbort.signal,
      // When resuming, the user prompt is already present in the restored history;
      // the SDK must not re-append it (otherwise the turn would run twice).
      resumeInterruptedTurn: opts.resume === true,
      // Persist a mid-turn checkpoint every ~30s so a crashed session can be
      // resumed from the last checkpoint instead of losing in-flight work.
      onCheckpoint: (agentState) => {
        if (opts.taskId) {
          try {
            saveTaskCheckpoint(opts.taskId, agentState)
          } catch {
            // checkpoint persistence is best-effort; never kill the run
          }
        }
      }
    })

    onDone(runState, null)
  } catch (error) {
    // The SDK resolves (not rejects) on abort/API errors, so this only fires on
    // unexpected failures. Report the error so the UI can offer to retry.
    onDone(null, error instanceof Error ? error.message : String(error))
  } finally {
    if (pendingApprovalResolver) {
      const fn = pendingApprovalResolver
      pendingApprovalResolver = null
      fn(false)
    }
    client = null
    currentCwd = undefined
    currentAbort = null
  }
}

export function abortRun(): void {
  if (pendingApprovalResolver) {
    const fn = pendingApprovalResolver
    pendingApprovalResolver = null
    fn(false)
  }
  currentAbort?.abort()
}

export function getCurrentCwd(): string | undefined {
  return currentCwd
}
