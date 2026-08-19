import { app, safeStorage } from 'electron'
import { existsSync, mkdirSync, promises as fsPromises, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'fs'
import { join } from 'path'

/**
 * Provider settings management (multi-provider).
 * - Each provider can have multiple models; any number of OpenAI-compatible providers can be added.
 * - API keys are encrypted with Electron safeStorage (DPAPI on Windows) and stored per-provider in userData.
 * - Provider settings are written as openbuff.json (SDK provider config format),
 *   referenced via the OPENBUFF_PROVIDER_CONFIG environment variable.
 */

export type ProviderType = 'openai-compatible' | 'anthropic-compatible'
export type ReasoningEffort = 'default' | 'high' | 'medium' | 'low' | 'minimal' | 'none'
export type ApprovalMode = 'balanced' | 'strict' | 'allow-all'

export interface ProviderConfig {
  id: string
  label: string
  type: ProviderType
  baseURL: string
  apiKeyEnv: string
  models: string[]
}

export interface TaskMessage {
  kind: string
  text?: string
  tool?: { toolName: string; status: string; agentType?: string; detail?: string }
}

export interface TaskRecord {
  id: string
  prompt: string
  createdAt: number
}

export interface ProjectRecord {
  path: string
  name: string
  tasks: TaskRecord[]
}

/** Per-agent model route: `${providerId}/${model}` plus an optional reasoning effort. */
export interface AgentRoute {
  model: string
  reasoningEffort?: ReasoningEffort
}

export interface AppSettings {
  providers: ProviderConfig[]
  activeModel: string // `${providerId}/${model}`
  reasoningEffort: ReasoningEffort
  approvalMode: ApprovalMode
  cwd: string | null
  hasProvider: boolean
  providerHasKey: Record<string, boolean>
  projects: ProjectRecord[]
  /** Per-agent model routing overrides, keyed by agent ID. Empty = use the global default model. */
  agentRouting: Record<string, AgentRoute>
}

const SETTINGS_FILE = 'openbuff-app-settings.json'

interface PersistedSettings {
  providers: ProviderConfig[]
  activeModel: string
  reasoningEffort: ReasoningEffort
  approvalMode: ApprovalMode
  cwd?: string
  encryptedKeys?: Record<string, string> // providerId -> base64 encrypted key
  projects?: ProjectRecord[]
  agentRouting?: Record<string, AgentRoute>
}

const DEFAULT_PROVIDERS: ProviderConfig[] = [
  {
    id: 'openai',
    label: 'OpenAI API',
    type: 'openai-compatible',
    baseURL: 'https://api.openai.com/v1',
    apiKeyEnv: 'OPENAI_API_KEY',
    models: ['gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-5.4-nano', 'gpt-5.2', 'gpt-5.2-codex', 'gpt-4.1', 'gpt-4.1-mini']
  },
  {
    id: 'anthropic',
    label: 'Anthropic API',
    type: 'anthropic-compatible',
    baseURL: 'https://api.anthropic.com/v1',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    models: ['claude-opus-4-5', 'claude-sonnet-4-5', 'claude-haiku-4-5', 'claude-opus-4-1', 'claude-sonnet-4-0']
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    type: 'openai-compatible',
    baseURL: 'https://openrouter.ai/api/v1',
    apiKeyEnv: 'OPENROUTER_API_KEY',
    models: ['anthropic/claude-sonnet-4.5', 'anthropic/claude-opus-4.1', 'anthropic/claude-haiku-4.5', 'openai/gpt-5.5', 'openai/gpt-4.1']
  }
]

function settingsPath(): string {
  return join(app.getPath('userData'), SETTINGS_FILE)
}

/** Automatically migrate settings, keys, and tasks from legacy 'openbuff-windows' directory if present. */
function migrateLegacyUserData(): void {
  try {
    const currentDir = app.getPath('userData')
    const currentSettings = join(currentDir, SETTINGS_FILE)

    const appData = app.getPath('appData')
    const legacyDir = join(appData, 'openbuff-windows')
    const legacySettings = join(legacyDir, SETTINGS_FILE)
    if (!existsSync(legacySettings)) return

    // Check if current settings is missing or essentially empty (no projects and no keys)
    let shouldMigrateSettings = true
    if (existsSync(currentSettings)) {
      try {
        const currentData = JSON.parse(readFileSync(currentSettings, 'utf-8')) as PersistedSettings
        const hasKeys = currentData.encryptedKeys && Object.keys(currentData.encryptedKeys).length > 0
        const hasProjects = Array.isArray(currentData.projects) && currentData.projects.length > 0
        if (hasKeys || hasProjects) {
          shouldMigrateSettings = false
        }
      } catch {
        shouldMigrateSettings = true
      }
    }

    mkdirSync(currentDir, { recursive: true })

    if (shouldMigrateSettings) {
      writeFileSync(currentSettings, readFileSync(legacySettings, 'utf-8'), 'utf-8')

      const legacyOpenbuffJson = join(legacyDir, 'openbuff.json')
      if (existsSync(legacyOpenbuffJson)) {
        writeFileSync(join(currentDir, 'openbuff.json'), readFileSync(legacyOpenbuffJson, 'utf-8'), 'utf-8')
      }

      const legacyWindowState = join(legacyDir, 'window-state.json')
      if (existsSync(legacyWindowState)) {
        writeFileSync(join(currentDir, 'window-state.json'), readFileSync(legacyWindowState, 'utf-8'), 'utf-8')
      }
    }

    // Always copy any missing task transcripts
    const legacyTasksDir = join(legacyDir, 'tasks')
    if (existsSync(legacyTasksDir)) {
      const currentTasksDir = join(currentDir, 'tasks')
      mkdirSync(currentTasksDir, { recursive: true })
      const files = readdirSync(legacyTasksDir)
      for (const f of files) {
        try {
          const src = join(legacyTasksDir, f)
          const dst = join(currentTasksDir, f)
          if (statSync(src).isFile() && !existsSync(dst)) {
            writeFileSync(dst, readFileSync(src))
          }
        } catch {
          // ignore single file copy error
        }
      }
    }
  } catch {
    // ignore migration failure
  }
}

function defaultSettings(): PersistedSettings {
  return {
    providers: DEFAULT_PROVIDERS.map((p) => ({ ...p, models: [...p.models] })),
    activeModel: 'openai/gpt-5.5',
    reasoningEffort: 'default',
    approvalMode: 'balanced',
    projects: []
  }
}

export function loadSettings(): PersistedSettings {
  migrateLegacyUserData()
  const file = settingsPath()
  if (!existsSync(file)) return defaultSettings()
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf-8')) as Partial<PersistedSettings>
    const base = defaultSettings()
    // Migrate legacy format (single provider) → new multi-provider format
    const legacy = parsed as unknown as Record<string, unknown>
    if (Array.isArray(parsed.providers) && parsed.providers.length > 0) {
      base.providers = parsed.providers
    } else if (typeof legacy.providerType === 'string' && legacy.baseURL !== undefined) {
      const id = String(legacy.providerType)
      const models = Array.isArray(legacy.models)
        ? (legacy.models as string[])
        : legacy.model
          ? [String(legacy.model)]
          : []
      base.providers = [
        {
          id,
          label: id,
          type: id === 'anthropic' ? 'anthropic-compatible' : 'openai-compatible',
          baseURL: String(legacy.baseURL ?? ''),
          apiKeyEnv: id === 'anthropic' ? 'ANTHROPIC_API_KEY' : id === 'openrouter' ? 'OPENROUTER_API_KEY' : 'OPENAI_API_KEY',
          models
        }
      ]
      if (typeof legacy.model === 'string' && legacy.model) {
        base.activeModel = `${id}/${legacy.model}`
      }
    }
    if (typeof parsed.activeModel === 'string' && parsed.activeModel) base.activeModel = parsed.activeModel
    if (parsed.reasoningEffort) base.reasoningEffort = parsed.reasoningEffort
    if (parsed.approvalMode) base.approvalMode = parsed.approvalMode
    if (typeof parsed.cwd === 'string') base.cwd = parsed.cwd
    if (parsed.encryptedKeys && typeof parsed.encryptedKeys === 'object') base.encryptedKeys = parsed.encryptedKeys
    if (Array.isArray(parsed.projects)) base.projects = parsed.projects
    if (parsed.agentRouting && typeof parsed.agentRouting === 'object') {
      base.agentRouting = Object.fromEntries(
        Object.entries(parsed.agentRouting).filter(([, v]) => v && typeof v.model === 'string' && v.model.trim())
      )
    }
    // Legacy single-key migration
    if (!base.encryptedKeys && typeof legacy.encryptedApiKey === 'string') {
      const first = base.providers[0]
      if (first) base.encryptedKeys = { [first.id]: legacy.encryptedApiKey as string }
    }
    return base
  } catch {
    return defaultSettings()
  }
}

