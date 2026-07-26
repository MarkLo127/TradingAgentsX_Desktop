import { app, safeStorage } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { SecretId, SecretsState, SecretStatus } from '../shared/types'
import { PROVIDERS } from '../shared/providers'

/**
 * API 金鑰儲存。
 *
 * 使用作業系統層級的加密（macOS 鑰匙圈 / Windows DPAPI / Linux libsecret），
 * 密文寫在 userData/secrets.json。明文只存在於主行程記憶體中的短暫變數，
 * 從不經過 IPC 傳給渲染行程 —— 渲染行程只拿得到「有沒有設定」與末四碼。
 */

interface SecretRecord {
  /** base64 之後的密文；若系統不支援加密則為 null */
  cipher: string | null
  /** 系統不支援加密時的退路，會在 UI 明確警告 */
  plain?: string
  hint: string
  updatedAt: string
}

type SecretsFile = Record<string, SecretRecord>

const file = () => path.join(app.getPath('userData'), 'secrets.json')

let cache: SecretsFile | null = null

function read(): SecretsFile {
  if (cache) return cache
  try {
    cache = JSON.parse(fs.readFileSync(file(), 'utf8')) as SecretsFile
  } catch {
    cache = {}
  }
  return cache
}

function write(data: SecretsFile) {
  cache = data
  fs.mkdirSync(path.dirname(file()), { recursive: true })
  fs.writeFileSync(file(), JSON.stringify(data, null, 2), { encoding: 'utf8', mode: 0o600 })
}

export function encryptionAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

export function setSecret(id: SecretId, value: string) {
  const data = read()
  const trimmed = value.trim()
  if (!trimmed) {
    delete data[id]
    write(data)
    return
  }
  const hint = trimmed.slice(-4)
  const updatedAt = new Date().toISOString()
  if (encryptionAvailable()) {
    data[id] = { cipher: safeStorage.encryptString(trimmed).toString('base64'), hint, updatedAt }
  } else {
    // 沒有系統鑰匙圈可用時仍要能運作，但在 UI 上會標示為未加密
    data[id] = { cipher: null, plain: trimmed, hint, updatedAt }
  }
  write(data)
}

export function removeSecret(id: SecretId) {
  const data = read()
  delete data[id]
  write(data)
}

/** 僅供主行程內部使用，絕不經由 IPC 回傳 */
export function getSecret(id: SecretId): string {
  const rec = read()[id]
  if (!rec) return ''
  if (rec.cipher) {
    try {
      return safeStorage.decryptString(Buffer.from(rec.cipher, 'base64'))
    } catch {
      return ''
    }
  }
  return rec.plain ?? ''
}

export function secretsState(): SecretsState {
  const data = read()
  const items: SecretStatus[] = (Object.keys(PROVIDERS) as SecretId[]).map((id) => {
    const rec = data[id]
    return {
      id,
      isSet: Boolean(rec),
      hint: rec?.hint ?? '',
      updatedAt: rec?.updatedAt ?? null,
    }
  })
  return { encryptionAvailable: encryptionAvailable(), items }
}

export function clearAllSecrets() {
  write({})
}
