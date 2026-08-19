import { useState } from 'react'
import { renderMarkdown } from '../utils/markdown'
import { ChevronIcon, CopyIcon, UndoIcon } from './Icons'

export interface ToolItem {
  toolName: string
  status: 'running' | 'done' | 'error'
  agentType?: string
  detail?: string
}

function toolLabel(name: string): string {
  return name.replace(/_/g, ' ')
}

function copyText(text: string): void {
  void navigator.clipboard?.writeText(text).catch(() => {})
}

/** Render markdown; code blocks carry a copy button (part of the HTML, delegated click). */
export function Markdown({ text }: { text: string }) {
  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = (e.target as HTMLElement).closest('.code-copy')
    if (!target) return
    const pre = (target as HTMLElement).closest('pre')
    if (pre) {
      const clone = pre.cloneNode(true) as HTMLElement
      clone.querySelector('.code-copy')?.remove()
      copyText(clone.textContent ?? '')
      target.classList.add('copied')
      setTimeout(() => target.classList.remove('copied'), 1200)
    }
  }

  return (
    <div
      className="markdown"
      onClick={handleClick}
      dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }}
    />
  )
}

interface WebResult {
  title: string
  url?: string
  snippet?: string
}

/** Try to extract search results from a tool output string (web_search / researcher tools). */
function parseWebResults(detail: string): WebResult[] | null {
  const candidates: unknown[] = []
  try {
    const parsed = JSON.parse(detail)
    if (Array.isArray(parsed)) candidates.push(...parsed)
    else if (parsed && typeof parsed === 'object') {
      const arr = (parsed as Record<string, unknown>).results ?? (parsed as Record<string, unknown>).items
      if (Array.isArray(arr)) candidates.push(...arr)
      else candidates.push(parsed)
    }
  } catch {
    // Not JSON — maybe raw text with lines
    return null
  }
  const results = candidates
    .filter((c): c is Record<string, unknown> => c !== null && typeof c === 'object')
    .map((c) => ({
      title: String(c.title ?? c.name ?? ''),
      url: String(c.url ?? c.link ?? c.href ?? ''),
      snippet: String(c.snippet ?? c.description ?? c.text ?? '')
    }))
    .filter((r) => r.title || r.url)
  return results.length > 0 ? results.slice(0, 8) : null
}

function isSearchTool(name: string): boolean {
  const n = name.toLowerCase()
  return n.includes('web_search') || n.includes('search')
}

export function ToolCard({ tool, isLast }: { tool: ToolItem; isLast: boolean }) {
  const running = tool.status === 'running' && isLast
  // Collapsed by default; click the header to expand the output
  const [open, setOpen] = useState(false)

  const hasDetail = Boolean(tool.detail?.trim())
  const webResults = hasDetail && isSearchTool(tool.toolName) ? parseWebResults(tool.detail ?? '') : null

  return (
    <div className={`tool-card ${tool.status}${running ? ' running' : ''}`}>
      <div className="tool-card-head" onClick={() => setOpen((o) => !o)}>
        <span className="tool-spinner">{running ? '⟳' : tool.status === 'done' ? '✓' : '✕'}</span>
        <span className="tool-name">{toolLabel(tool.toolName)}</span>
        {tool.agentType && <span className="tool-agent">{tool.agentType}</span>}
        <span className="tool-status-text">{tool.status === 'running' ? 'Running…' : tool.status === 'done' ? 'Done' : 'Failed'}</span>
        <span className="tool-chevron">
          <ChevronIcon open={open} size={11} />
        </span>
      </div>
      {open && hasDetail && (
        <div className="tool-detail-wrap">
          {webResults ? (
            <div className="web-results">
              {webResults.map((r, i) => (
                <a
                  key={i}
                  className="web-result"
                  href={r.url || undefined}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="web-title">{r.title || r.url}</span>
                  {r.snippet && <span className="web-snippet">{r.snippet.slice(0, 220)}</span>}
                  {r.url && <span className="web-url">{r.url}</span>}
                </a>
              ))}
            </div>
          ) : (
            <pre className="tool-detail">{tool.detail}</pre>
          )}
        </div>
      )}
    </div>
  )
}

export function UserBubble({ text, onCopy, onRevert }: { text: string; onCopy?: () => void; onRevert?: () => void }) {
  return (
    <div className="msg-row user">
      <div className="msg-stack user">
        <div className="user-bubble">
          <span className="user-text">{text}</span>
        </div>
        {(onCopy || onRevert) && (
          <span className="msg-actions" onClick={(e) => e.stopPropagation()}>
            {onCopy && (
              <button className="mini-btn" title="Copy" onClick={onCopy}>
                <CopyIcon size={12} />
              </button>
            )}
            {onRevert && (
              <button className="mini-btn danger" title="Revert file changes and restore this message for editing" onClick={onRevert}>
                <UndoIcon size={12} />
              </button>
            )}
          </span>
        )}
      </div>
    </div>
  )
}

export function AssistantBubble({ text, streaming, onCopy }: { text: string; streaming: boolean; onCopy?: () => void }) {
  if (!text.trim() && streaming) {
    return (
      <div className="msg-row assistant">
        <div className="thinking-dots">
          <span />
          <span />
          <span />
        </div>
      </div>
    )
  }
  return (
    <div className="msg-row assistant">
      <div className="msg-stack assistant">
        <div className="assistant-bubble">
          <Markdown text={text} />
          {streaming && <span className="caret" />}
        </div>
        {onCopy && text.trim() && (
          <span className="msg-actions">
            <button className="mini-btn" title="Copy" onClick={onCopy}>
              <CopyIcon size={12} />
            </button>
          </span>
        )}
      </div>
    </div>
  )
}