function saveSettings(settings: PersistedSettings): void {
  const file = settingsPath()
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(file, JSON.stringify(settings, null, 2), 'utf-8')
}

export function getAppSettings(): AppSettings {
  const s = loadSettings()
  const activeProviderId = s.activeModel.split('/')[0] ?? ''
  const activeProvider = s.providers.find((p) => p.id === activeProviderId) ?? s.providers[0]
  const hasKey = activeProvider ? Boolean(s.encryptedKeys?.[activeProvider.id]) : false
  const isLocal = activeProvider ? /localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(activeProvider.baseURL) : false
  const providerHasKey: Record<string, boolean> = {}
  for (const p of s.providers) {
    providerHasKey[p.id] = Boolean(s.encryptedKeys?.[p.id])
  }
  return {
    providers: s.providers,
    activeModel: s.activeModel,
    reasoningEffort: s.reasoningEffort,
    approvalMode: s.approvalMode,
    cwd: s.cwd ?? null,
    hasProvider: Boolean(activeProvider) && (hasKey || isLocal),
    providerHasKey,
    projects: s.projects ?? [],
    agentRouting: s.agentRouting ?? {}
  }
}

export function saveCwd(cwd: string): void {
  const s = loadSettings()
  s.cwd = cwd
  saveSettings(s)
}

