import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUpIcon, ChevronDownIcon, GaugeIcon, LightbulbIcon, PaperclipIcon, SparklesIcon, StopIcon, XIcon } from './Icons'

export interface Attachment {
  path: string
  name: string
  isDir: boolean
  /** true = path relative to cwd (@ reference); false = absolute path (file picker) */
  isRelative: boolean
}

export interface SkillInfo {
  name: string
  description: string
  path: string
  source: 'project' | 'home'
}

interface ProviderOption {
  id: string
  label: string
  models: string[]
}

interface ComposerProps {
  prompt: string
  onChange: (v: string) => void
  onSend: () => void
  onStop: () => void
  onNewTask: () => void
  onInitRequest: () => void
  onSearchRequest: () => void
  running: boolean
  disabled: boolean
  attachments: Attachment[]
  onAttachFiles: () => void
  onAttachFilesPath: (relPath: string) => void
  onRemoveAttachment: (path: string) => void
  providers: ProviderOption[]
  activeModel: string
  onModelChange: (model: string) => void
  reasoningEffort: string
  onReasoningChange: (effort: string) => void
  tokenUsage: { used: number; max: number } | null
  totalCost: number
  fileCandidates: string[]
  skills: SkillInfo[]
  /** Increment to programmatically focus the textarea (e.g. after Revert restores a message). */
  focusSignal?: number
}

const REASONING_OPTIONS = ['default', 'high', 'medium', 'low', 'minimal', 'none']

const SLASH_COMMANDS: { id: string; label: string; description: string }[] = [
  { id: 'new-task', label: 'new-task', description: 'Start a new task' },
  { id: 'init', label: 'init', description: 'Create a custom agent visually' },
  { id: 'search', label: 'search', description: 'Search messages and files' }
]

type Mention =
  | { kind: 'file'; query: string }
  | { kind: 'skill'; query: string }
  | null

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

