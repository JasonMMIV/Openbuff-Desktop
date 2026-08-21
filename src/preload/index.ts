import { contextBridge, ipcRenderer, webFrame } from 'electron'
import type { IpcRendererEvent } from 'electron'
import type { QueryIndexData, QueryIndexQuery } from '../shared/codebase-index'

export interface TodoItem {
  task: string
  completed: boolean
}

export interface FileChange {
  path: string
  action: 'create' | 'modify' | 'delete'
}

export interface UiEvent {
  type: string
  text?: string
  toolName?: string
  status?: string
  agentType?: string
  model?: string
  message?: string
  files?: string[]
  changedFiles?: FileChange[]
  used?: number
  max?: number
  totalCost?: number
  queryInput?: QueryIndexQuery
  queryIndex?: QueryIndexData
  todos?: TodoItem[]
  raw?: unknown
}

const api = {
  /* Window controls (frameless title bar) */
  windowMinimize: () => ipcRenderer.send('openbuff:windowMinimize'),
  windowMaximize: () => ipcRenderer.send('openbuff:windowMaximize'),
  windowClose: () => ipcRenderer.send('openbuff:windowClose'),
  windowIsMaximized: () => ipcRenderer.invoke('openbuff:windowIsMaximized'),
  windowReload: () => ipcRenderer.send('openbuff:windowReload'),
  windowForceReload: () => ipcRenderer.send('openbuff:windowForceReload'),
  windowToggleFullScreen: () => ipcRenderer.send('openbuff:windowToggleFullScreen'),
  onWindowMaximizeChange: (callback: (maximized: boolean) => void) => {
    const listener = (_e: IpcRendererEvent, maximized: boolean) => callback(maximized)
    ipcRenderer.on('openbuff:windowMaximizeChange', listener)
    return () => { ipcRenderer.removeListener('openbuff:windowMaximizeChange', listener) }
  },

  getState: () => ipcRenderer.invoke('openbuff:getState'),
  selectFolder: () => ipcRenderer.invoke('openbuff:selectFolder'),
  selectFiles: () => ipcRenderer.invoke('openbuff:selectFiles'),
  saveSettings: (payload: unknown) => ipcRenderer.invoke('openbuff:saveSettings', payload),
  listSkills: (cwd: string) => ipcRenderer.invoke('openbuff:listSkills', cwd),
  listLocalAgents: (cwd: string) => ipcRenderer.invoke('openbuff:listLocalAgents', cwd),
  createLocalAgent: (payload: unknown) => ipcRenderer.invoke('openbuff:createLocalAgent', payload),
  deleteLocalAgent: (payload: { cwd: string; filePath?: string; id?: string }) =>
    ipcRenderer.invoke('openbuff:deleteLocalAgent', payload),
  readLocalAgentFile: (payload: { filePath: string }) =>
    ipcRenderer.invoke('openbuff:readLocalAgentFile', payload),
  saveLocalAgentFile: (payload: { filePath: string; content: string }) =>
    ipcRenderer.invoke('openbuff:saveLocalAgentFile', payload),
  readSkillFile: (path: string) => ipcRenderer.invoke('openbuff:readSkillFile', path),
  listProjects: () => ipcRenderer.invoke('openbuff:listProjects'),
  saveTask: (payload: { cwd: string; prompt: string }) => ipcRenderer.invoke('openbuff:saveTask', payload),
  deleteTask: (taskId: string) => ipcRenderer.invoke('openbuff:deleteTask', taskId),
  renameTask: (payload: { taskId: string; newPrompt: string }) =>
    ipcRenderer.invoke('openbuff:renameTask', payload),
  removeProject: (projectPath: string) => ipcRenderer.invoke('openbuff:removeProject', projectPath),
  saveTaskTranscript: (payload: { taskId: string; messages: unknown[] }) =>
    ipcRenderer.invoke('openbuff:saveTaskTranscript', payload),
  loadTaskTranscript: (taskId: string) => ipcRenderer.invoke('openbuff:loadTaskTranscript', taskId),
  saveTaskRunState: (payload: { taskId: string; runState: unknown }) =>
    ipcRenderer.invoke('openbuff:saveTaskRunState', payload),
  loadTaskRunState: (taskId: string) => ipcRenderer.invoke('openbuff:loadTaskRunState', taskId),
  searchHistory: (query: string) => ipcRenderer.invoke('openbuff:searchHistory', query),
  runPrompt: (payload: unknown) => ipcRenderer.invoke('openbuff:runPrompt', payload),
  abort: () => ipcRenderer.invoke('openbuff:abort'),
  respondApproval: (approved: boolean) => ipcRenderer.invoke('openbuff:approvalResponse', approved),
  listFiles: (root: string) => ipcRenderer.invoke('openbuff:listFiles', root),
  listDir: (dir: string) => ipcRenderer.invoke('openbuff:listDir', dir),
  readFile: (path: string) => ipcRenderer.invoke('openbuff:readFile', path),
  gitAccept: (payload: { cwd: string; file: string }) => ipcRenderer.invoke('openbuff:gitAccept', payload),
  gitRevert: (payload: { cwd: string; file: string }) => ipcRenderer.invoke('openbuff:gitRevert', payload),
  pathInfo: (path: string) => ipcRenderer.invoke('openbuff:pathInfo', path),
  gitBranch: (cwd: string) => ipcRenderer.invoke('openbuff:gitBranch', cwd),
  gitDiff: (cwd: string) => ipcRenderer.invoke('openbuff:gitDiff', cwd),
  projectName: (cwd: string) => ipcRenderer.invoke('openbuff:projectName', cwd),
  fetchModels: (payload: { baseURL: string; apiKey: string; providerType: string }) =>
    ipcRenderer.invoke('openbuff:fetchModels', payload),
  setTheme: (theme: 'dark' | 'light') => ipcRenderer.send('openbuff:setTheme', theme),
  getZoomFactor: () => webFrame.getZoomFactor(),
  setZoomFactor: (factor: number) => webFrame.setZoomFactor(factor),
  onEvent: (callback: (event: UiEvent) => void) => {
    const listener = (_e: IpcRendererEvent, event: UiEvent) => callback(event)
    ipcRenderer.on('openbuff:event', listener)
    return () => {
      ipcRenderer.removeListener('openbuff:event', listener)
    }
  }
}

contextBridge.exposeInMainWorld('openbuff', api)

export type OpenbuffApi = typeof api