/** Update the provider list and preferences (does not touch API keys). */
export function updateProviders(
  providers: ProviderConfig[],
  activeModel: string,
  reasoningEffort: ReasoningEffort,
  approvalMode: ApprovalMode
): void {
  const s = loadSettings()
  s.providers = providers
  s.activeModel = activeModel || s.activeModel
  s.reasoningEffort = reasoningEffort
  s.approvalMode = approvalMode
  saveSettings(s)
}

/** Replace the per-agent model routing table (empty values are dropped). */
export function updateAgentRouting(routing: Record<string, AgentRoute>): void {
  const s = loadSettings()
  s.agentRouting = Object.fromEntries(
    Object.entries(routing).filter(([, v]) => v && typeof v.model === 'string' && v.model.trim())
  )
  saveSettings(s)
}

/** Save a single provider's API key; empty string deletes that provider's key. */
export function saveProviderApiKey(providerId: string, apiKey: string): void {
  const s = loadSettings()
  s.encryptedKeys = s.encryptedKeys ?? {}
  if (!apiKey) {
    delete s.encryptedKeys[providerId]
  } else if (safeStorage.isEncryptionAvailable()) {
    s.encryptedKeys[providerId] = safeStorage.encryptString(apiKey).toString('base64')
  } else {
    // Encryption unavailable (rare): store plaintext (base64); production should handle this
    s.encryptedKeys[providerId] = `plain:${Buffer.from(apiKey, 'utf-8').toString('base64')}`
  }
  saveSettings(s)
}

export function getProviderApiKey(providerId: string): string | undefined {
  const s = loadSettings()
  const enc = s.encryptedKeys?.[providerId]
  if (!enc) return undefined
  if (enc.startsWith('plain:')) {
    return Buffer.from(enc.slice(6), 'base64').toString('utf-8')
  }
  try {
    return safeStorage.decryptString(Buffer.from(enc, 'base64'))
  } catch {
    return undefined
  }
}

export function hasAnyApiKey(): boolean {
  const s = loadSettings()
  return Object.values(s.encryptedKeys ?? {}).some(Boolean)
}