export default function Composer(props: ComposerProps) {
  const {
    prompt,
    onChange,
    onSend,
    onStop,
    onNewTask,
    onInitRequest,
    onSearchRequest,
    running,
    disabled,
    attachments,
    onAttachFiles,
    onRemoveAttachment,
    providers,
    activeModel,
    onModelChange,
    reasoningEffort,
    onReasoningChange,
    tokenUsage,
    totalCost,
    fileCandidates,
    skills,
    focusSignal
  } = props

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const menuItemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [mention, setMention] = useState<Mention>(null)
  const [mentionIndex, setMentionIndex] = useState(0)

  // Focus the input when asked (e.g. after Revert restores the message for editing)
  useEffect(() => {
    if (!focusSignal) return
    const el = textareaRef.current
    if (!el) return
    el.focus()
    const len = el.value.length
    el.setSelectionRange(len, len)
  }, [focusSignal])

  // Keep the highlighted item in view when navigating with arrow keys
  useEffect(() => {
    menuItemRefs.current[mentionIndex]?.scrollIntoView({ block: 'nearest' })
  }, [mentionIndex, mention?.kind])

  // Auto-grow with text lines (max 184px, then scroll internally)
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 184)}px`
  }, [prompt])

  // Detect the @file or /skill token being typed before the caret
  const detectMention = (value: string, caret: number): Mention => {
    const before = value.slice(0, caret)
    const wordMatch = before.match(/(@[\w./\\-]*|\/[\w:./\\-]*)$/)
    if (!wordMatch) return null
    const token = wordMatch[1]
    if (token.startsWith('@')) {
      return { kind: 'file', query: token.slice(1).toLowerCase() }
    }
    if (token.startsWith('/') && (caret === token.length || before[caret - token.length - 1] === '\n' || /\s$/.test(before.slice(0, caret - token.length) || ' '))) {
      return { kind: 'skill', query: token.slice(1).toLowerCase() }
    }
    return null
  }

  const update = (value: string, caret: number) => {
    onChange(value)
    const next = detectMention(value, caret)
    setMention(next)
    setMentionIndex(0)
  }

  // Replace the token before the caret
  const replaceToken = (replacement: string) => {
    const el = textareaRef.current
    if (!el) return
    const caret = el.selectionStart
    const before = el.value.slice(0, caret)
    const after = el.value.slice(caret)
    const tokenMatch = before.match(/(@[\w./\\-]*|\/[\w:./\\-]*)$/)
    if (!tokenMatch) return
    const start = caret - tokenMatch[1].length
    const value = before.slice(0, start) + replacement + after
    onChange(value)
    setMention(null)
    // Restore focus after updating the caret
    requestAnimationFrame(() => {
      el.focus()
      const pos = start + replacement.length
      el.setSelectionRange(pos, pos)
    })
  }

  const filteredFiles = mention?.kind === 'file' ? fileCandidates.filter((f) => f.toLowerCase().includes(mention.query)) : []
  const filteredSkills =
    mention?.kind === 'skill'
      ? [...skills.filter((s) => s.name.toLowerCase().includes(mention.query)), ...SLASH_COMMANDS.filter((c) => c.id.includes(mention.query))]
      : []
  const fileItems = filteredFiles.slice(0, 50)
  const skillItems = filteredSkills.slice(0, 50)
  const mentionList = mention?.kind === 'file' ? fileItems : skillItems

  const selectFile = (relPath: string) => {
    replaceToken(`@${relPath} `)
    // Also add as an attachment (content read on send)
    if (!attachments.some((a) => a.path === relPath)) {
      props.onAttachFilesPath(relPath)
    }
  }

  const selectSkill = (skill: SkillInfo | { id: string }) => {
    if ('id' in skill && !('path' in skill)) {
      // Built-in command
      replaceToken('')
      if (skill.id === 'new-task') onNewTask()
      else if (skill.id === 'init') onInitRequest()
      else if (skill.id === 'search') onSearchRequest()
      return
    }
    replaceToken(`/skill:${(skill as SkillInfo).name} `)
  }

  const usagePct = tokenUsage && tokenUsage.max > 0 ? Math.min(100, (tokenUsage.used / tokenUsage.max) * 100) : 0
  const usageBarClass = usagePct >= 90 ? 'tok-danger' : usagePct >= 70 ? 'tok-warn' : ''

  const modelLabel = useMemo(() => {
    const [pid, ...rest] = activeModel.split('/')
    const provider = providers.find((p) => p.id === pid)
    return provider ? `${provider.label} · ${rest.join('/') || pid}` : activeModel || 'Select model'
  }, [activeModel, providers])

  return (
    <div className="composer-wrap">
      {attachments.length > 0 && (
        <div className="attachment-strip">
          {attachments.map((att) => (
            <span key={att.path} className="attachment-chip">
              {att.isDir ? '📁' : '📄'} {att.name}
              <button className="chip-x" onClick={() => onRemoveAttachment(att.path)} title="Remove">
                <XIcon size={10} />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="composer">
        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={(e) => update(e.target.value, e.target.selectionStart)}
          onKeyDown={(e) => {
            // Guard against IME composition on Windows/CJK keyboards:
            // do not submit or trigger actions while user is selecting/confirming IME candidates
            if (e.nativeEvent.isComposing || e.keyCode === 229) return

            if (mention) {
              const list = mentionList
              if (list.length > 0) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setMentionIndex((i) => (i + 1) % list.length)
                  return
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setMentionIndex((i) => (i - 1 + list.length) % list.length)
                  return
                }
                if (e.key === 'Enter') {
                  e.preventDefault()
                  const item = list[mentionIndex]
                  if (mention.kind === 'file') selectFile(item as string)
                  else selectSkill(item as SkillInfo | { id: string })
                  return
                }
                if (e.key === 'Escape') {
                  e.preventDefault()
                  setMention(null)
                  return
                }
              }
            }
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              if (!running) onSend()
            }
          }}
          onClick={() => setMention(detectMention(prompt, textareaRef.current?.selectionStart ?? prompt.length))}
          placeholder="Type a message -/ for skills, @ for files"
          rows={1}
          disabled={running || disabled}
        />

        {mention && (
          <div className="mention-menu">
            {mention.kind === 'file' &&
              (fileItems.length === 0 ? (
                <div className="mention-empty">No matching files</div>
              ) : (
                fileItems.map((f, i) => (
                  <button
                    key={f}
                    ref={(el) => {
                      menuItemRefs.current[i] = el
                    }}
                    className={`mention-item ${i === mentionIndex ? 'selected' : ''}`}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      selectFile(f)
                    }}
                    onMouseEnter={() => setMentionIndex(i)}
                  >
                    <span className="mention-icon">📄</span>
                    <span className="mention-text">{f}</span>
                  </button>
                ))
              ))}

            {mention.kind === 'skill' &&
              (skillItems.length === 0 ? (
                <div className="mention-empty">No matching skills</div>
              ) : (
                skillItems.map((item, i) => (
                  <button
                    key={'path' in item ? `${item.path}::${item.name}` : item.id}
                    ref={(el) => {
                      menuItemRefs.current[i] = el
                    }}
                    className={`mention-item ${i === mentionIndex ? 'selected' : ''}`}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      selectSkill(item as SkillInfo | { id: string })
                    }}
                    onMouseEnter={() => setMentionIndex(i)}
                  >
                    <span className="mention-icon">{'path' in item ? '⚡' : '⌘'}</span>
                    <span className="mention-text">
                      {'path' in item ? item.name : (item as { id: string; label: string }).label}
                    </span>
                    {'description' in item && item.description && (
                      <span className="mention-desc">{item.description}</span>
                    )}
                  </button>
                ))
              ))}
          </div>
        )}

        {running ? (
          <button className="btn danger send-btn stop-btn" onClick={onStop} title="Stop">
            <StopIcon size={14} />
          </button>
        ) : (
          <button className="btn primary send-btn" onClick={onSend} disabled={disabled || !prompt.trim()} title="Send (Enter)">
            <ArrowUpIcon size={16} />
          </button>
        )}
      </div>

      <div className="composer-toolbar">
        <div className="toolbar-left">
          <button className="toolbar-btn" onClick={onAttachFiles} disabled={running} title="Attach files">
            <PaperclipIcon size={13} /> Attach
          </button>

          <div className="selector">
            <SparklesIcon size={13} />
            <select value={activeModel} onChange={(e) => onModelChange(e.target.value)} disabled={running} title="Model">
              {providers.map((p) =>
                p.models.map((m) => (
                  <option key={`${p.id}/${m}`} value={`${p.id}/${m}`}>
                    {p.label} / {m}
                  </option>
                ))
              )}
              {providers.length === 0 && <option value="">No provider configured</option>}
            </select>
            <ChevronDownIcon size={11} />
          </div>

          <div className="selector">
            <LightbulbIcon size={13} />
            <select value={reasoningEffort} onChange={(e) => onReasoningChange(e.target.value)} disabled={running} title="Reasoning level">
              {REASONING_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {r === 'default' ? 'Reasoning: auto' : `Reasoning: ${r}`}
                </option>
              ))}
            </select>
            <ChevronDownIcon size={11} />
          </div>
        </div>

        <div className="toolbar-right">
          {totalCost > 0 && <span className="cost-badge" title="Total cost">${totalCost.toFixed(4)}</span>}
          {tokenUsage && tokenUsage.max > 0 && (
            <div className="token-bar" title={`Context: ${formatTokens(tokenUsage.used)} / ${formatTokens(tokenUsage.max)} tokens`}>
              <GaugeIcon size={12} />
              <div className="token-track">
                <div className={`token-fill ${usageBarClass}${running ? ' pulsing' : ''}`} style={{ width: `${usagePct}%` }} />
              </div>
              <span className="token-text">
                {formatTokens(tokenUsage.used)}/{formatTokens(tokenUsage.max)}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="composer-hint">Enter to send · Shift+Enter for newline · / for skills · @ for files</div>
    </div>
  )
}
