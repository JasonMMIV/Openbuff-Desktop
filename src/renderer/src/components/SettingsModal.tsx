import { useEffect, useState } from 'react'
import type { ColorTheme } from '../App'
import {
  ActivityIcon,
  MoonIcon,
  PaletteIcon,
  PlusIcon,
  RefreshIcon,
  SettingsIcon,
  SparklesIcon,
  SpecialistIcon,
  SunIcon,
  XIcon
} from './Icons'
import CustomSelect from './CustomSelect'

type ProviderType = 'openai-compatible' | 'anthropic-compatible'
type SettingsTab = 'providers' | 'general' | 'theme' | 'routing' | 'agents'

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
  colorTheme: ColorTheme
  onSelectColorTheme: (theme: ColorTheme) => void
}

const COLOR_THEMES: { id: ColorTheme; label: string; previewColor: string; description: string }[] = [
  { id: 'default', label: 'Slate Blue', previewColor: '#7a9bf0', description: 'Desaturated classic slate blue with subtle cool undertones' },
  { id: 'black', label: 'Obsidian Black', previewColor: '#f4f4f5', description: 'Monochrome pure black and white high-contrast theme' },
  { id: 'grey', label: 'Neutral Grey', previewColor: '#a1a1aa', description: 'Balanced un-tinted neutral steel and zinc tones' },
  { id: 'vermillion', label: 'Vermillion', previewColor: '#ef4444', description: 'Energetic crimson and scarlet with warm ruby-tinted undertones' },
  { id: 'amber', label: 'Amber', previewColor: '#f59e0b', description: 'Warm amber gold with rich honey and terracotta undertones' },
  { id: 'teal', label: 'Teal', previewColor: '#14b8a6', description: 'Clean modern cyan-teal with high-tech marine undertones' }
]

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

