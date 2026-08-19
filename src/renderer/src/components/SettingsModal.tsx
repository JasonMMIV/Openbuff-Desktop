import { useEffect, useState } from 'react'
import { MoonIcon, PlusIcon, RefreshIcon, SunIcon, XIcon } from './Icons'

type ProviderType = 'openai-compatible' | 'anthropic-compatible'

interface ProviderDraft {
  id: string
  label: string
  type: ProviderType
  baseURL: string
  apiKeyEnv: string
  models: string[]
}

interface Props {
  onClose: () => void
  onCreateAgent: () => void
  onSaved: (s: { hasProvider: boolean }) => void
  theme: 'dark' | 'light'
  onToggleTheme: () => void
}

const REASONING_OPTIONS = ['default', 'high', 'medium', 'low', 'minimal', 'none']

let draftSeq = 0
function newProviderId(): string {
  draftSeq += 1
  return `custom-${Date.now().toString(36)}-${draftSeq}`
}

function defaultCustom(): ProviderDraft {
  return {
    id: newProviderId(),
    label: 'OpenAI Compatible',
    type: 'openai-compatible',
    baseURL: 'http://localhost:11434/v1',
    apiKeyEnv: 'OPENBUFF_API_KEY',
    models: []
  }
}

function urlError(url: string): string | null {
  const trimmed = url.trim()
  if (!trimmed) return 'Base URL is required'
  try {
    const u = new URL(trimmed)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return 'Base URL must start with http:// or https://'
    return null
  } catch {
    return 'Invalid URL — expected e.g. https://api.openai.com/v1'
  }
}

