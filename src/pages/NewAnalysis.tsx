import { useMemo, useState } from 'react'
import type { AnalystKey, MarketType, StartAnalysisInput } from '@shared/types'
import {
  EMBEDDING_MODELS,
  MODEL_GROUPS,
  PROVIDERS,
  embeddingProvider,
  providerForModel,
} from '@shared/providers'
import { Icon } from '@/components/Icon'
import { Badge, Banner, Btn, Field, Panel, Seg } from '@/components/ui'
import { TickerCombobox } from '@/components/TickerCombobox'
import { LogoSelect } from '@/components/LogoSelect'
import type { LogoGroup } from '@/components/LogoSelect'
import { huggingfaceLogo, providerLogo } from '@/lib/logos'
import { formatDuration, todayISO } from '@/lib/format'
import { PIPELINE, RESEARCH_MODES, agentName, phaseTitle, plannedAgents } from '@/lib/report'
import type { BadgeTone } from '@/components/ui'
import { useStore } from '@/lib/store'
import { useI18n } from '@/lib/i18n'

export function NewAnalysis() {
  const { settings, secrets, backend, reports, startAnalysis, navigate, updateSettings } = useStore()
  const { t, zh } = useI18n()

  const [ticker, setTicker] = useState('')
  const [analysisDate, setAnalysisDate] = useState(todayISO())
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [touched, setTouched] = useState(false)

  // 所有 hook 都必須在任何 early return 之前呼叫
  const analystCount = settings?.analysts.length ?? 0

  /** 只用同樣分析師數量的歷史紀錄估算，沒有資料就明說沒有 */
  const estimate = useMemo(() => {
    const sample = reports.filter(
      (r) => r.durationMs && r.durationMs > 0 && r.analystCount === analystCount,
    )
    if (sample.length < 2) return null
    const avg = sample.reduce((s, r) => s + (r.durationMs ?? 0), 0) / sample.length
    return { avg, n: sample.length }
  }, [reports, analystCount])

  if (!settings) return <main className="main" />

  const marketType = settings.marketType
  const analysts = settings.analysts

  const MODE_META: Record<
    (typeof RESEARCH_MODES)[number]['mode'],
    { title: string; desc: string; tone: BadgeTone }
  > = {
    fast: {
      title: t('快速模式', 'Fast mode'),
      desc: t(
        '跳過多空與風險辯論，只跑分析師與交易員，時間與 token 明顯較少。',
        'Skips the bull/bear and risk debates — analysts and trader only, much less time and tokens.',
      ),
      tone: 'info',
    },
    balanced: {
      title: t('平衡模式', 'Balanced mode'),
      desc: t(
        '完整流程但辯論輪數適中，品質與耗時取得平衡（對齊雲端版的中等）。',
        'Full pipeline with a moderate number of debate rounds — a balance of quality and time (cloud “medium”).',
      ),
      tone: 'accent',
    },
    deep: {
      title: t('深度模式', 'Deep mode'),
      desc: t(
        '辯論輪數最多，判斷品質最高，時間與成本也明顯上升。',
        'The most debate rounds and highest-quality verdicts, at clearly higher time and cost.',
      ),
      tone: 'violet',
    },
  }
  const MODES = RESEARCH_MODES.map((m) => ({ ...m, ...MODE_META[m.mode] }))

  const ANALYSTS: { key: AnalystKey; label: string; hint: string }[] = [
    { key: 'market', label: t('市場分析師', 'Market Analyst'), hint: t('技術指標', 'Technicals') },
    { key: 'news', label: t('新聞分析師', 'News Analyst'), hint: t('新聞流', 'Headlines') },
    { key: 'social', label: t('社群情緒分析師', 'Social Analyst'), hint: 'Reddit' },
    { key: 'fundamentals', label: t('基本面分析師', 'Fundamentals Analyst'), hint: t('財報估值', 'Financials') },
  ]

  const keyOf = (id: string) => secrets.items.find((i) => i.id === id)?.isSet ?? false

  const deepProvider = providerForModel(settings.deepThinkLlm)
  const quickProvider = providerForModel(settings.quickThinkLlm)
  const missingKeys = [
    ...(keyOf(deepProvider) ? [] : [PROVIDERS[deepProvider].label]),
    ...(keyOf(quickProvider) || quickProvider === deepProvider ? [] : [PROVIDERS[quickProvider].label]),
    ...(() => {
      const ep = embeddingProvider(settings.embeddingModel)
      return ep && !keyOf(ep) ? [`${PROVIDERS[ep].label}${t('（embedding）', ' (embedding)')}`] : []
    })(),
  ]
  const uniqueMissing = [...new Set(missingKeys)]

  const tickerError =
    touched && !ticker.trim()
      ? t('請輸入股票代號', 'Enter a ticker')
      : touched && !/^[A-Za-z0-9.-]{1,10}$/.test(ticker.trim())
        ? t('代號格式不正確（限英數字、點與連字號，最多 10 字元）', 'Invalid format (letters, digits, dot, hyphen; max 10)')
        : null

  const analystsError = touched && analysts.length === 0 ? t('至少要選一位分析師', 'Select at least one analyst') : null

  const planned = plannedAgents(analysts, settings.researchDepth)

  const canSubmit =
    backend.phase === 'ready' &&
    uniqueMissing.length === 0 &&
    ticker.trim().length > 0 &&
    analysts.length > 0 &&
    !submitting

  const toggleAnalyst = (key: AnalystKey) => {
    const next = analysts.includes(key) ? analysts.filter((a) => a !== key) : [...analysts, key]
    void updateSettings({ analysts: next })
  }

  const submit = async () => {
    setTouched(true)
    setFormError(null)
    if (!ticker.trim() || analysts.length === 0) return

    setSubmitting(true)
    const input: StartAnalysisInput = {
      ticker: ticker.trim().toUpperCase(),
      analysisDate,
      marketType,
      analysts,
      researchDepth: settings.researchDepth,
      deepThinkLlm: settings.deepThinkLlm,
      quickThinkLlm: settings.quickThinkLlm,
      embeddingModel: settings.embeddingModel,
      customDeepModel: settings.customDeepModel,
      customQuickModel: settings.customQuickModel,
      customEmbeddingModel: settings.customEmbeddingModel,
      customBaseUrl: settings.customBaseUrl,
      language: settings.language,
    }
    const res = await startAnalysis(input)
    setSubmitting(false)
    if (!res.ok) setFormError(res.message ?? t('啟動失敗', 'Failed to start'))
  }

  const optgroupLabel = (provider: (typeof MODEL_GROUPS)[number]['provider']) =>
    `${PROVIDERS[provider].label}${keyOf(provider) ? '' : t('（未設定金鑰）', ' (no key)')}`

  // 帶 logo 的模型選單分組（深度／快速思考共用）
  const modelGroups: LogoGroup[] = MODEL_GROUPS.map((g) => ({
    label: optgroupLabel(g.provider),
    options: g.models.map((m) => ({ value: m.id, label: m.label, logo: providerLogo(g.provider) })),
  }))

  // Embedding 選單：本機模型掛 Hugging Face 標誌，雲端 embedding 走對應供應商
  const embeddingGroups: LogoGroup[] = [
    {
      options: EMBEDDING_MODELS.map((m) => {
        const ep = embeddingProvider(m.id)
        return {
          value: m.id,
          label: m.label,
          logo: m.local ? huggingfaceLogo : ep ? providerLogo(ep) : undefined,
          hint: m.local ? t('本機', 'local') : m.id === 'custom' ? t('自訂', 'custom') : undefined,
        }
      }),
    },
  ]

  // 選到「自訂」時，補上模型名稱欄位；base URL 與金鑰統一在「設定 → 自訂」維護
  const customInputs = (show: boolean, modelVal: string, onModel: (v: string) => void) =>
    show ? (
      <div className="stack gap-6" style={{ marginTop: 8 }}>
        <input
          className="input mono"
          placeholder={t('模型名稱，例如 gpt-4o-mini', 'Model name, e.g. gpt-4o-mini')}
          value={modelVal}
          onChange={(e) => onModel(e.target.value)}
          aria-label={t('自訂模型名稱', 'Custom model name')}
        />
        <div className="help">
          {settings.customBaseUrl.trim() ? (
            <>
              {t('端點：', 'Endpoint: ')}
              <code>{settings.customBaseUrl}</code>
              {t('（可到「設定 → 自訂」修改）', ' (edit under Settings → Custom)')}
            </>
          ) : (
            <span style={{ color: 'var(--warn)' }}>
              {t(
                '尚未設定自訂端點 —— 請到「設定 → 自訂（OpenAI 相容）」填寫 base URL 與金鑰。',
                'No custom endpoint yet — set the base URL and key under Settings → Custom.',
              )}
            </span>
          )}
        </div>
      </div>
    ) : null

  return (
    <>
      <main className="main">
        <div className="main-head">
          <div>
            <h1>{t('新增分析', 'New analysis')}</h1>
            <div className="sub">
              {t('設定完成後，代理人會在你的電腦上依序執行', 'Once configured, the agents run locally on your machine')}
            </div>
          </div>
        </div>

        <div className="main-scroll narrow">
          {backend.phase !== 'ready' && (
            <Banner
              tone={backend.phase === 'starting' ? 'info' : 'err'}
              title={
                backend.phase === 'starting'
                  ? t('本機後端啟動中', 'Local backend starting')
                  : t('本機後端未就緒', 'Local backend not ready')
              }
              action={
                backend.phase !== 'starting' ? (
                  <Btn small onClick={() => navigate({ name: 'settings' })}>
                    {t('前往設定', 'Open settings')}
                  </Btn>
                ) : undefined
              }
            >
              {backend.phase === 'starting'
                ? t(
                    '第一次啟動要載入 LangChain 等套件，通常需要 10–40 秒。',
                    'The first launch loads LangChain and friends — usually 10–40 s.',
                  )
                : (backend.message ?? t('請檢查設定中的 Python 路徑與專案目錄。', 'Check the Python path and project directory in settings.'))}
            </Banner>
          )}

          {uniqueMissing.length > 0 && (
            <Banner
              tone="warn"
              icon="key"
              title={t('缺少所選模型需要的金鑰', 'Missing keys for the selected models')}
              action={
                <Btn small onClick={() => navigate({ name: 'settings' })}>
                  {t('新增金鑰', 'Add keys')}
                </Btn>
              }
            >
              {t('尚未設定：', 'Not set: ')}
              {uniqueMissing.join(t('、', ', '))}
            </Banner>
          )}

          {formError && (
            <Banner tone="err" title={t('無法啟動分析', 'Could not start analysis')}>
              {formError}
            </Banner>
          )}

          <Panel icon="chart" title={t('標的', 'Target')}>
            <div className="stack gap-16">
              <Field
                label={t('股票代號', 'Ticker')}
                required
                htmlFor="ticker"
                error={tickerError}
                help={
                  zh ? (
                    <>
                      輸入代號或公司名皆可搜尋。美股用代號（<code>NVDA</code>）；
                      台股用純數字代號（<code>2330</code>），板別由右側切換或選取時自動判斷。
                    </>
                  ) : (
                    <>
                      Search by ticker or company name. US: symbol (<code>NVDA</code>); Taiwan: numeric
                      code (<code>2330</code>) — the board is set on select or via the switch.
                    </>
                  )
                }
              >
                <div className="row gap-8">
                  <TickerCombobox
                    id="ticker"
                    value={ticker}
                    onChange={setTicker}
                    market={marketType}
                    onMarketChange={(m) => void updateSettings({ marketType: m })}
                    locale={settings.language}
                    invalid={Boolean(tickerError)}
                    onBlur={() => setTouched(true)}
                  />
                  <Seg<MarketType>
                    label={t('市場', 'Market')}
                    value={marketType}
                    onChange={(v) => void updateSettings({ marketType: v })}
                    options={[
                      { value: 'us', label: t('美股', 'US') },
                      { value: 'twse', label: t('上市', 'TWSE') },
                      { value: 'tpex', label: t('上櫃', 'TPEx') },
                    ]}
                  />
                </div>
              </Field>

              <Field
                label={t('分析基準日', 'As-of date')}
                htmlFor="date"
                help={t(
                  '代理人只會看到這個日期以前的資料，可用來回測歷史情境。',
                  'Agents only see data up to this date — useful for backtesting.',
                )}
              >
                <input
                  id="date"
                  className="input mono"
                  type="date"
                  value={analysisDate}
                  max={todayISO()}
                  onChange={(e) => setAnalysisDate(e.target.value)}
                />
              </Field>
            </div>
          </Panel>

          <Panel
            icon="users"
            title={t('分析師', 'Analysts')}
            actions={
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() =>
                  void updateSettings({
                    analysts: analysts.length === ANALYSTS.length ? [] : ANALYSTS.map((a) => a.key),
                  })
                }
              >
                {analysts.length === ANALYSTS.length ? t('全部取消', 'Clear all') : t('全選', 'Select all')}
              </button>
            }
          >
            <div className="stack gap-8">
              <div className="row wrap gap-16">
                {ANALYSTS.map((a) => (
                  <label key={a.key} className="check-row">
                    <input
                      type="checkbox"
                      checked={analysts.includes(a.key)}
                      onChange={() => toggleAnalyst(a.key)}
                    />
                    {a.label}
                    <span className="faint" style={{ fontSize: 11 }}>
                      {a.hint}
                    </span>
                  </label>
                ))}
              </div>
              {analystsError ? (
                <div className="err" role="alert">
                  <Icon name="alert" size="sm" />
                  {analystsError}
                </div>
              ) : (
                <div className="help">
                  {t(
                    '分析師會平行執行。取消勾選可縮短時間與成本，但會少掉對應面向的觀點。',
                    'Analysts run in parallel. Unchecking one trims time and cost but drops that perspective.',
                  )}
                </div>
              )}
            </div>
          </Panel>

          <Panel icon="branch" title={t('執行模式', 'Mode')}>
            <div className="stack gap-12">
              {MODES.map((m) => {
                const checked = settings.researchDepth === m.depth
                return (
                  <label key={m.mode} className="radio-card" data-checked={checked}>
                    <input
                      type="radio"
                      name="mode"
                      checked={checked}
                      onChange={() => void updateSettings({ researchDepth: m.depth })}
                    />
                    <div className="stack gap-4 flex1">
                      <div className="row gap-8">
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{m.title}</span>
                        <Badge tone={m.tone}>research_depth = {m.depth}</Badge>
                      </div>
                      <div className="help">{m.desc}</div>
                    </div>
                  </label>
                )
              })}
            </div>
          </Panel>

          <Panel
            icon="cpu"
            title={t('模型', 'Models')}
            actions={
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => navigate({ name: 'settings' })}
              >
                {t('管理金鑰', 'Manage keys')}
              </button>
            }
          >
            <div className="stack gap-16">
              <div className="row gap-12">
                <Field
                  label={t('深度思考模型', 'Deep-think model')}
                  htmlFor="deep-llm"
                  help={t('研究員、主管與交易員使用。', 'Used by researchers, managers and the trader.')}
                  style={{ flex: 1 }}
                >
                  <LogoSelect
                    id="deep-llm"
                    ariaLabel={t('深度思考模型', 'Deep-think model')}
                    value={settings.deepThinkLlm}
                    groups={modelGroups}
                    onChange={(v) => void updateSettings({ deepThinkLlm: v })}
                  />
                  {customInputs(
                    settings.deepThinkLlm === 'custom',
                    settings.customDeepModel,
                    (v) => void updateSettings({ customDeepModel: v }),
                  )}
                </Field>

                <Field
                  label={t('快速思考模型', 'Quick-think model')}
                  htmlFor="quick-llm"
                  help={t('4 位分析師與辯論者使用。', 'Used by the 4 analysts and debaters.')}
                  style={{ flex: 1 }}
                >
                  <LogoSelect
                    id="quick-llm"
                    ariaLabel={t('快速思考模型', 'Quick-think model')}
                    value={settings.quickThinkLlm}
                    groups={modelGroups}
                    onChange={(v) => void updateSettings({ quickThinkLlm: v })}
                  />
                  {customInputs(
                    settings.quickThinkLlm === 'custom',
                    settings.customQuickModel,
                    (v) => void updateSettings({ customQuickModel: v }),
                  )}
                </Field>
              </div>

              <Field
                label={t('Embedding 模型', 'Embedding model')}
                htmlFor="embed"
                help={t(
                  '代理人的記憶檢索用。本機模型不需金鑰，但第一次執行要下載模型檔。',
                  'Used for agent memory retrieval. Local models need no key but download once on first run.',
                )}
              >
                <LogoSelect
                  id="embed"
                  ariaLabel={t('Embedding 模型', 'Embedding model')}
                  value={settings.embeddingModel}
                  groups={embeddingGroups}
                  onChange={(v) => void updateSettings({ embeddingModel: v })}
                />
                {customInputs(
                  settings.embeddingModel === 'custom',
                  settings.customEmbeddingModel,
                  (v) => void updateSettings({ customEmbeddingModel: v }),
                )}
              </Field>
            </div>
          </Panel>
        </div>

        <div className="main-foot">
          <div className="foot-inner">
            <div className="row gap-16 mono faint" style={{ fontSize: 11.5 }}>
              <span>{t(`代理人 ${planned.length} 位`, `${planned.length} agents`)}</span>
              <span>
                {estimate
                  ? t(
                      `預估 ${formatDuration(estimate.avg)}（取樣 ${estimate.n} 次）`,
                      `~${formatDuration(estimate.avg)} (from ${estimate.n} runs)`,
                    )
                  : t('尚無足夠歷史紀錄可估算耗時', 'Not enough history to estimate duration')}
              </span>
            </div>
            <div className="row gap-8 mla">
              <Btn onClick={() => navigate({ name: 'dashboard' })}>{t('取消', 'Cancel')}</Btn>
              <Btn
                variant="primary"
                icon="play"
                loading={submitting}
                disabled={!canSubmit}
                onClick={() => void submit()}
              >
                {t('開始分析', 'Start analysis')}
              </Btn>
            </div>
          </div>
        </div>
      </main>

      <aside className="aside" aria-label={t('將執行的代理人', 'Agents to run')}>
        <div className="aside-head">
          <Icon name="users" size="sm" />
          {t('將執行的代理人', 'Agents to run')}
        </div>
        <div className="aside-scroll">
          {PIPELINE.map((phase) => {
            const agents = phase.agents.filter((a) => planned.some((p) => p.id === a.id))
            if (!agents.length) return null
            return (
              <div key={phase.id} className="stack gap-8">
                <div className="sec-title">{phaseTitle(phase, zh)}</div>
                <ul className="stack gap-2" style={{ fontSize: 12 }}>
                  {agents.map((a) => (
                    <li key={a.id} className="row gap-8" style={{ height: 26 }}>
                      <Icon name="dot" size="sm" style={{ color: 'var(--text-disabled)' }} />
                      {agentName(a, zh)}
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
          <p className="faint" style={{ fontSize: 11, lineHeight: 1.55 }}>
            {t(
              '實際執行的代理人由所選分析師與研究深度決定。未勾選的分析師不會被建立。',
              'Which agents run depends on the selected analysts and research depth. Unchecked analysts are not created.',
            )}
          </p>
        </div>
      </aside>
    </>
  )
}