export default function SettingsModal({
  onClose,
  onCreateAgent,
  onSaved,
  theme,
  onToggleTheme,
  colorTheme,
  onSelectColorTheme
}: Props) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('providers')
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
      setActiveTab('providers')
      return
    }
    for (const p of providers) {
      const ue = urlError(p.baseURL)
      if (ue) {
        setError(`${p.label}: ${ue}`)
        setActiveTab('providers')
        return
      }
    }
    // Pick the default model (if none chosen yet or the old one is invalid)
    let finalModel = activeModel
    const modelValid = providers.some(
      (p) => finalModel.startsWith(`${p.id}/`) && p.models.some((m) => `${p.id}/${m}` === finalModel)
    )
    if (!modelValid) {
      const first = providers.find((p) => p.models.length > 0)
      if (first) finalModel = `${first.id}/${first.models[0]}`
    }
    // Validate agent routing models against the current providers
    for (const [agentId, route] of Object.entries(agentRouting)) {
      if (!route.model) continue
      const valid = providers.some(
        (p) => route.model.startsWith(`${p.id}/`) && p.models.some((m) => `${p.id}/${m}` === route.model)
      )
      if (!valid) {
        setError(`Agent routing: model \`${route.model}\` for agent \`${agentId}\` is not in any provider's model list.`)
        setActiveTab('routing')
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
        agentRouting: Object.fromEntries(Object.entries(agentRouting).filter(([, r]) => r.model.trim()))
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

  const NAV_ITEMS: { id: SettingsTab; label: string; icon: React.ReactNode; badge?: number | string }[] = [
    {
      id: 'providers',
      label: 'Providers & Models',
      icon: <SparklesIcon size={16} />
    },
    {
      id: 'general',
      label: 'General',
      icon: <SettingsIcon size={16} />
    },
    {
      id: 'theme',
      label: 'Theme',
      icon: <PaletteIcon size={16} />
    },
    {
      id: 'routing',
      label: 'Agent Routing',
      icon: <ActivityIcon size={16} />,
      badge: Object.keys(agentRouting).length || undefined
    },
    {
      id: 'agents',
      label: 'Custom Agents',
      icon: <SpecialistIcon size={16} />,
      badge: localAgents.length || undefined
    }
  ]

  return (
    <div className="modal-backdrop settings-modal-backdrop" onClick={onClose}>
      <div className="settings-modal-dialog" onClick={(e) => e.stopPropagation()}>
        {/* Left Category Sidebar */}
        <aside className="settings-modal-sidebar">
          <div className="settings-modal-sidebar-header">
            <div className="settings-modal-sidebar-title">
              <SettingsIcon size={18} />
              <span>Settings</span>
            </div>
          </div>

          <nav className="settings-modal-nav">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`settings-modal-nav-item ${activeTab === item.id ? 'active' : ''}`}
                onClick={() => {
                  setError(null)
                  setActiveTab(item.id)
                }}
              >
                <span className="settings-modal-nav-icon">{item.icon}</span>
                <span className="settings-modal-nav-label">{item.label}</span>
                {item.badge !== undefined && <span className="settings-modal-nav-badge">{item.badge}</span>}
              </button>
            ))}
          </nav>
        </aside>

        {/* Right Main Content Panel */}
        <section className="settings-modal-main">
          {/* Header */}
          <header className="settings-modal-header">
            <div>
              <h2>
                {activeTab === 'providers' && 'Providers & Models'}
                {activeTab === 'general' && 'General'}
                {activeTab === 'theme' && 'Theme & Appearance'}
                {activeTab === 'routing' && 'Agent Routing'}
                {activeTab === 'agents' && 'Custom Agents'}
              </h2>
              <p className="hint">
                {activeTab === 'providers' &&
                  'Configure AI providers, base URLs, encrypted API keys, and available models.'}
                {activeTab === 'general' &&
                  'Set your default model, reasoning effort, and tool approval mode.'}
                {activeTab === 'theme' &&
                  'Customize the appearance mode and color scheme palette of OpenBuff.'}
                {activeTab === 'routing' &&
                  'Route specific agent roles to different models and customize reasoning effort per agent.'}
                {activeTab === 'agents' &&
                  'Manage local agents loaded from .agents/ directories in your project or home.'}
              </p>
            </div>
            <button className="mini-btn settings-close-btn" onClick={onClose} title="Close">
              <XIcon size={15} />
            </button>
          </header>

          {/* Body */}
          <div className="settings-modal-body">
            {/* 1. Providers Tab */}
            {activeTab === 'providers' && (
              <div className="settings-tab-content">
                <div className="settings-section-head">
                  <span>Configured Providers</span>
                  <button className="btn ghost small" onClick={addProvider} title="Add a compatible provider">
                    <PlusIcon size={12} /> Add Provider
                  </button>
                </div>

                {providers.length === 0 ? (
                  <div className="settings-empty-card">
                    <p>No providers configured yet.</p>
                    <button className="btn primary small" onClick={addProvider}>
                      <PlusIcon size={12} /> Add Your First Provider
                    </button>
                  </div>
                ) : (
                  providers.map((p) => (
                    <div key={p.id} className="provider-card">
                      <div className="provider-card-head">
                        <div className="provider-card-title">
                          <input
                            className="provider-label-input"
                            value={p.label}
                            onChange={(e) => updateProvider(p.id, { label: e.target.value })}
                            placeholder="Provider name"
                          />
                          <CustomSelect
                            value={p.type}
                            onChange={(val) => updateProvider(p.id, { type: val as ProviderType })}
                            size="small"
                            options={[
                              { value: 'openai-compatible', label: 'OpenAI Compatible' },
                              { value: 'anthropic-compatible', label: 'Anthropic Compatible' }
                            ]}
                          />
                        </div>
                        <button
                          className="mini-btn"
                          onClick={() => removeProvider(p.id)}
                          title="Remove provider"
                        >
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
                        <button
                          className="btn fetch-models-btn"
                          onClick={() => fetchModels(p)}
                          disabled={fetchingId === p.id}
                        >
                          <RefreshIcon size={13} className={fetchingId === p.id ? 'spin-icon' : ''} />
                          {fetchingId === p.id ? 'Fetching…' : 'Fetch Models'}
                        </button>
                      </div>

                      <label>Models</label>
                      <div className="model-tags">
                        {p.models.map((m) => (
                          <span
                            key={m}
                            className={`model-tag ${activeModel === `${p.id}/${m}` ? 'active' : ''}`}
                          >
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
                  ))
                )}
              </div>
            )}

            {/* 2. General Tab */}
            {activeTab === 'general' && (
              <div className="settings-tab-content">
                <div className="settings-field-group">
                  <label className="settings-field-label">Default Model</label>
                  <CustomSelect
                    value={activeModel}
                    onChange={setActiveModel}
                    fullWidth
                    placeholder={providers.every((p) => p.models.length === 0) ? 'Add models to a provider first' : 'Select default model'}
                    options={providers.flatMap((p) =>
                      p.models.map((m) => ({
                        value: `${p.id}/${m}`,
                        label: `${p.label} / ${m}`
                      }))
                    )}
                  />
                  <p className="hint">Used for primary reasoning and all agents without custom routing rules.</p>
                </div>

                <div className="settings-field-group">
                  <label className="settings-field-label">Reasoning Level</label>
                  <CustomSelect
                    value={reasoningEffort}
                    onChange={setReasoningEffort}
                    fullWidth
                    options={REASONING_OPTIONS.map((r) => ({
                      value: r,
                      label: r === 'default' ? 'auto (model default)' : r
                    }))}
                  />
                  <p className="hint">Controls extended thinking effort for models supporting reasoning tokens.</p>
                </div>

                <div className="settings-field-group">
                  <label className="settings-field-label">Approval Mode</label>
                  <CustomSelect
                    value={approvalMode}
                    onChange={(val) => setApprovalMode(val as typeof approvalMode)}
                    fullWidth
                    options={[
                      { value: 'balanced', label: 'Balanced — high-impact actions require approval' },
                      { value: 'strict', label: 'Strict — approve all changes' },
                      { value: 'allow-all', label: 'Allow all — auto-approve everything' }
                    ]}
                  />
                  <p className="hint">Determines when OpenBuff requires confirmation before modifying files or running commands.</p>
                </div>
              </div>
            )}

            {/* 3. Theme Tab */}
            {activeTab === 'theme' && (
              <div className="settings-tab-content">
                <div className="settings-field-group settings-theme-group">
                  <div className="settings-theme-info">
                    <label className="settings-field-label">Appearance Mode</label>
                    <p className="hint">Switch between Dark and Light interface themes.</p>
                  </div>
                  <button className="btn ghost small" onClick={onToggleTheme}>
                    {theme === 'dark' ? <SunIcon size={14} /> : <MoonIcon size={14} />}
                    {theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                  </button>
                </div>

                <div className="settings-field-group">
                  <label className="settings-field-label">Color Scheme</label>
                  <p className="hint">
                    Choose a color palette. Backgrounds and interface accents will adapt dynamically.
                  </p>
                  <div className="color-theme-grid">
                    {COLOR_THEMES.map((ct) => (
                      <button
                        key={ct.id}
                        type="button"
                        className={`color-theme-card ${colorTheme === ct.id ? 'active' : ''}`}
                        onClick={() => onSelectColorTheme(ct.id)}
                      >
                        <div className="color-theme-header">
                          <span
                            className="color-theme-swatch"
                            style={{ backgroundColor: ct.previewColor }}
                          />
                          <span className="color-theme-name">{ct.label}</span>
                        </div>
                        <span className="color-theme-desc">{ct.description}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* 4. Agent Routing Tab */}
            {activeTab === 'routing' && (
              <div className="settings-tab-content">
                <div className="settings-section-head">
                  <span>Configured Agent Routes</span>
                </div>
                <p className="hint">
                  Route specific agents to different models (e.g. a cheap/fast model for <code>file-picker</code>, a powerful one for <code>editor</code>). Agents without a route use the global default model.
                </p>

                {Object.keys(agentRouting).length === 0 ? (
                  <div className="settings-empty-card">
                    <p>No per-agent routes configured. All agents use the default model.</p>
                  </div>
                ) : (
                  <div className="route-list">
                    {Object.entries(agentRouting).map(([agentId, route]) => (
                      <div key={agentId} className="route-row">
                        <span className="route-agent" title={agentId}>
                          {agentId}
                        </span>
                        <CustomSelect
                          value={route.model}
                          onChange={(val) =>
                            setAgentRouting((prev) => ({
                              ...prev,
                              [agentId]: { ...prev[agentId], model: val }
                            }))
                          }
                          size="small"
                          placeholder={providers.every((p) => p.models.length === 0) ? 'Add models to a provider first' : 'Select model'}
                          options={providers.flatMap((p) =>
                            p.models.map((m) => ({
                              value: `${p.id}/${m}`,
                              label: `${p.label} / ${m}`
                            }))
                          )}
                          title="Model for this agent"
                          className="flex-1"
                        />
                        <CustomSelect
                          value={route.reasoningEffort}
                          onChange={(val) =>
                            setAgentRouting((prev) => ({
                              ...prev,
                              [agentId]: { ...prev[agentId], reasoningEffort: val }
                            }))
                          }
                          size="small"
                          options={REASONING_OPTIONS.map((r) => ({
                            value: r,
                            label: r === 'default' ? 'auto' : r
                          }))}
                          title="Reasoning effort for this agent"
                          className="flex-1"
                        />
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
                  </div>
                )}

                <div className="settings-section-head" style={{ marginTop: '16px' }}>
                  <span>Add Route Rule</span>
                </div>
                <div className="route-add-row">
                  <CustomSelect
                    value={routeDraftAgent}
                    onChange={setRouteDraftAgent}
                    size="small"
                    placeholder={allAgentIds.length === 0 ? 'No agents available' : 'Select agent…'}
                    options={allAgentIds
                      .filter((id) => !(id in agentRouting))
                      .map((id) => ({
                        value: id,
                        label: id
                      }))}
                    title="Agent to route"
                    className="flex-1"
                  />
                  <CustomSelect
                    value={routeDraftModel}
                    onChange={setRouteDraftModel}
                    disabled={!routeDraftAgent}
                    size="small"
                    placeholder="Model…"
                    options={providers.flatMap((p) =>
                      p.models.map((m) => ({
                        value: `${p.id}/${m}`,
                        label: `${p.label} / ${m}`
                      }))
                    )}
                    title="Model for this agent"
                    className="flex-1"
                  />
                  <button
                    className="btn ghost small"
                    disabled={!routeDraftAgent || !routeDraftModel}
                    onClick={() => {
                      setAgentRouting((prev) => ({
                        ...prev,
                        [routeDraftAgent]: { model: routeDraftModel, reasoningEffort: 'default' }
                      }))
                      setRouteDraftAgent('')
                      setRouteDraftModel('')
                    }}
                  >
                    <PlusIcon size={12} /> Add Route
                  </button>
                </div>
              </div>
            )}

            {/* 4. Custom Agents Tab */}
            {activeTab === 'agents' && (
              <div className="settings-tab-content">
                <div className="settings-section-head">
                  <span>Project & Home Agents</span>
                  <div className="settings-section-actions">
                    <button
                      className="btn primary small"
                      onClick={onCreateAgent}
                      title="Create a custom agent with the /init wizard"
                    >
                      <PlusIcon size={12} /> Create Agent
                    </button>
                    <button
                      className="btn ghost small"
                      onClick={() => void refreshLocalAgents()}
                      disabled={loadingAgents}
                      title="Reload agents from .agents directories"
                    >
                      <RefreshIcon size={12} className={loadingAgents ? 'spin-icon' : ''} />
                      {loadingAgents ? 'Loading…' : 'Reload'}
                    </button>
                  </div>
                </div>
                <p className="hint">
                  Custom agents are loaded from <code>.agents/</code> in your project or home directory (same as the CLI's <code>/init</code>). Files can be <code>.ts</code>, <code>.js</code>, <code>.mjs</code> or <code>.cjs</code> and are merged over the bundled agents.
                </p>

                {localAgents.length === 0 && !loadingAgents ? (
                  <div className="settings-empty-card">
                    <p>No custom agents found in <code>.agents/</code>.</p>
                    <button className="btn primary small" onClick={onCreateAgent}>
                      <PlusIcon size={12} /> Create Custom Agent
                    </button>
                  </div>
                ) : (
                  <div className="local-agent-list">
                    {localAgents.map((a) => (
                      <div key={a.id} className="local-agent-row" title={a.spawnerPrompt}>
                        <span className="route-agent">{a.id}</span>
                        <span className="local-agent-name">{a.displayName}</span>
                      </div>
                    ))}
                  </div>
                )}

                {localAgentErrors.length > 0 && (
                  <div className="local-agent-errors">
                    {localAgentErrors.map((e, i) => (
                      <div key={i} className="test-msg fail">
                        <strong>{e.agentId || 'Agent'}:</strong> {e.message}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <footer className="settings-modal-footer">
            {error && <div className="error settings-footer-error">{error}</div>}
            <div className="settings-modal-footer-actions">
              <button className="btn" onClick={onClose} disabled={saving}>
                Cancel
              </button>
              <button className="btn primary" onClick={save} disabled={saving}>
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </footer>
        </section>
      </div>
    </div>
  )
}
