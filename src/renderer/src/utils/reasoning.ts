import modelReasoningMap from './openbuff-models.json'

export function getReasoningOptionsForModel(modelId: string | undefined): string[] {
  if (!modelId) return ['default', 'none', 'minimal', 'low', 'medium', 'high', 'extra-high', 'max']
  const bareModel = modelId.split('/').pop() || ''
  
  if (bareModel in modelReasoningMap) {
    const opts = (modelReasoningMap as Record<string, string[]>)[bareModel]
    // if opts is just ['default'], the model streams reasoning natively without effort levels
    if (opts.length > 0) {
      // Ensure 'default' is the first option, then map any 'xhigh' to 'extra-high' to match our schema
      const normalizedOpts = opts.map(o => o === 'xhigh' ? 'extra-high' : o)
      if (!normalizedOpts.includes('default')) {
        normalizedOpts.unshift('default')
      }
      return normalizedOpts
    }
  }

  // Fallback heuristic for unknown models
  const m = bareModel.toLowerCase()
  if (m.includes('o1') || m.includes('o3') || m.includes('gpt-4.5') || m.includes('gpt-5')) {
    return ['default', 'low', 'medium', 'high']
  }
  if (m.includes('grok')) {
    return ['default', 'low', 'medium', 'high', 'max']
  }
  if (m.includes('deepseek') || m.includes('qwq') || m.includes('qwen')) {
    return ['default']
  }
  return ['default', 'none', 'minimal', 'low', 'medium', 'high', 'extra-high', 'max']
}