/** Generate the openbuff.json used by the SDK (provider config + routing); returns the file path */
export function writeProviderConfigFile(): string {
  const s = loadSettings()
  const providers: Record<string, unknown> = {}
  for (const p of s.providers) {
    if (!p.baseURL) continue
    if (p.type === 'anthropic-compatible') {
      providers[p.id] = {
        type: 'anthropic-compatible',
        baseURL: p.baseURL,
        apiKeyEnv: p.apiKeyEnv,
        models: p.models,
        compatibility: {
          stripCacheControl: false,
          stringifyTextContent: false,
          supportsTools: true,
          supportsRequiredToolChoice: true,
          supportsStopSequences: true,
          stripProviderMetadata: false
        }
      }
    } else {
      const isLocal = /localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(p.baseURL)
      providers[p.id] = {
        type: 'openai-compatible',
        baseURL: p.baseURL,
        apiKeyEnv: p.apiKeyEnv,
        models: p.models,
        supportsStructuredOutputs: !isLocal,
        ...(isLocal
          ? {
              compatibility: {
                stripCacheControl: true,
                stringifyTextContent: true,
                supportsTools: true,
                supportsRequiredToolChoice: true,
                supportsStopSequences: false,
                stripProviderMetadata: true
              }
            }
          : {})
      }
    }
  }
  const config: Record<string, unknown> = {
    defaultModel: s.activeModel,
    providers,
    approvalMode: s.approvalMode
  }
  if (s.reasoningEffort && s.reasoningEffort !== 'default') {
    config.defaultReasoningEffort = s.reasoningEffort
  }
  // Per-agent model routing: agents[agentId] = model (string), agentReasoningEfforts[agentId] = effort
  const agentRouting = s.agentRouting ?? {}
  const routed = Object.fromEntries(Object.entries(agentRouting).filter(([, r]) => r && r.model.trim()))
  if (Object.keys(routed).length > 0) {
    config.agents = Object.fromEntries(Object.entries(routed).map(([id, r]) => [id, r.model.trim()]))
    const efforts = Object.fromEntries(
      Object.entries(routed).filter(([, r]) => r.reasoningEffort && r.reasoningEffort !== 'default').map(([id, r]) => [id, r.reasoningEffort])
    )
    if (Object.keys(efforts).length > 0) config.agentReasoningEfforts = efforts
  }
  const file = join(app.getPath('userData'), 'openbuff.json')
  writeFileSync(file, JSON.stringify(config, null, 2), 'utf-8')
  return file
}

/** Apply saved settings to process.env (call before each run) */
export function applySettingsToEnv(): void {
  const s = loadSettings()
  // Set each provider's key on its own env var
  for (const p of s.providers) {
    const key = getProviderApiKey(p.id)
    if (key) {
      process.env[p.apiKeyEnv] = key
    }
  }
  // Point the SDK at the provider config
  process.env.OPENBUFF_PROVIDER_CONFIG = writeProviderConfigFile()
  // local-first / privacy defaults
  process.env.OPENBUFF_LOCAL_MODE = 'true'
  process.env.OPENBUFF_TELEMETRY = 'false'
  process.env.DO_NOT_TRACK = '1'
}

/* ─── Project & task history ─────────────────────────── */

export function listProjects(): ProjectRecord[] {
  const s = loadSettings()
  const projects = s.projects ?? []
  // Migrate legacy inline transcripts (pre per-task-file format) into per-task files
  let migrated = false
  for (const p of projects) {
    for (const t of p.tasks) {
      const inline = (t as TaskRecord & { messages?: TaskMessage[] }).messages
      if (inline && inline.length > 0) {
        saveTaskTranscript(t.id, inline)
        delete (t as unknown as Record<string, unknown>).messages
        migrated = true
      }
    }
  }
  if (migrated) saveSettings(s)
  return projects
}

function isValidTaskId(taskId: string): boolean {
  return typeof taskId === 'string' && /^[a-z0-9_-]+$/i.test(taskId)
}

function transcriptPath(taskId: string): string | null {
  if (!isValidTaskId(taskId)) return null
  return join(app.getPath('userData'), 'tasks', `${taskId}.json`)
}

function runStatePath(taskId: string): string | null {
  if (!isValidTaskId(taskId)) return null
  return join(app.getPath('userData'), 'tasks', `${taskId}.runstate.json`)
}

