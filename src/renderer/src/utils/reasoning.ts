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

  // Fallback heuristic based on OmniChat's reasoning RegExp
  const reasoningRegex = /(gpt-oss|gpt-5(?!-chat)|o\d|gemini-(?:2\.5|3).*|gemini-(?:flash-latest|pro-latest)|gemini-3-pro-image-preview|claude|qwen-?3|doubao.+1([-.])6|grok-4|kimi-k(?:2|3)|step-3|intern-s1|glm-4([-.])(?:5|6|7)|glm-5|minimax-m2|deepseek-(?:r1|v3\.1|v3\.2|v4)|deepseek-reasoner|mimo-v2-flash|hy3)/i

  if (reasoningRegex.test(bareModel)) {
    if (bareModel.toLowerCase().includes('grok')) {
      return ['default', 'low', 'medium', 'high', 'max']
    }
    return ['default', 'low', 'medium', 'high']
  }
  
  // General fallback for unknown models (e.g. Musespark, unknown open source models, etc.)
  // Most generic open source models do not support the `reasoning_effort` parameter.
  return ['default']
}
