import modelReasoningMap from './openbuff-models.json'

export function getReasoningOptionsForModel(modelId: string | undefined): string[] {
  if (!modelId) return ['default']
  const bareModel = modelId.split('/').pop() || ''
  
  let opts: string[] = []
  if (bareModel in modelReasoningMap) {
    opts = (modelReasoningMap as Record<string, string[]>)[bareModel]
  }

  // If the map gave us options other than just ['default'] or [], use them!
  if (opts.length > 1 || (opts.length === 1 && opts[0] !== 'default')) {
    const normalizedOpts = opts.map(o => o === 'xhigh' ? 'extra-high' : o)
    if (!normalizedOpts.includes('default')) {
      normalizedOpts.unshift('default')
    }
    return normalizedOpts
  }

  // Fallback heuristic for unknown models OR models that only had ['default'] in the API (like hy3-free)
  const m = bareModel.toLowerCase()
  if (m.includes('o1') || m.includes('o3') || m.includes('gpt-4.5') || m.includes('gpt-5') || m.includes('hy3') || m.includes('gemini') || m.includes('claude')) {
    return ['default', 'low', 'medium', 'high']
  }
  if (m.includes('grok')) {
    return ['default', 'low', 'medium', 'high', 'max']
  }
  
  // General fallback for unknown models (e.g. Musespark, DeepSeek, etc.)
  // Most open source or unknown models do not support `reasoning_effort` API parameter.
  return ['default']
}
