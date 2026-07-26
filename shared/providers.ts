import type { SecretId } from './types'

/**
 * 模型 → 供應商 / base URL 的對應。
 * 與 frontend/lib/api-helpers.ts 保持一致，避免兩邊行為分歧。
 */

export interface ProviderInfo {
  id: SecretId
  label: string
  baseUrl: string
  /** 取得金鑰的說明頁 */
  docsUrl: string
  /** 金鑰常見前綴，用於基本格式檢查 */
  prefix?: string
}

export const PROVIDERS: Record<SecretId, ProviderInfo> = {
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    docsUrl: 'https://console.anthropic.com/settings/keys',
    prefix: 'sk-ant-',
  },
  openai: {
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    docsUrl: 'https://platform.openai.com/api-keys',
    prefix: 'sk-',
  },
  google: {
    id: 'google',
    label: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    docsUrl: 'https://aistudio.google.com/apikey',
    prefix: 'AIza',
  },
  xai: {
    id: 'xai',
    label: 'xAI Grok',
    baseUrl: 'https://api.x.ai/v1',
    docsUrl: 'https://console.x.ai',
    prefix: 'xai-',
  },
  deepseek: {
    id: 'deepseek',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    docsUrl: 'https://platform.deepseek.com/api_keys',
    prefix: 'sk-',
  },
  qwen: {
    id: 'qwen',
    label: 'Qwen（阿里雲）',
    baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    docsUrl: 'https://dashscope.console.aliyun.com',
  },
  custom: {
    id: 'custom',
    label: '自訂（OpenAI 相容）',
    baseUrl: '',
    docsUrl: '',
  },
  alphavantage: {
    id: 'alphavantage',
    label: 'Alpha Vantage',
    baseUrl: '',
    docsUrl: 'https://www.alphavantage.co/support/#api-key',
  },
  finmind: {
    id: 'finmind',
    label: 'FinMind',
    baseUrl: '',
    docsUrl: 'https://finmindtrade.com/analysis/#/account/login',
  },
}

/** LLM 供應商（會出現在模型選單），不含純資料來源。custom 放最後。 */
export const LLM_PROVIDERS: SecretId[] = [
  'anthropic',
  'openai',
  'google',
  'xai',
  'deepseek',
  'qwen',
  'custom',
]
export const DATA_PROVIDERS: SecretId[] = ['alphavantage', 'finmind']

export function providerForModel(model: string): SecretId {
  if (model === 'custom') return 'custom'
  if (model.startsWith('claude-')) return 'anthropic'
  if (model.startsWith('gpt-')) return 'openai'
  if (model.startsWith('gemini-')) return 'google'
  if (model.startsWith('grok-')) return 'xai'
  if (model.startsWith('deepseek-')) return 'deepseek'
  if (model.startsWith('qwen')) return 'qwen'
  return 'openai'
}

export function baseUrlForModel(model: string): string {
  return PROVIDERS[providerForModel(model)].baseUrl
}

/**
 * 給模型選單用的分組清單。
 * 與雲端版 frontend/lib/report-utils.ts 的 MODEL_DISPLAY_NAMES 完全對齊，
 * 順序也比照 AnalysisForm 的下拉。
 */
export const MODEL_GROUPS: { provider: SecretId; models: { id: string; label: string }[] }[] = [
  {
    provider: 'openai',
    models: [
      { id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol' },
      { id: 'gpt-5.6-terra', label: 'GPT-5.6 Terra' },
      { id: 'gpt-5.6-luna', label: 'GPT-5.6 Luna' },
    ],
  },
  {
    provider: 'anthropic',
    models: [
      { id: 'claude-fable-5', label: 'Claude Fable 5' },
      { id: 'claude-opus-5', label: 'Claude Opus 5' },
      { id: 'claude-sonnet-5', label: 'Claude Sonnet 5' },
      { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
    ],
  },
  {
    provider: 'google',
    models: [
      { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash' },
      { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash' },
      { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite' },
    ],
  },
  {
    provider: 'xai',
    models: [
      { id: 'grok-4.5', label: 'Grok 4.5' },
      { id: 'grok-4.3', label: 'Grok 4.3' },
      { id: 'grok-4.20-0309-reasoning', label: 'Grok 4.20' },
      { id: 'grok-4.20-0309-non-reasoning', label: 'Grok 4.20 (Non-Reasoning)' },
    ],
  },
  {
    provider: 'deepseek',
    models: [
      { id: 'deepseek-v4-pro', label: 'Deepseek V4 Pro' },
      { id: 'deepseek-v4-flash', label: 'Deepseek V4 Flash' },
    ],
  },
  {
    provider: 'qwen',
    models: [
      { id: 'qwen3.7-max', label: 'Qwen3.7-Max' },
      { id: 'qwen3.7-plus', label: 'Qwen3.7-Plus' },
      { id: 'qwen3.5-flash', label: 'Qwen3.5-Flash' },
    ],
  },
  {
    provider: 'custom',
    models: [{ id: 'custom', label: '自訂模型…' }],
  },
]

export function modelLabel(id: string): string {
  for (const g of MODEL_GROUPS) {
    const m = g.models.find((x) => x.id === id)
    if (m) return m.label
  }
  return id
}

/**
 * Embedding 模型。與雲端版一致。
 * - local: 本機模型，不需金鑰
 * - provider: 需要哪家的金鑰與 base URL（gemini embedding 走 google）
 */
export const EMBEDDING_MODELS: {
  id: string
  label: string
  local: boolean
  provider?: SecretId
}[] = [
  { id: 'all-mpnet-base-v2', label: 'all-mpnet-base-v2', local: true },
  { id: 'text-embedding-3-small', label: 'text-embedding-3-small', local: false, provider: 'openai' },
  { id: 'text-embedding-3-large', label: 'text-embedding-3-large', local: false, provider: 'openai' },
  { id: 'gemini-embedding-2', label: 'gemini-embedding-2', local: false, provider: 'google' },
  { id: 'gemini-embedding-001', label: 'gemini-embedding-001', local: false, provider: 'google' },
  { id: 'custom', label: '自訂 embedding…', local: false, provider: 'custom' },
]

/** 判斷 embedding 模型該用哪家金鑰；本機模型回 null */
export function embeddingProvider(modelId: string): SecretId | null {
  const m = EMBEDDING_MODELS.find((e) => e.id === modelId)
  if (!m || m.local) return null
  return m.provider ?? 'openai'
}