function checkpointPath(taskId: string): string | null {
  if (!isValidTaskId(taskId)) return null
  return join(app.getPath('userData'), 'tasks', `${taskId}.checkpoint.json`)
}

/** Save a task's full conversation transcript to its own file (unbounded). */
export function saveTaskTranscript(taskId: string, messages: TaskMessage[]): boolean {
  try {
    const file = transcriptPath(taskId)
    if (!file) return false
    const dir = join(app.getPath('userData'), 'tasks')
    mkdirSync(dir, { recursive: true })
    writeFileSync(file, JSON.stringify(messages), 'utf-8')
    return true
  } catch {
    return false
  }
}

/** Persist the SDK run state so a historical conversation can be resumed with full context. */
export function saveTaskRunState(taskId: string, runState: unknown): boolean {
  try {
    const file = runStatePath(taskId)
    if (!file) return false
    const dir = join(app.getPath('userData'), 'tasks')
    mkdirSync(dir, { recursive: true })
    writeFileSync(file, JSON.stringify(runState), 'utf-8')
    return true
  } catch {
    return false
  }
}

/** Load a task's saved run state; returns null when unavailable. */
export function loadTaskRunState(taskId: string): unknown | null {
  try {
    const file = runStatePath(taskId)
    if (!file || !existsSync(file)) return null
    return JSON.parse(readFileSync(file, 'utf-8'))
  } catch {
    return null
  }
}

/** Persist a mid-turn checkpoint (main agent state snapshot) for crash recovery. */
export function saveTaskCheckpoint(taskId: string, agentState: unknown): boolean {
  try {
    const file = checkpointPath(taskId)
    if (!file) return false
    const dir = join(app.getPath('userData'), 'tasks')
    mkdirSync(dir, { recursive: true })
    // Atomic write: temp file + rename, with fallback if Windows briefly locks the file
    const tmp = `${file}.tmp`
    writeFileSync(tmp, JSON.stringify(agentState), 'utf-8')
    rmSync(file, { force: true })
    try {
      renameSync(tmp, file)
    } catch {
      // Fallback copy + remove if renameSync encounters lock contention on Windows
      try {
        writeFileSync(file, readFileSync(tmp))
        rmSync(tmp, { force: true })
      } catch {
        return false
      }
    }
    return true
  } catch {
    return false
  }
}

/** Load a task's last mid-turn checkpoint; returns null when unavailable. */
export function loadTaskCheckpoint(taskId: string): unknown | null {
  try {
    const file = checkpointPath(taskId)
    if (!file || !existsSync(file)) return null
    return JSON.parse(readFileSync(file, 'utf-8'))
  } catch {
    return null
  }
}

/** Load a task's transcript; returns null when the task has no transcript. */
export function loadTaskTranscript(taskId: string): TaskMessage[] | null {
  try {
    const file = transcriptPath(taskId)
    if (!file || !existsSync(file)) return null
    const parsed = JSON.parse(readFileSync(file, 'utf-8'))
    return Array.isArray(parsed) ? (parsed as TaskMessage[]) : null
  } catch {
    return null
  }
}

/** Remove a task from history along with its transcript and runState files. */
export function deleteTask(taskId: string): void {
  if (!isValidTaskId(taskId)) return
  const s = loadSettings()
  s.projects = s.projects ?? []
  for (const p of s.projects) {
    p.tasks = p.tasks.filter((t) => t.id !== taskId)
  }
  saveSettings(s)
  const tp = transcriptPath(taskId)
  if (tp) {
    try {
      rmSync(tp, { force: true })
    } catch {
      // ignore
    }
  }
  const rp = runStatePath(taskId)
  if (rp) {
    try {
      rmSync(rp, { force: true })
    } catch {
      // ignore
    }
  }
  const cp = checkpointPath(taskId)
  if (cp) {
    try {
      rmSync(cp, { force: true })
    } catch {
      // ignore
    }
  }
}

