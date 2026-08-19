import { useState } from 'react'
import { FolderIcon, FolderOpenIcon, FolderPlusIcon, NotePenIcon, SearchIcon, SettingsIcon } from './Icons'

export interface SearchResult {
  index: number
  kind: string
  text: string
  key?: string
  taskId?: string
  taskPrompt?: string
  projectPath?: string
  projectName?: string
}

export interface TaskRecord {
  id: string
  prompt: string
  createdAt: number
  messages?: unknown[]
}

export interface ProjectRecord {
  path: string
  name: string
  tasks: TaskRecord[]
}

interface SidebarProps {
  open: boolean
  // nav
  onNewTask: () => void
  searchOpen: boolean
  onToggleSearch: () => void
  searchQuery: string
  onSearchQuery: (q: string) => void
  searchResults: SearchResult[]
  onSearchJump: (r: SearchResult) => void
  projects: ProjectRecord[]
  onNewProject: () => void
  onOpenProject: (path: string) => void
  onOpenTask: (project: ProjectRecord, task: TaskRecord) => void
  onSettings: () => void
  currentProjectPath: string | null
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'now'
  if (min < 60) return `${min}m`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d`
  return new Date(ts).toLocaleDateString()
}

export default function Sidebar(props: SidebarProps) {
  const [expandedProject, setExpandedProject] = useState<string | null>(null)

  return (
    <aside className={`sidebar ${props.open ? 'open' : 'closed'}`}>
      <div className="sidebar-top">
        <button className="nav-item" onClick={props.onNewTask} title="New task">
          <NotePenIcon size={15} />
          <span>New Task</span>
        </button>

        <button className={`nav-item ${props.searchOpen ? 'active' : ''}`} onClick={props.onToggleSearch} title="Search messages & files">
          <SearchIcon size={15} />
          <span>Search</span>
        </button>

        {props.searchOpen && (
          <div className="search-box">
            <input
              autoFocus
              value={props.searchQuery}
              onChange={(e) => props.onSearchQuery(e.target.value)}
              placeholder="Search…"
              spellCheck={false}
            />
            {props.searchQuery && (
              <div className="search-results">
                {props.searchResults.length === 0 && <div className="panel-empty">No results found.</div>}
                {props.searchResults.slice(0, 60).map((r, i) => (
                  <button
                    key={r.key ?? `${r.taskId ?? 'current'}-${r.index}-${i}`}
                    className="search-result"
                    onClick={() => props.onSearchJump(r)}
                    title={r.taskPrompt ? `${r.projectName ? `${r.projectName} • ` : ''}${r.taskPrompt}` : undefined}
                  >
                    <div className="search-result-row">
                      <span className="search-kind">{r.kind}</span>
                      <span className="search-text">{r.text}</span>
                    </div>
                    {r.taskPrompt && (
                      <div className="search-sub">
                        <span className="search-task-prompt">
                          {r.projectName ? `${r.projectName} / ` : ''}
                          {r.taskPrompt}
                        </span>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="nav-section-head">
          <span>Projects</span>
          <button className="mini-plus" onClick={props.onNewProject} title="Add Project">
            <FolderPlusIcon size={15} />
          </button>
        </div>
      </div>

      <div className="projects-list">
        {props.projects.length === 0 && <div className="nav-muted">No projects yet. Open a folder to start.</div>}
        {props.projects.slice(0, 12).map((p) => {
          const isOpen = expandedProject === p.path
          const isCurrent = p.path === props.currentProjectPath
          return (
            <div key={p.path} className={`project-item ${isCurrent ? 'current' : ''}`}>
              <div
                className="project-row"
                onClick={() => {
                  if (isOpen) setExpandedProject(null)
                  else {
                    setExpandedProject(p.path)
                    props.onOpenProject(p.path)
                  }
                }}
                title={p.path}
              >
                {isOpen ? <FolderOpenIcon size={15} /> : <FolderIcon size={15} />}
                <span className="project-name-text">{p.name}</span>
              </div>
              {isOpen && (
                <div className="task-list">
                  {p.tasks.length === 0 && <div className="nav-muted small">No tasks</div>}
                  {p.tasks.slice(0, 20).map((t) => (
                    <button key={t.id} className="task-row" onClick={() => props.onOpenTask(p, t)} title={t.prompt}>
                      <span className="task-text">{t.prompt}</span>
                      <span className="task-time">{timeAgo(t.createdAt)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="sidebar-bottom">
        <button className="nav-item" onClick={props.onSettings}>
          <SettingsIcon size={15} />
          <span>Settings</span>
        </button>
      </div>
    </aside>
  )
}