export default function SettingsModal({ onClose, onCreateAgent, onSaved, theme, onToggleTheme }: Props) {
  const [providers, setProviders] = useState<ProviderDraft[]>([])
  const [providerHasKey, setProviderHasKey] = useState<Record<string, boolean>>({})
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({})
  const [deleteKeys, setDeleteKeys] = useState<string[]>([])
  const [activeModel, setActiveModel] = useState('')
  const [reasoningEffort, setReasoningEffort] = useState('default')
  const [approvalMode, setApprovalMode] = useState<'balanced' | 'strict' | 'allow-all'>('balanced')
  const [agentRouting, setAgentRouting] = useState<Record<string, { model: string; reasoningEffort: string }>>({})
  const [allAgentIds, setAllAgentIds] = useState<string[]>([])
  const [routeDraftAgent, setRouteDraftAgent] = useState('')
  const [routeDraftModel, setRouteDraftModel] = useState('')
  const [saving, setSaving] = useState(false)
  const [cwd, setCwd] = useState('')
  const [localAgents, setLocalAgents] = useState<{ id: string; displayName: string; spawnerPrompt: string }[]>([])
  const [localAgentErrors, setLocalAgentErrors] = useState<{ agentId: string; message: string }[]>([])
  const [loadingAgents, setLoadingAgents] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fetchingId, setFetchingId] = useState<string | null>(null)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [testMsg, setTestMsg] = useState<{ id: string; text: string; ok: boolean } | null>(null)

  useEffect(() => {
    if (typeof window.openbuff === 'undefined') {
      // Browser preview mode
      const previewProvider = { ...defaultCustom(), label: 'OpenAI API', baseURL: 'https://api.openai.com/v1', models: ['gpt-5.5', 'gpt-5.4-mini'] }
      setProviders([previewProvider])
      setActiveModel(`${previewProvider.id}/gpt-5.5`)
      setAgentRouting({
        editor: { model: `${previewProvider.id}/gpt-5.5`, reasoningEffort: 'default' },
        'file-picker': { model: `${previewProvider.id}/gpt-5.4-mini`, reasoningEffort: 'low' }
      })
      setAllAgentIds(['base2', 'code-reviewer', 'editor', 'file-picker', 'planner', 'researcher-web', 'thinker'])
      setLocalAgents([
        { id: 'doc-writer', displayName: 'Doc Writer', spawnerPrompt: 'Writes documentation' },
        { id: 'qa-agent', displayName: 'QA Agent', spawnerPrompt: 'Runs acceptance checks' }
      ])
      return
    }
    void (async () => {
      const state = (await window.openbuff.getState()) as {
        settings?: {
          providers?: ProviderDraft[]
          activeModel?: string
          reasoningEffort?: string
          approvalMode?: 'balanced' | 'strict' | 'allow-all'
          providerHasKey?: Record<string, boolean>
          agentRouting?: Record<string, { model: string; reasoningEffort?: string }>
        }
        agentIds?: string[]
      }
      const s = state.settings
      if (s?.providers && s.providers.length > 0) {
        setProviders(s.providers.map((p) => ({ ...p, models: [...(p.models ?? [])] })))
      }
      setActiveModel(s?.activeModel ?? '')
      if (s?.reasoningEffort) setReasoningEffort(s.reasoningEffort)
      if (s?.approvalMode) setApprovalMode(s.approvalMode)
      setProviderHasKey(s?.providerHasKey ?? {})
      setAgentRouting(
        Object.fromEntries(
          Object.entries(s?.agentRouting ?? {}).map(([id, r]) => [id, { model: r.model, reasoningEffort: r.reasoningEffort ?? 'default' }])
        )
      )
      setAllAgentIds(state.agentIds ?? [])
      setCwd((state as { cwd?: string }).cwd ?? '')
      if ((state as { cwd?: string }).cwd) {
        const res = (await window.openbuff.listLocalAgents((state as { cwd?: string }).cwd as string)) as {
          agents: { id: string; displayName: string; spawnerPrompt: string }[]
          validationErrors: { agentId: string; message: string }[]
        }
        setLocalAgents(res.agents ?? [])
        setLocalAgentErrors((res.validationErrors ?? []).map((e) => ({ agentId: e.agentId, message: e.message })))
        // Custom agents are routable too — make sure they appear in the routing picker.
        setAllAgentIds((prev) => [...new Set([...prev, ...(res.agents ?? []).map((a) => a.id)])])
      }
    })()
  }, [])

  const refreshLocalAgents = async () => {
    if (typeof window.openbuff === 'undefined') {
      setLocalAgents([
        { id: 'doc-writer', displayName: 'Doc Writer', spawnerPrompt: 'Writes documentation' },
        { id: 'qa-agent', displayName: 'QA Agent', spawnerPrompt: 'Runs acceptance checks' }
      ])
      return
    }
    if (!cwd) return
    setLoadingAgents(true)
    try {
      const res = (await window.openbuff.listLocalAgents(cwd)) as {
        agents: { id: string; displayName: string; spawnerPrompt: string }[]
        validationErrors: { agentId: string; message: string }[]
      }
      setLocalAgents(res.agents ?? [])
      setLocalAgentErrors((res.validationErrors ?? []).map((e) => ({ agentId: e.agentId, message: e.message })))
    } finally {
      setLoadingAgents(false)
    }
  }

  const updateProvider = (id: string, patch: Partial<ProviderDraft>) => {
    setProviders((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  }

  const addProvider = () => {
    setProviders((prev) => [...prev, defaultCustom()])
  }

  const removeProvider = (id: string) => {
    setProviders((prev) => prev.filter((p) => p.id !== id))
    setDeleteKeys((prev) => [...prev, id])
    const modelPrefix = `${id}/`
    if (activeModel.startsWith(modelPrefix)) {
      setActiveModel('')
    }
  }

  const addModel = (id: string, model: string) => {
    const m = model.trim()
    if (!m) return
    setProviders((prev) =>
      prev.map((p) => (p.id === id && !p.models.includes(m) ? { ...p, models: [...p.models, m] } : p))
    )
  }

  const removeModel = (id: string, model: string) => {
    setProviders((prev) => prev.map((p) => (p.id === id ? { ...p, models: p.models.filter((m) => m !== model) } : p)))
    if (activeModel === `${id}/${model}`) setActiveModel('')
  }

  const testConnection = async (p: ProviderDraft) => {
    setError(null)
    setTestMsg(null)
    const ue = urlError(p.baseURL)
    if (ue) {
      setError(`Connection test: ${ue}`)
      return
    }
    if (typeof window.openbuff === 'undefined') {
      setTestMsg({ id: p.id, text: 'Connection OK (preview mode)', ok: true })
      return
    }
    setTestingId(p.id)
    try {
      const result = (await window.openbuff.fetchModels({
        baseURL: p.baseURL.trim(),
        apiKey: (apiKeys[p.id] ?? '').trim(),
        providerType: 'custom'
      })) as { ok: boolean; models?: string[]; error?: string }
      if (!result.ok) {
        setTestMsg({ id: p.id, text: `Connection failed: ${result.error ?? 'Unknown error'}`, ok: false })
        return
      }
      setTestMsg({ id: p.id, text: `Connection OK — ${result.models?.length ?? 0} models found`, ok: true })
    } catch (err) {
      setTestMsg({ id: p.id, text: `Connection failed: ${String(err)}`, ok: false })
    } finally {
      setTestingId(null)
    }
  }

  const fetchModels = async (p: ProviderDraft) => {
    setError(null)
    setTestMsg(null)
    const ue = urlError(p.baseURL)
    if (ue) {
      setError(`Fetch models: ${ue}`)
      return
    }
    if (typeof window.openbuff === 'undefined') {
      updateProvider(p.id, { models: ['gpt-5.5', 'gpt-5.4-mini', 'gpt-4.1'] })
      return
    }
    setFetchingId(p.id)
    try {
      const result = (await window.openbuff.fetchModels({
        baseURL: p.baseURL.trim(),
        apiKey: (apiKeys[p.id] ?? '').trim(),
        providerType: 'custom'
      })) as { ok: boolean; models?: string[]; error?: string }
      if (!result.ok) {
        setError(`Failed to fetch models: ${result.error ?? 'Unknown error'}`)
        return
      }
      updateProvider(p.id, { models: result.models ?? [] })
    } catch (err) {
      setError(`Failed to fetch models: ${String(err)}`)
    } finally {
      setFetchingId(null)
    }
  }

  const save = async () => {
    if (providers.length === 0) {
      setError('At least one provider is required')
      return
    }
    for (const p of providers) {
      const ue = urlError(p.baseURL)
      if (ue) {
        setError(`${p.label}: ${ue}`)
        return
      }
    }
    // Pick the default model (if none chosen yet or the old one is invalid)
    let finalModel = activeModel
    const modelValid = providers.some((p) => finalModel.startsWith(`${p.id}/`) && p.models.some((m) => `${p.id}/${m}` === finalModel))
    if (!modelValid) {
      const first = providers.find((p) => p.models.length > 0)
      if (first) finalModel = `${first.id}/${first.models[0]}`
    }
    // Validate agent routing models against the current providers
    for (const [agentId, route] of Object.entries(agentRouting)) {
      if (!route.model) continue
      const valid = providers.some((p) => route.model.startsWith(`${p.id}/`) && p.models.some((m) => `${p.id}/${m}` === route.model))
      if (!valid) {
        setError(`Agent routing: model \`${route.model}\` for agent \`${agentId}\` is not in any provider's model list.`)
        return
      }
    }
    if (typeof window.openbuff === 'undefined') {
      onSaved({ hasProvider: true })
      return
    }
    setSaving(true)
    setError(null)
    try {
      // Ensure each provider's apiKeyEnv is unique (multiple OpenAI-compatible providers need distinct env vars)
      const usedEnv = new Set<string>()
      const normalizedProviders = providers.map((p) => {
        let env = p.apiKeyEnv || 'OPENBUFF_API_KEY'
        let i = 1
        while (usedEnv.has(env)) env = `OPENBUFF_API_KEY_${++i}`
        usedEnv.add(env)
        return { ...p, apiKeyEnv: env }
      })
      setProviders(normalizedProviders)
      const result = (await window.openbuff.saveSettings({
        providers: normalizedProviders.map((p) => ({
          id: p.id,
          label: p.label,
          type: p.type,
          baseURL: p.baseURL.trim(),
          apiKeyEnv: p.apiKeyEnv || 'OPENBUFF_API_KEY',
          models: p.models
        })),
        activeModel: finalModel,
        reasoningEffort,
        approvalMode,
        apiKeys: Object.fromEntries(Object.entries(apiKeys).filter(([, v]) => v.trim())),
        deleteKeys,
        agentRouting: Object.fromEntries(
          Object.entries(agentRouting).filter(([, r]) => r.model.trim())
        )
      })) as { ok?: boolean; settings?: { hasProvider?: boolean }; error?: string }
      if (!result.ok) {
        setError(result.error ?? 'Save failed')
        return
      }
      onSaved({ hasProvider: Boolean(result.settings?.hasProvider) })
    } catch (err) {
      setError(String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Settings</h2>
        <p className="hint">BYOK: use your own API keys. Keys are encrypted locally and never uploaded.</p>

        <div className="settings-section-head">
          <span>Providers</span>
          <button className="btn ghost small" onClick={addProvider} title="Add a compatible provider">
            <PlusIcon size={12} /> Add Provider
          </button>
        </div>

        {providers.map((p) => (
          <div key={p.id} className="provider-card">
            <div className="provider-card-head">
              <div className="provider-card-title">
                <input
                  className="provider-label-input"
                  value={p.label}
                  onChange={(e) => updateProvider(p.id, { label: e.target.value })}
                  placeholder="Provider name"
                />
                <select value={p.type} onChange={(e) => updateProvider(p.id, { type: e.target.value as ProviderType })}>
                  <option value="openai-compatible">OpenAI Compatible</option>
                  <option value="anthropic-compatible">Anthropic Compatible</option>
                </select>
              </div>
              <button className="mini-btn" onClick={() => removeProvider(p.id)} title="Remove provider">
                <XIcon size={12} />
              </button>
            </div>

            <label>Base URL</label>
            <div className="url-row">
              <input
                value={p.baseURL}
                onChange={(e) => updateProvider(p.id, { baseURL: e.target.value })}
                placeholder="https://api.openai.com/v1"
                spellCheck={false}
              />
              <button
                className="btn ghost small"
                onClick={() => void testConnection(p)}
                disabled={testingId === p.id}
                title="Test the connection"
              >
                {testingId === p.id ? 'Testing…' : 'Test'}
              </button>
            </div>
            {testMsg?.id === p.id && (
              <div className={`test-msg ${testMsg.ok ? 'ok' : 'fail'}`}>{testMsg.text}</div>
            )}

            <label>
              API Key {providerHasKey[p.id] && <span className="hint-inline">(saved, leave empty to keep)</span>}
            </label>
            <div className="model-picker-row">
              <input
                type="password"
                value={apiKeys[p.id] ?? ''}
                onChange={(e) => setApiKeys((prev) => ({ ...prev, [p.id]: e.target.value }))}
                placeholder={providerHasKey[p.id] ? '••••••••' : 'sk-…'}
                spellCheck={false}
              />
              <button className="btn fetch-models-btn" onClick={() => fetchModels(p)} disabled={fetchingId === p.id}>
                <RefreshIcon size={13} className={fetchingId === p.id ? 'spin-icon' : ''} />
                {fetchingId === p.id ? 'Fetching…' : 'Fetch Models'}
              </button>
            </div>

            <label>Models</label>
            <div className="model-tags">
              {p.models.map((m) => (
                <span key={m} className={`model-tag ${activeModel === `${p.id}/${m}` ? 'active' : ''}`}>
                  {m}
                  <button
                    className="chip-x"
                    onClick={() => removeModel(p.id, m)}
                    title="Remove model"
                    onMouseDown={(e) => e.preventDefault()}
                  >
                    <XIcon size={9} />
                  </button>
                </span>
              ))}
              {p.models.length === 0 && <span className="hint-inline">No models added</span>}
            </div>
            <div className="model-add-row">
              <input
                placeholder="Add model name, press Enter…"
                spellCheck={false}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addModel(p.id, (e.target as HTMLInputElement).value)
                    ;(e.target as HTMLInputElement).value = ''
                  }
                }}
              />
            </div>
          </div>
        ))}

        <label>Default Model</label>
        <select value={activeModel} onChange={(e) => setActiveModel(e.target.value)}>
          {providers.map((p) =>
            p.models.map((m) => (
              <option key={`${p.id}/${m}`} value={`${p.id}/${m}`}>
                {p.label} / {m}
              </option>
            ))
          )}
          {providers.every((p) => p.models.length === 0) &&            <option value="">Add models to a provider first</option>}
        </select>

        <label>Reasoning Level</label>
        <select value={reasoningEffort} onChange={(e) => setReasoningEffort(e.target.value)}>
          {REASONING_OPTIONS.map((r) => (
            <option key={r} value={r}>
              {r === 'default' ? 'auto (model default)' : r}
            </option>
          ))}
        </select>

        <label>Approval Mode</label>
        <select value={approvalMode} onChange={(e) => setApprovalMode(e.target.value as typeof approvalMode)}>
          <option value="balanced">Balanced — high-impact actions require approval</option>
          <option value="strict">Strict — approve all changes</option>
          <option value="allow-all">Allow all — auto-approve everything</option>
        </select>

        <div className="settings-section-head">
          <span>Agent Routing</span>
        </div>
        <p className="hint">
          Route specific agents to different models (e.g. a cheap model for file-picker, a powerful one for editor). Agents without a route use the global default model.
        </p>

        {Object.entries(agentRouting).map(([agentId, route]) => (
          <div key={agentId} className="route-row">
            <span className="route-agent" title={agentId}>
              {agentId}
            </span>
            <select
              value={route.model}
              onChange={(e) => setAgentRouting((prev) => ({ ...prev, [agentId]: { ...prev[agentId], model: e.target.value } }))}
              title="Model for this agent"
            >
              {providers.map((p) =>
                p.models.map((m) => (
                  <option key={`${p.id}/${m}`} value={`${p.id}/${m}`}>
                    {p.label} / {m}
                  </option>
                ))
              )}
              {providers.every((p) => p.models.length === 0) && <option value="">Add models to a provider first</option>}
            </select>
            <select
              value={route.reasoningEffort}
              onChange={(e) => setAgentRouting((prev) => ({ ...prev, [agentId]: { ...prev[agentId], reasoningEffort: e.target.value } }))}
              title="Reasoning effort for this agent"
            >
              {REASONING_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {r === 'default' ? 'auto' : r}
                </option>
              ))}
            </select>
            <button
              className="mini-btn danger"
              onClick={() => {
                setAgentRouting((prev) => {
                  const next = { ...prev }
                  delete next[agentId]
                  return next
                })
              }}
              title="Remove routing"
            >
              <XIcon size={12} />
            </button>
          </div>
        ))}
        {Object.keys(agentRouting).length === 0 && <div className="hint-inline route-empty">No per-agent routes configured.</div>}

        <div className="route-add-row">
          <select value={routeDraftAgent} onChange={(e) => setRouteDraftAgent(e.target.value)} title="Agent to route">
            <option value="">Select agent…</option>
            {allAgentIds
              .filter((id) => !(id in agentRouting))
              .map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            {allAgentIds.length === 0 && <option value="">No agents available</option>}
          </select>
          <select
            value={routeDraftModel}
            onChange={(e) => setRouteDraftModel(e.target.value)}
            title="Model for this agent"
            disabled={!routeDraftAgent}
          >
            <option value="">Model…</option>
            {providers.map((p) =>
              p.models.map((m) => (
                <option key={`${p.id}/${m}`} value={`${p.id}/${m}`}>
                  {p.label} / {m}
                </option>
              ))
            )}
          </select>
          <button
            className="btn ghost small"
            disabled={!routeDraftAgent || !routeDraftModel}
            onClick={() => {
              setAgentRouting((prev) => ({ ...prev, [routeDraftAgent]: { model: routeDraftModel, reasoningEffort: 'default' } }))
              setRouteDraftAgent('')
              setRouteDraftModel('')
            }}
          >
            <PlusIcon size={12} /> Add Route
          </button>
        </div>

        <div className="settings-section-head">
          <span>Custom Agents</span>
          <div className="settings-section-actions">
            <button className="btn primary small" onClick={onCreateAgent} title="Create a custom agent with the /init wizard">
              <PlusIcon size={12} /> Create Agent
            </button>
            <button className="btn ghost small" onClick={() => void refreshLocalAgents()} disabled={loadingAgents} title="Reload agents from .agents directories">
              <RefreshIcon size={12} className={loadingAgents ? 'spin-icon' : ''} />
              {loadingAgents ? 'Loading…' : 'Reload'}
            </button>
          </div>
        </div>
        <p className="hint">
          Custom agents are loaded from <code>.agents/</code> in your project or home directory (same as the CLI's <code>/init</code>). Files can be <code>.ts</code>, <code>.js</code>, <code>.mjs</code> or <code>.cjs</code> and are merged over the bundled agents.
        </p>

        {localAgents.length === 0 && !loadingAgents && <div className="hint-inline route-empty">No custom agents found.</div>}
        <div className="local-agent-list">
          {localAgents.map((a) => (
            <div key={a.id} className="local-agent-row" title={a.spawnerPrompt}>
              <span className="route-agent">{a.id}</span>
              <span className="local-agent-name">{a.displayName}</span>
            </div>
          ))}
        </div>

        {localAgentErrors.length > 0 && (
          <div className="local-agent-errors">
            {localAgentErrors.map((e, i) => (
              <div key={i} className="test-msg fail">
                <strong>{e.agentId || 'Agent'}:</strong> {e.message}
              </div>
            ))}
          </div>
        )}

        <div className="settings-theme-row">
          <span>Theme</span>
          <button className="btn ghost small" onClick={onToggleTheme}>
            {theme === 'dark' ? <SunIcon size={14} /> : <MoonIcon size={14} />}
            {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
          </button>
        </div>

        {error && <div className="error">{error}</div>}

        <div className="modal-actions">
          <button className="btn" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="btn primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
