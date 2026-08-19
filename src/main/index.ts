import { app, BrowserWindow, dialog, ipcMain, nativeTheme, screen } from 'electron'
import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { homedir } from 'os'
import { basename, join } from 'path'
import { attachWindow, runPrompt, abortRun, isRunning, getLastLocalAgents, respondApproval } from './openbuff'
import { createLocalAgent, loadProjectLocalAgents, type CreateLocalAgentInput } from './agents/local-agents'
import {
  getAppSettings,
  saveProviderApiKey,
  updateProviders,
  updateAgentRouting,
  applySettingsToEnv,
  saveCwd,
  listProjects,
  saveProjectTask,
  deleteTask,
  saveTaskTranscript,
  loadTaskTranscript,
  saveTaskRunState,
  loadTaskRunState,
  searchHistory,
  touchProject,
  type ProviderConfig,
  type ReasoningEffort,
  type ApprovalMode,
  type TaskMessage,
  type AgentRoute
} from './settings'
import { bundledAgents } from './agents/bundled-agents'
import { listFiles, listDir, readProjectFile, getGitBranch, getGitDiff, gitAcceptFile, gitRevertFile, projectName } from './fs-utils'
import { writeFileSync } from 'fs'
import type { RunState } from '@openbuff/sdk'

if (process.platform === 'win32') {
  app.setAppUserModelId('com.openbuff.desktop')
}

function windowStateFile(): string {
  return join(app.getPath('userData'), 'window-state.json')
}

function loadWindowState(): { x?: number; y?: number; width: number; height: number; maximized?: boolean } {
  const fallback = { width: 1280, height: 820 }
  try {
    const raw = readFileSync(windowStateFile(), 'utf-8')
    const parsed = JSON.parse(raw) as { x?: number; y?: number; width?: number; height?: number; maximized?: boolean }
    if (typeof parsed.width !== 'number' || typeof parsed.height !== 'number') return fallback
    // Guard against the window being saved off-screen (e.g. monitor unplugged)
    const visible = screen.getAllDisplays().some((d) => {
      const b = d.workArea
      return typeof parsed.x === 'number' && typeof parsed.y === 'number' && parsed.x >= b.x - 100 && parsed.x < b.x + b.width && parsed.y >= b.y - 100 && parsed.y < b.y + b.height
    })
    return {
      x: visible ? parsed.x : undefined,
      y: visible ? parsed.y : undefined,
      width: parsed.width,
      height: parsed.height,
      maximized: parsed.maximized
    }
  } catch {
    return fallback
  }
}

function saveWindowState(win: BrowserWindow): void {
  try {
    const bounds = win.getNormalBounds()
    const state = {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      maximized: win.isMaximized()
    }
    writeFileSync(windowStateFile(), JSON.stringify(state))
  } catch {
    // ignore state save failures
  }
}

function getAppIconPath(): string | undefined {
  const isWin = process.platform === 'win32'
  const candidates = [
    ...(isWin
      ? [
          join(__dirname, '../../resources/icon.ico'),
          join(__dirname, '../../icon.ico'),
          join(app.getAppPath(), 'resources/icon.ico'),
          join(app.getAppPath(), 'icon.ico'),
          join(process.cwd(), 'resources/icon.ico'),
          join(process.cwd(), 'icon.ico')
        ]
      : []),
    join(__dirname, '../../resources/icon.png'),
    join(__dirname, '../../icon.png'),
    join(app.getAppPath(), 'resources/icon.png'),
    join(app.getAppPath(), 'icon.png'),
    join(process.cwd(), 'resources/icon.png'),
    join(process.cwd(), 'icon.png'),
    join(__dirname, '../renderer/icon.png')
  ]
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  return undefined
}

