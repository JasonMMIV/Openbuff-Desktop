import { useEffect, useMemo, useState } from 'react'
import { ChevronLeftIcon, ChevronRightIcon, RobotIcon, XIcon } from './Icons'

type Scope = 'project' | 'home'
type TemplateId = 'blank' | 'reviewer' | 'docs' | 'tests'

interface AgentDraft {
  id: string
  displayName: string
  spawnerPrompt: string
  systemPrompt: string
  instructionsPrompt: string
  toolNames: string[]
}

interface Props {
  cwd: string
  onClose: () => void
  onCreated: (agent: { id: string; filePath: string }) => void
}

const TOOL_OPTIONS = [
  { id: 'read_files', label: 'Read files', description: 'Inspect source and documentation' },
  { id: 'list_directory', label: 'Browse folders', description: 'Map the project structure' },
  { id: 'query_index', label: 'Search codebase', description: 'Use indexed symbols and related files' },
  { id: 'edit_transaction', label: 'Edit files', description: 'Apply focused, reviewable changes' },
  { id: 'basher', label: 'Run commands', description: 'Run bounded project checks' },
  { id: 'web_search', label: 'Search the web', description: 'Look up current external context' }
] as const

const TEMPLATES: { id: TemplateId; label: string; description: string; draft: AgentDraft }[] = [
  {
    id: 'blank',
    label: 'Focused specialist',
    description: 'Start with a clean, narrow brief.',
    draft: {
      id: 'project-specialist',
      displayName: 'Project Specialist',
      spawnerPrompt: 'Handles a focused task in this project and returns a concise, actionable result.',
      systemPrompt: 'You are a focused specialist for this project. Stay within the assigned scope, verify assumptions with the available project context, and be concise.',
      instructionsPrompt: '1. Understand the requested task and its constraints.\n2. Inspect only the files or context needed to make a reliable decision.\n3. Return the result with concrete evidence and clearly call out anything that remains uncertain.',
      toolNames: ['read_files', 'list_directory']
    }
  },
  {
    id: 'reviewer',
    label: 'Code reviewer',
    description: 'Find risks, regressions, and missing coverage.',
    draft: {
      id: 'code-reviewer',
      displayName: 'Code Reviewer',
      spawnerPrompt: 'Reviews implementation changes for correctness, regressions, security risks, and missing tests.',
      systemPrompt: 'You are a meticulous code reviewer. Prioritize real defects and user impact over style preferences. Do not edit files; explain the evidence behind every finding.',
      instructionsPrompt: '1. Read the relevant files and trace the changed behavior.\n2. Check edge cases, error paths, security boundaries, and test coverage.\n3. Report findings from highest to lowest severity with file references.\n4. If no actionable issues remain, say so and summarize what was verified.',
      toolNames: ['read_files', 'list_directory', 'query_index']
    }
  },
  {
    id: 'docs',
    label: 'Documentation writer',
    description: 'Turn implementation details into clear docs.',
    draft: {
      id: 'documentation-writer',
      displayName: 'Documentation Writer',
      spawnerPrompt: 'Creates and improves project documentation using the actual codebase as the source of truth.',
      systemPrompt: 'You are a precise technical writer. Make documentation easy to scan, accurate to the current implementation, and useful to the intended reader.',
      instructionsPrompt: '1. Inspect the implementation before drafting.\n2. Match the project\'s existing terminology and tone.\n3. Prefer short sections, concrete examples, and explicit prerequisites.\n4. Keep claims grounded in files you inspected and flag gaps instead of inventing behavior.',
      toolNames: ['read_files', 'list_directory', 'query_index', 'edit_transaction']
    }
  },
  {
    id: 'tests',
    label: 'Test analyst',
    description: 'Plan and validate the highest-value checks.',
    draft: {
      id: 'test-analyst',
      displayName: 'Test Analyst',
      spawnerPrompt: 'Designs focused test coverage and validates behavior against the project\'s existing conventions.',
      systemPrompt: 'You are a pragmatic test analyst. Optimize for confidence and signal: identify the smallest set of checks that catches the important failures.',
      instructionsPrompt: '1. Read the implementation and existing tests first.\n2. Identify behavior boundaries, failure modes, and untested paths.\n3. Propose or add focused tests that match local conventions.\n4. Run the narrowest useful check when available and report the exact result.',
      toolNames: ['read_files', 'list_directory', 'query_index', 'edit_transaction', 'basher']
    }
  }
]

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
}

function quote(value: string): string {
  return JSON.stringify(value.trim())
}

function buildPreviewSource(draft: AgentDraft): string {
  return [
    'const definition = {',
    `  id: ${quote(draft.id)},`,
    `  displayName: ${quote(draft.displayName)},`,
    `  spawnerPrompt: ${quote(draft.spawnerPrompt)},`,
    '  inputSchema: {',
    '    prompt: {',
    "      type: 'string',",
    "      description: 'The focused task this agent should handle.',",
    '    },',
    '  },',
    "  outputMode: 'last_message',",
    '  includeMessageHistory: false,',
    `  toolNames: ${JSON.stringify(draft.toolNames)},`,
    '  mcpServers: {},',
    '  spawnableAgents: [],',
    `  systemPrompt: ${quote(draft.systemPrompt)},`,
    `  instructionsPrompt: ${quote(draft.instructionsPrompt)},`,
    '}',
    '',
    'export default definition'
  ].join('\n')
}

