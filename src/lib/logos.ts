import type { SecretId } from '@shared/types'
import { providerForModel } from '@shared/providers'
import anthropic from '@/assets/logos/claude-color.svg'
import openai from '@/assets/logos/openai.svg'
import google from '@/assets/logos/gemini-color.svg'
import xai from '@/assets/logos/grok.svg'
import deepseek from '@/assets/logos/deepseek-color.svg'
import qwen from '@/assets/logos/qwen-color.svg'
import huggingface from '@/assets/logos/huggingface-color.svg'

/**
 * 供應商 → 品牌 logo（Vite 以 URL 匯入 SVG，打包後是同源 asset，符合 img-src 'self'）。
 * 純資料來源（alphavantage / finmind）不會出現在模型選單，故不需要 logo。
 */
const PROVIDER_LOGO: Partial<Record<SecretId, string>> = {
  anthropic,
  openai,
  google,
  xai,
  deepseek,
  qwen,
}

export function providerLogo(id: SecretId): string | undefined {
  return PROVIDER_LOGO[id]
}

/** 依模型 id 推出供應商 logo */
export function modelLogo(modelId: string): string | undefined {
  return PROVIDER_LOGO[providerForModel(modelId)]
}

/** 本機 embedding 模型用 Hugging Face 標誌；雲端 embedding 走對應供應商 */
export { huggingface as huggingfaceLogo }