function createWindow(): void {
  const saved = loadWindowState()
  const iconPath = getAppIconPath()
  const win = new BrowserWindow({
    x: saved.x,
    y: saved.y,
    width: saved.width,
    height: saved.height,
    minWidth: 960,
    minHeight: 640,
    title: 'OpenBuff Desktop',
    icon: iconPath,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0b0d12' : '#f6f7f9',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  if (saved.maximized) win.maximize()
  win.on('resize', () => saveWindowState(win))
  win.on('move', () => saveWindowState(win))
  win.on('close', () => saveWindowState(win))

  attachWindow(win)

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/* ─── Skills ─────────────────────────────────────────── */

export interface SkillInfo {
  name: string
  description: string
  path: string
  source: 'project' | 'home'
}

const SKILL_ROOTS = ['.agents', '.claude'] as const

function scanSkillRoot(dir: string, source: 'project' | 'home'): SkillInfo[] {
  const out: SkillInfo[] = []
  for (const rootName of SKILL_ROOTS) {
    const skillsDir = join(dir, rootName, 'skills')
    if (!existsSync(skillsDir)) continue
    let entries: string[]
    try {
      entries = (readdirSync(skillsDir, { withFileTypes: true }) as { name: string; isDirectory(): boolean }[])
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
    } catch {
      continue
    }
    for (const name of entries) {
      const skillFile = join(skillsDir, name, 'SKILL.md')
      if (!existsSync(skillFile)) continue
      try {
        const content = readFileSync(skillFile, 'utf-8')
        const fm = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
        let description = ''
        if (fm) {
          const descMatch = fm[1].match(/^description:\s*(.+)$/m)
          description = descMatch ? descMatch[1].trim() : ''
        }
        out.push({ name, description, path: skillFile, source })
      } catch {
        // skip unreadable skill
      }
    }
  }
  return out
}

function listSkills(cwd: string): SkillInfo[] {
  const project = scanSkillRoot(cwd, 'project')
  const home = scanSkillRoot(homedir(), 'home')
  return [...project, ...home]
}

function registerIpc(): void {
  ipcMain.handle('openbuff:getState', () => {
    const settings = getAppSettings()
    return {
      cwd: settings.cwd,
      settings,
      running: isRunning(),
      agentIds: Object.keys(bundledAgents).sort()
    }
  })

  ipcMain.handle('openbuff:selectFolder', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select the project folder to edit',
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    saveCwd(result.filePaths[0])
    touchProject(result.filePaths[0])
    return result.filePaths[0]
  })

  ipcMain.handle('openbuff:selectFiles', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Attach files',
      properties: ['openFile', 'multiSelections']
    })
    if (result.canceled) return []
    return result.filePaths
  })

  ipcMain.on('openbuff:setTheme', (_e, theme: 'dark' | 'light') => {
    // The native title bar follows nativeTheme for dark/light mode
    nativeTheme.themeSource = theme
  })

  ipcMain.handle('openbuff:saveSettings', (_e, payload: {
    providers: ProviderConfig[]
    activeModel: string
    reasoningEffort: ReasoningEffort
    approvalMode: ApprovalMode
    apiKeys?: Record<string, string> // providerId -> key (empty = unchanged; empty string + deleteKey = delete)
    deleteKeys?: string[]
    agentRouting?: Record<string, AgentRoute>
  }) => {
    updateProviders(payload.providers, payload.activeModel, payload.reasoningEffort, payload.approvalMode)
    if (payload.apiKeys) {
      for (const [id, key] of Object.entries(payload.apiKeys)) {
        if (key) saveProviderApiKey(id, key.trim())
      }
    }
    for (const id of payload.deleteKeys ?? []) {
      saveProviderApiKey(id, '')
    }
    if (payload.agentRouting) updateAgentRouting(payload.agentRouting)
    return { ok: true, settings: getAppSettings() }
  })

  ipcMain.handle('openbuff:listSkills', (_e, cwd: string) => {
    return listSkills(cwd)
  })

  ipcMain.handle('openbuff:listLocalAgents', async (_e, cwd: string) => {
    if (!cwd) return getLastLocalAgents()
    try {
      return await loadProjectLocalAgents(cwd)
    } catch (err) {
      return { agents: [], validationErrors: [{ agentId: '', filePath: '', message: err instanceof Error ? err.message : String(err) }] }
    }
  })

  ipcMain.handle('openbuff:createLocalAgent', (_e, payload: CreateLocalAgentInput) => {
    return createLocalAgent(payload)
  })

  ipcMain.handle('openbuff:readSkillFile', (_e, path: string) => {
    try {
      const stat = statSync(path)
      if (!stat.isFile() || stat.size > 200 * 1024) return { ok: false, error: 'Not a file or larger than 200KB' }
      return { ok: true, content: readFileSync(path, 'utf-8') }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('openbuff:listProjects', () => {
    return listProjects()
  })

  ipcMain.handle('openbuff:saveTask', (_e, payload: { cwd: string; prompt: string }) => {
    if (!payload.cwd || !payload.prompt.trim()) return { ok: false, error: 'Missing cwd or prompt' }
    return { ok: true, task: saveProjectTask(payload.cwd, payload.prompt.trim()) }
  })

  ipcMain.handle('openbuff:deleteTask', (_e, taskId: string) => {
    if (!taskId) return { ok: false, error: 'Missing taskId' }
    deleteTask(taskId)
    return { ok: true }
  })

  ipcMain.handle('openbuff:saveTaskTranscript', (_e, payload: { taskId: string; messages: TaskMessage[] }) => {
    if (!payload.taskId) return { ok: false, error: 'Missing taskId' }
    return { ok: saveTaskTranscript(payload.taskId, payload.messages ?? []) }
  })

  ipcMain.handle('openbuff:loadTaskTranscript', (_e, taskId: string) => {
    if (!taskId) return { ok: false, error: 'Missing taskId' }
    const messages = loadTaskTranscript(taskId)
    return messages ? { ok: true, messages } : { ok: false, error: 'No transcript for this task' }
  })

  ipcMain.handle('openbuff:saveTaskRunState', (_e, payload: { taskId: string; runState: unknown }) => {
    if (!payload.taskId) return { ok: false, error: 'Missing taskId' }
    return { ok: saveTaskRunState(payload.taskId, payload.runState) }
  })

  ipcMain.handle('openbuff:loadTaskRunState', (_e, taskId: string) => {
    if (!taskId) return { ok: false, error: 'Missing taskId' }
    const runState = loadTaskRunState(taskId)
    return runState ? { ok: true, runState } : { ok: false, error: 'No run state for this task' }
  })

  ipcMain.handle('openbuff:searchHistory', async (_e, query: string) => {
    return await searchHistory(query)
  })

  ipcMain.handle('openbuff:runPrompt', async (_e, payload: {
    cwd: string
    prompt: string
    previousRun?: RunState | null
    resume?: boolean
    taskId?: string
  }) => {
    if (!payload.cwd || !payload.prompt.trim()) return { ok: false, error: 'Missing project folder or prompt' }
    if (isRunning()) return { ok: false, error: 'Another task is already running' }

    // Load provider settings in the main process before each run
    applySettingsToEnv()

    const result = await new Promise<{ runState: RunState | null; error: string | null }>((resolve) => {
      void runPrompt(payload.cwd, payload.prompt, payload.previousRun ?? undefined, (runState, error) => {
        resolve({ runState, error })
      }, { resume: payload.resume === true, taskId: payload.taskId })
    })

    if (result.error) return { ok: false, error: result.error }
    // An error-typed output means the run was interrupted (user stop or API failure)
    // but its state was preserved — the UI can offer to resume from it.
    const interrupted = result.runState?.output?.type === 'error'
    return { ok: true, runState: result.runState, interrupted }
  })

  ipcMain.handle('openbuff:abort', () => {
    abortRun()
    return { ok: true }
  })

  ipcMain.handle('openbuff:approvalResponse', (_e, approved: boolean) => {
    respondApproval(approved)
    return { ok: true }
  })

  ipcMain.handle('openbuff:listFiles', (_e, root: string) => {
    return listFiles(root)
  })

  ipcMain.handle('openbuff:listDir', (_e, dir: string) => {
    return listDir(dir)
  })

  ipcMain.handle('openbuff:gitAccept', async (_e, payload: { cwd: string; file: string }) => {
    return gitAcceptFile(payload.cwd, payload.file)
  })

  ipcMain.handle('openbuff:gitRevert', async (_e, payload: { cwd: string; file: string }) => {
    return gitRevertFile(payload.cwd, payload.file)
  })

  ipcMain.handle('openbuff:readFile', (_e, path: string) => {
    return readProjectFile(path)
  })

  ipcMain.handle('openbuff:pathInfo', (_e, path: string) => {
    try {
      const stat = statSync(path)
      return { ok: true, isDir: stat.isDirectory(), name: basename(path) }
    } catch {
      return { ok: false, error: 'Path does not exist' }
    }
  })

  ipcMain.handle('openbuff:gitBranch', (_e, cwd: string) => {
    return getGitBranch(cwd)
  })

  ipcMain.handle('openbuff:gitDiff', (_e, cwd: string) => {
    return getGitDiff(cwd)
  })

  ipcMain.handle('openbuff:projectName', (_e, cwd: string) => {
    return projectName(cwd)
  })

  ipcMain.handle('openbuff:fetchModels', async (_e, payload: { baseURL: string; apiKey: string; providerType: string }) => {
    try {
      const base = payload.baseURL.replace(/\/+$/, '')
      // Ollama-compatible endpoint (/api/tags)
      if (/ollama|:11434/i.test(base)) {
        const res = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(15000) })
        if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
        const data = (await res.json()) as { models?: { name?: string }[] }
        const models = (data.models ?? []).map((m) => m.name ?? '').filter(Boolean).sort()
        if (models.length === 0) return { ok: false, error: 'No model data in response' }
        return { ok: true, models }
      }
      // OpenAI-compatible /models
      const res = await fetch(`${base}/models`, {
        headers: payload.apiKey ? { Authorization: `Bearer ${payload.apiKey}` } : {},
        signal: AbortSignal.timeout(15000)
      })
      if (!res.ok) return { ok: false, error: `HTTP ${res.status} ${res.statusText}` }
      const data = (await res.json()) as { data?: { id?: string }[] }
      const models = (data.data ?? []).map((m) => m.id ?? '').filter(Boolean).sort()
      if (models.length === 0) return { ok: false, error: 'No model data in response' }
      return { ok: true, models }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  })
}

app.whenReady().then(() => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.openbuff.desktop')
  }
  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