export default function AgentWizardModal({ cwd, onClose, onCreated }: Props) {
  const [step, setStep] = useState(1)
  const [scope, setScope] = useState<Scope>('project')
  const [templateId, setTemplateId] = useState<TemplateId>('blank')
  const [idTouched, setIdTouched] = useState(false)
  const [draft, setDraft] = useState<AgentDraft>(() => ({ ...TEMPLATES[0].draft }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, saving])

  const path = useMemo(() => {
    const root = scope === 'project' ? `${cwd.replace(/[\\/]+$/, '')}/.agents` : '~/.agents'
    return `${root}/${draft.id || 'your-agent'}.ts`
  }, [cwd, draft.id, scope])

  const idValid = /^[a-z0-9-]+$/.test(draft.id)
  const stepOneValid = Boolean(draft.displayName.trim() && draft.id.trim() && idValid && draft.spawnerPrompt.trim())
  const stepTwoValid = Boolean(draft.systemPrompt.trim() && draft.instructionsPrompt.trim() && draft.toolNames.length > 0)

  const update = (patch: Partial<AgentDraft>) => setDraft((current) => ({ ...current, ...patch }))

  const chooseTemplate = (template: (typeof TEMPLATES)[number]) => {
    setTemplateId(template.id)
    setDraft({ ...template.draft })
    setIdTouched(false)
    setError(null)
  }

  const updateDisplayName = (value: string) => {
    setDraft((current) => ({ ...current, displayName: value, id: idTouched ? current.id : slugify(value) }))
  }

  const toggleTool = (tool: string) => {
    setDraft((current) => ({
      ...current,
      toolNames: current.toolNames.includes(tool) ? current.toolNames.filter((item) => item !== tool) : [...current.toolNames, tool]
    }))
  }

  const next = () => {
    setError(null)
    if (step === 1 && !stepOneValid) {
      setError('Add a display name, a valid agent ID, and a short spawner description.')
      return
    }
    if (step === 2 && !stepTwoValid) {
      setError('Add both prompts and choose at least one capability.')
      return
    }
    setStep((current) => Math.min(3, current + 1))
  }

  const save = async () => {
    if (!stepOneValid || !stepTwoValid) return
    setSaving(true)
    setError(null)
    try {
      if (typeof window.openbuff === 'undefined') {
        onCreated({ id: draft.id, filePath: path })
        return
      }
      const result = (await window.openbuff.createLocalAgent({ cwd, scope, ...draft })) as {
        ok: boolean
        id?: string
        filePath?: string
        error?: string
      }
      if (!result.ok || !result.id || !result.filePath) {
        setError(result.error ?? 'Could not create the agent file.')
        return
      }
      onCreated({ id: result.id, filePath: result.filePath })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop agent-wizard-backdrop" onClick={saving ? undefined : onClose}>
      <div className="agent-wizard" onClick={(event) => event.stopPropagation()}>
        <aside className="agent-wizard-rail">
          <div className="agent-wizard-brand">
            <span className="agent-wizard-mark"><RobotIcon size={19} /></span>
            <div>
              <span className="eyebrow">/init</span>
              <strong>Agent workshop</strong>
            </div>
          </div>
          <div className="agent-wizard-steps">
            {[
              ['01', 'Identity', 'Name and purpose'],
              ['02', 'Behavior', 'Prompts and tools'],
              ['03', 'Review', 'Confirm the definition']
            ].map(([number, label, detail], index) => {
              const itemStep = index + 1
              return (
                <button
                  key={number}
                  className={`agent-wizard-step ${step === itemStep ? 'active' : ''} ${step > itemStep ? 'complete' : ''}`}
                  onClick={() => itemStep < step && setStep(itemStep)}
                  disabled={itemStep >= step}
                >
                  <span className="agent-wizard-step-number">{step > itemStep ? '✓' : number}</span>
                  <span>
                    <strong>{label}</strong>
                    <small>{detail}</small>
                  </span>
                </button>
              )
            })}
          </div>
          <div className="agent-wizard-target">
            <span className="eyebrow">Will be saved to</span>
            <code>{path}</code>
            <span>Local TypeScript definition · reloadable from Settings</span>
          </div>
        </aside>

        <section className="agent-wizard-main">
          <header className="agent-wizard-header">
            <div>
              <span className="eyebrow">Create a custom agent</span>
              <h2>{step === 1 ? 'Give it a clear job.' : step === 2 ? 'Shape how it works.' : 'One last look.'}</h2>
              <p>{step === 1 ? 'Start from a proven role or make a specialist from scratch.' : step === 2 ? 'The prompts become the agent\'s operating contract.' : 'This is the exact definition OpenBuff will load into your project.'}</p>
            </div>
            <button className="mini-btn" onClick={onClose} disabled={saving} title="Close">
              <XIcon size={15} />
            </button>
          </header>

          {step === 1 && (
            <div className="agent-wizard-content agent-wizard-identity">
              <div className="agent-template-grid">
                {TEMPLATES.map((template) => (
                  <button key={template.id} className={`agent-template ${templateId === template.id ? 'selected' : ''}`} onClick={() => chooseTemplate(template)}>
                    <span className="agent-template-dot">{template.id === 'blank' ? '✦' : template.id === 'reviewer' ? '◌' : template.id === 'docs' ? 'Aa' : '✓'}</span>
                    <span><strong>{template.label}</strong><small>{template.description}</small></span>
                  </button>
                ))}
              </div>
              <div className="agent-field-grid">
                <label>
                  Display name
                  <input value={draft.displayName} onChange={(event) => updateDisplayName(event.target.value)} placeholder="e.g. API Migration Guide" autoFocus />
                </label>
                <label>
                  Agent ID
                  <input className="mono-input" value={draft.id} onChange={(event) => { setIdTouched(true); update({ id: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') }) }} placeholder="api-migration-guide" spellCheck={false} />
                  <span className={`field-help ${draft.id && !idValid ? 'invalid' : ''}`}>Lowercase letters, numbers, and hyphens only.</span>
                </label>
              </div>
              <label>
                What should it be spawned for?
                <textarea value={draft.spawnerPrompt} onChange={(event) => update({ spawnerPrompt: event.target.value })} rows={3} placeholder="Describe the situation where this agent is useful." />
                <span className="field-help">This short description helps the orchestrator choose the right specialist.</span>
              </label>
              <div className="agent-scope-row">
                <div><strong>Agent scope</strong><span>Choose where this definition should be available.</span></div>
                <div className="agent-segmented">
                  <button className={scope === 'project' ? 'selected' : ''} onClick={() => setScope('project')}>This project</button>
                  <button className={scope === 'home' ? 'selected' : ''} onClick={() => setScope('home')}>All projects</button>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="agent-wizard-content agent-wizard-behavior">
              <label>
                System prompt
                <textarea value={draft.systemPrompt} onChange={(event) => update({ systemPrompt: event.target.value })} rows={4} autoFocus placeholder="Set the agent's role, boundaries, and quality bar." />
              </label>
              <label>
                Working instructions
                <textarea value={draft.instructionsPrompt} onChange={(event) => update({ instructionsPrompt: event.target.value })} rows={6} placeholder="Give it a short, ordered workflow. Use one instruction per line." />
              </label>
              <div className="agent-capability-head"><div><strong>Capabilities</strong><span>Only selected tools are exposed to this agent.</span></div><span className="capability-count">{draft.toolNames.length} selected</span></div>
              <div className="agent-capability-grid">
                {TOOL_OPTIONS.map((tool) => (
                  <button key={tool.id} className={`agent-capability ${draft.toolNames.includes(tool.id) ? 'selected' : ''}`} onClick={() => toggleTool(tool.id)}>
                    <span className="agent-capability-check">{draft.toolNames.includes(tool.id) ? '✓' : ''}</span>
                    <span><strong>{tool.label}</strong><small>{tool.description}</small></span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="agent-wizard-content agent-wizard-review">
              <div className="agent-review-summary">
                <span className="agent-review-avatar"><RobotIcon size={20} /></span>
                <div><strong>{draft.displayName}</strong><span>{draft.spawnerPrompt}</span></div>
                <code>{draft.id}</code>
              </div>
              <div className="agent-review-meta">
                <span><b>Scope</b>{scope === 'project' ? 'This project' : 'All projects'}</span>
                <span><b>Tools</b>{draft.toolNames.length} enabled</span>
                <span><b>Path</b><code>{path}</code></span>
              </div>
              <div className="agent-preview-head"><span>Generated definition</span><span>TypeScript</span></div>
              <pre className="agent-code-preview"><code>{buildPreviewSource(draft)}</code></pre>
            </div>
          )}

          {error && <div className="error agent-wizard-error">{error}</div>}

          <footer className="agent-wizard-footer">
            <button className="btn ghost" onClick={step === 1 ? onClose : () => { setError(null); setStep((current) => current - 1) }} disabled={saving}>
              {step === 1 ? 'Cancel' : <><ChevronLeftIcon size={14} /> Back</>}
            </button>
            <span className="agent-wizard-progress">Step {step} of 3</span>
            {step < 3 ? (
              <button className="btn primary" onClick={next} disabled={saving}>
                Continue <ChevronRightIcon size={14} />
              </button>
            ) : (
              <button className="btn primary" onClick={() => void save()} disabled={saving}>
                {saving ? 'Creating…' : 'Create Agent'}
              </button>
            )}
          </footer>
        </section>
      </div>
    </div>
  )
}