/** Rename a task's prompt in history. */
export function renameTask(taskId: string, newPrompt: string): boolean {
  if (!isValidTaskId(taskId) || !newPrompt.trim()) return false
  const s = loadSettings()
  s.projects = s.projects ?? []
  let found = false
  for (const p of s.projects) {
    const t = p.tasks.find((task) => task.id === taskId)
    if (t) {
      t.prompt = newPrompt.trim()
      found = true
      break
    }
  }
  if (found) {
    saveSettings(s)
  }
  return found
}

export function saveProjectTask(cwd: string, prompt: string): TaskRecord {
  const s = loadSettings()
  s.projects = s.projects ?? []
  const name = cwd.split(/[\\/]/).pop() || cwd
  let project = s.projects.find((p) => p.path === cwd)
  if (!project) {
    project = { path: cwd, name, tasks: [] }
    s.projects.unshift(project)
  } else {
    // Move to the front (most recently used)
    s.projects = s.projects.filter((p) => p.path !== cwd)
    s.projects.unshift(project)
  }
  const task: TaskRecord = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, prompt, createdAt: Date.now() }
  project.tasks.unshift(task)
  if (project.tasks.length > 100) project.tasks = project.tasks.slice(0, 100)
  saveSettings(s)
  return task
}

export function touchProject(cwd: string): void {
  const s = loadSettings()
  s.projects = s.projects ?? []
  const existing = s.projects.find((p) => p.path === cwd)
  if (existing) {
    s.projects = s.projects.filter((p) => p.path !== cwd)
    s.projects.unshift(existing)
    saveSettings(s)
  }
}

/** Remove a project and all its task files from history. */
export function removeProject(projectPath: string): boolean {
  if (!projectPath) return false
  const s = loadSettings()
  s.projects = s.projects ?? []
  const target = s.projects.find((p) => p.path === projectPath)
  if (!target) return false
  for (const t of target.tasks ?? []) {
    deleteTask(t.id)
  }
  const s2 = loadSettings()
  s2.projects = (s2.projects ?? []).filter((p) => p.path !== projectPath)
  saveSettings(s2)
  return true
}

export interface HistorySearchResult {
  taskId: string
  taskPrompt: string
  projectPath: string
  projectName: string
  messageIndex: number
  kind: 'user' | 'assistant'
  snippet: string
  createdAt: number
}

/** Asynchronously search across all historical task transcripts for user and assistant messages only. */
export async function searchHistory(query: string): Promise<HistorySearchResult[]> {
  if (!query || !query.trim()) return []
  const q = query.trim().toLowerCase()
  const s = loadSettings()
  const projects = s.projects ?? []
  const results: HistorySearchResult[] = []

  // Collect all task descriptors across all projects
  const tasksToSearch: { project: ProjectRecord; task: TaskRecord }[] = []
  for (const p of projects) {
    for (const t of p.tasks ?? []) {
      tasksToSearch.push({ project: p, task: t })
    }
  }

  // Read all transcripts in parallel asynchronously to avoid blocking the main event loop
  const transcripts = await Promise.all(
    tasksToSearch.map(async ({ project, task }) => {
      try {
        const file = transcriptPath(task.id)
        if (!file || !existsSync(file)) return null
        const content = await fsPromises.readFile(file, 'utf-8')
        const parsed = JSON.parse(content)
        if (!Array.isArray(parsed)) return null
        return { project, task, messages: parsed as TaskMessage[] }
      } catch {
        return null
      }
    })
  )

  for (const item of transcripts) {
    if (!item) continue
    const { project, task, messages } = item
    messages.forEach((msg, idx) => {
      if (msg.kind !== 'user' && msg.kind !== 'assistant') return
      const rawText = msg.text || ''
      const text = rawText.replace(/\s+/g, ' ')
      const matchIdx = text.toLowerCase().indexOf(q)
      if (matchIdx >= 0) {
        const start = Math.max(0, matchIdx - 20)
        const snippet =
          (start > 0 ? '...' : '') + text.slice(start, start + 100) + (start + 100 < text.length ? '...' : '')
        results.push({
          taskId: task.id,
          taskPrompt: task.prompt,
          projectPath: project.path,
          projectName: project.name,
          messageIndex: idx,
          kind: msg.kind,
          snippet,
          createdAt: task.createdAt
        })
      }
    })
  }

  return results
}

