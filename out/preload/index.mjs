import { contextBridge, ipcRenderer, webFrame } from "electron";
const api = {
  getState: () => ipcRenderer.invoke("openbuff:getState"),
  selectFolder: () => ipcRenderer.invoke("openbuff:selectFolder"),
  selectFiles: () => ipcRenderer.invoke("openbuff:selectFiles"),
  saveSettings: (payload) => ipcRenderer.invoke("openbuff:saveSettings", payload),
  listSkills: (cwd) => ipcRenderer.invoke("openbuff:listSkills", cwd),
  listLocalAgents: (cwd) => ipcRenderer.invoke("openbuff:listLocalAgents", cwd),
  createLocalAgent: (payload) => ipcRenderer.invoke("openbuff:createLocalAgent", payload),
  readSkillFile: (path) => ipcRenderer.invoke("openbuff:readSkillFile", path),
  listProjects: () => ipcRenderer.invoke("openbuff:listProjects"),
  saveTask: (payload) => ipcRenderer.invoke("openbuff:saveTask", payload),
  deleteTask: (taskId) => ipcRenderer.invoke("openbuff:deleteTask", taskId),
  renameTask: (payload) => ipcRenderer.invoke("openbuff:renameTask", payload),
  removeProject: (projectPath) => ipcRenderer.invoke("openbuff:removeProject", projectPath),
  saveTaskTranscript: (payload) => ipcRenderer.invoke("openbuff:saveTaskTranscript", payload),
  loadTaskTranscript: (taskId) => ipcRenderer.invoke("openbuff:loadTaskTranscript", taskId),
  saveTaskRunState: (payload) => ipcRenderer.invoke("openbuff:saveTaskRunState", payload),
  loadTaskRunState: (taskId) => ipcRenderer.invoke("openbuff:loadTaskRunState", taskId),
  searchHistory: (query) => ipcRenderer.invoke("openbuff:searchHistory", query),
  runPrompt: (payload) => ipcRenderer.invoke("openbuff:runPrompt", payload),
  abort: () => ipcRenderer.invoke("openbuff:abort"),
  respondApproval: (approved) => ipcRenderer.invoke("openbuff:approvalResponse", approved),
  listFiles: (root) => ipcRenderer.invoke("openbuff:listFiles", root),
  listDir: (dir) => ipcRenderer.invoke("openbuff:listDir", dir),
  readFile: (path) => ipcRenderer.invoke("openbuff:readFile", path),
  gitAccept: (payload) => ipcRenderer.invoke("openbuff:gitAccept", payload),
  gitRevert: (payload) => ipcRenderer.invoke("openbuff:gitRevert", payload),
  pathInfo: (path) => ipcRenderer.invoke("openbuff:pathInfo", path),
  gitBranch: (cwd) => ipcRenderer.invoke("openbuff:gitBranch", cwd),
  gitDiff: (cwd) => ipcRenderer.invoke("openbuff:gitDiff", cwd),
  projectName: (cwd) => ipcRenderer.invoke("openbuff:projectName", cwd),
  fetchModels: (payload) => ipcRenderer.invoke("openbuff:fetchModels", payload),
  setTheme: (theme) => ipcRenderer.send("openbuff:setTheme", theme),
  getZoomFactor: () => webFrame.getZoomFactor(),
  setZoomFactor: (factor) => webFrame.setZoomFactor(factor),
  onEvent: (callback) => {
    const listener = (_e, event) => callback(event);
    ipcRenderer.on("openbuff:event", listener);
    return () => {
      ipcRenderer.removeListener("openbuff:event", listener);
    };
  }
};
contextBridge.exposeInMainWorld("openbuff", api);
