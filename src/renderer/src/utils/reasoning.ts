export function getReasoningOptionsForModel(modelId: string | undefined): string[] {
  if (!modelId) return ['default', 'none', 'minimal', 'low', 'medium', 'high', 'extra-high', 'max']
  const m = modelId.toLowerCase()
  if (m.includes('o1') || m.includes('o3') || m.includes('gpt-4.5') || m.includes('gpt-5')) {
    return ['default', 'low', 'medium', 'high']
  }
  if (m.includes('grok')) {
    return ['default', 'low', 'medium', 'high', 'max']
  }
  if (m.includes('deepseek') || m.includes('qwq') || m.includes('qwen')) {
    // DeepSeek and Qwen natively stream reasoning without effort levels.
    return ['default']
  }
  return ['default', 'none', 'minimal', 'low', 'medium', 'high', 'extra-high', 'max']
}
