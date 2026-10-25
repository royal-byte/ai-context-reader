import { useEffect, useState, type ChangeEvent } from 'react';
import { API_PRESETS, DEFAULT_API_SETTINGS, SETTINGS_KEY, normalizeApiSettings, providerForEndpoint, selectApiProvider, type ApiProvider } from './api-settings';
import { DEFAULT_PREFERENCES, PREFERENCES_KEY, normalizePreferences, parseSiteList, uiText, type ReaderPreferences } from './preferences';
import { keepServiceWorkerAlive } from './keepalive';
import './settings.css';

export function SettingsForm({ onSaved, onCancel }: { onSaved: (preferences: ReaderPreferences) => void; onCancel: () => void }) {
  const [settings, setSettings] = useState(DEFAULT_API_SETTINGS);
  const [provider, setProvider] = useState<ApiProvider>('openai');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const [allowedSites, setAllowedSites] = useState('');
  const [blockedSites, setBlockedSites] = useState('');
  const [testNotice, setTestNotice] = useState('');
  const t = uiText(preferences.uiLanguage);
  useEffect(() => {
    chrome.storage.local.get([SETTINGS_KEY, PREFERENCES_KEY]).then((stored) => {
      const config = normalizeApiSettings(stored[SETTINGS_KEY]);
      setSettings(config);
      setProvider(providerForEndpoint(config.endpoint));
      const reader = normalizePreferences(stored[PREFERENCES_KEY]);
      setPreferences(reader); setAllowedSites(reader.allowedSites.join('\n')); setBlockedSites(reader.blockedSites.join('\n'));
    }).catch(() => setNotice('读取配置失败，请重新打开设置。')).finally(() => setLoading(false));
  }, []);
  const change = (field: 'endpoint' | 'model' | 'apiKey') => (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    // Changing a destination must not carry a different provider's credential along.
    setSettings({ ...settings, [field]: value, ...(field === 'endpoint' ? { apiKey: '' } : {}) });
    setNotice(''); setTestNotice('');
  };
  const switchProvider = (event: ChangeEvent<HTMLSelectElement>) => {
    const selected = event.target.value as ApiProvider;
    setProvider(selected);
    setSettings(selectApiProvider(selected));
    setNotice(''); setTestNotice(t('请填写此服务商的 API 密钥，再测试连接并保存。', 'Enter this provider’s key, then test and save.'));
  };
  const save = async () => {
    setBusy(true); setNotice(t('正在保存…', 'Saving…'));
    try {
      const reader = normalizePreferences({ ...preferences, allowedSites: parseSiteList(allowedSites), blockedSites: parseSiteList(blockedSites) });
      await chrome.storage.local.set({ [SETTINGS_KEY]: settings, [PREFERENCES_KEY]: reader }); onSaved(reader);
    }
    catch (error) { setNotice(error instanceof Error && error.message.includes(' / ') ? error.message : t('保存失败，请重试。', 'Could not save. Please try again.')); }
    finally { setBusy(false); }
  };
  const test = async () => {
    setBusy(true); setTestNotice(t('正在测试连接与解释格式…', 'Testing connection and response format…'));
    const stopKeepAlive = keepServiceWorkerAlive();
    try {
      const result = await chrome.runtime.sendMessage({ type: 'test-api', settings });
      setTestNotice(result?.ok ? t('连接和解释格式正常。点击“保存并返回”后生效。', 'Connection and response format are valid. Save to apply.') : result?.error ?? t('测试失败，请重试。', 'Test failed. Please try again.'));
    } catch { setTestNotice(t('扩展连接中断，请重新加载扩展后重试。', 'Extension disconnected. Reload it and try again.')); }
    finally { stopKeepAlive(); setBusy(false); }
  };
  return <section className="settings-form" lang={preferences.uiLanguage} aria-label={t('阅读设置', 'Reader settings')}>
    <p className="eyebrow">AI CONTEXT READER</p><h2>{t('让阅读按你的习惯来', 'Make reading your own')}</h2>
    <p>{t('语言、阅读方式和隐私，在这里统一管理。', 'Manage languages, reading behavior, and privacy in one place.')}</p>
    <fieldset disabled={loading || busy}>
      <section className="settings-group"><h3>{t('基础', 'Basics')}</h3>
        <div className="settings-columns"><label>{t('界面语言', 'Interface language')}<select value={preferences.uiLanguage} onChange={(event) => setPreferences({ ...preferences, uiLanguage: event.target.value as 'zh-CN' | 'en' })}><option value="zh-CN">简体中文</option><option value="en">English</option></select></label>
        <label>{t('解释语言', 'Explanation language')}<select value={preferences.explanationLanguage} onChange={(event) => setPreferences({ ...preferences, explanationLanguage: event.target.value as 'zh-CN' | 'en' })}><option value="zh-CN">简体中文</option><option value="en">English</option></select></label></div>
        <p className="hint">{t('English 模式使用离线英英词典释义，AI 提供语境义和英文改写；中文模式使用离线英汉词典。未配置密钥时仍可查看离线单词释义。', 'English mode uses offline ECDICT English definitions and AI for in-context meaning and plain-English paraphrases. Chinese mode uses the offline Chinese dictionary. Word definitions work without an API key.')}</p>
      </section>
      <section className="settings-group"><h3>{t('阅读', 'Reading')}</h3>
        <label>{t('阅读触发方式', 'Query trigger')}<select value={preferences.trigger} onChange={(event) => setPreferences({ ...preferences, trigger: event.target.value as 'quick' | 'confirm' })}><option value="quick">{t('快捷查词：双击单词直接查，拖选后确认', 'Quick lookup: double-click words; confirm drag selections')}</option><option value="confirm">{t('始终确认：所有选区点击解释后才查询', 'Always confirm: click Explain for every selection')}</option></select></label>
        <label className="setting-check"><input type="checkbox" checked={preferences.englishOnly} onChange={(event) => setPreferences({ ...preferences, englishOnly: event.target.checked })} />{t('只对英文选区触发（推荐）', 'English selections only (recommended)')}</label>
        <p className="hint">{t('中文、日文、韩文等非英文选区不会显示解释按钮，也不会请求模型。关闭后可解释其他语言。', 'Chinese, Japanese, Korean and other non-English selections show no Explain button and send no model request. Turn this off to explain other languages.')}</p>
        <div className="settings-columns"><label>{t('弹窗大小', 'Popup size')}<select value={preferences.popupSize} onChange={(event) => setPreferences({ ...preferences, popupSize: event.target.value as typeof preferences.popupSize })}><option value="compact">{t('紧凑', 'Compact')}</option><option value="medium">{t('适中', 'Medium')}</option><option value="large">{t('宽松', 'Large')}</option></select></label>
        <label>{t('解释选区快捷键', 'Explain selection shortcut')}<select value={preferences.shortcut} onChange={(event) => setPreferences({ ...preferences, shortcut: event.target.value as typeof preferences.shortcut })}><option value="off">{t('关闭', 'Off')}</option><option value="alt-shift-e">Alt + Shift + E</option><option value="alt-shift-x">Alt + Shift + X</option></select></label></div>
        <p className="hint">{t('快捷键只在阅读网页或 PDF 时生效，不接管 Ctrl+C。单次最多 3000 字符，超过 1500 字符会提醒分段。', 'Shortcuts work in reading pages and PDFs, never override Ctrl+C. Maximum 3000 characters; selections over 1500 show a reminder.')}</p>
      </section>
      <section className="settings-group"><h3>{t('复习', 'Review')}</h3>
        <div className="settings-columns"><label>{t('每日新词上限', 'New words per day')}<input type="number" min={0} max={200} value={preferences.reviewNewPerDay} onChange={(event) => setPreferences({ ...preferences, reviewNewPerDay: Math.max(0, Math.min(200, Number(event.target.value) || 0)) })} /></label>
        <label>{t('每日到期上限', 'Due cards per day')}<input type="number" min={0} max={1000} value={preferences.reviewDuePerDay} onChange={(event) => setPreferences({ ...preferences, reviewDuePerDay: Math.max(0, Math.min(1000, Number(event.target.value) || 0)) })} /></label></div>
        <p className="hint">{t('复习队列按到期时间排序，超过上限的卡会留到下一次；新词默认每天 20 个，到期默认每天 100 个。设为 0 可暂停对应队列。', 'The review queue is ordered by due time; cards over the limit stay for next time. Defaults: 20 new and 100 due cards per day. Set 0 to pause that queue.')}</p>
      </section>
      <details className="settings-group" open><summary>{t('AI 模型与接口', 'AI model and API')}</summary>
        <label>{t('服务商', 'Provider')}<select value={provider} onChange={switchProvider}>{(Object.keys(API_PRESETS) as ApiProvider[]).map((id) => <option key={id} value={id}>{id === 'custom' ? t('自定义兼容接口', 'Custom compatible API') : id === 'minimax' ? t('MiniMax（国内）', 'MiniMax (China)') : id === 'minimaxIntl' ? t('MiniMax（国际）', 'MiniMax (International)') : API_PRESETS[id].label}</option>)}</select></label>
        <label>{t('API 地址', 'API endpoint')}<input value={settings.endpoint} onChange={change('endpoint')} readOnly={provider !== 'custom'} placeholder="https://example.com/v1" /></label>
        <label>{t('模型', 'Model')}<input value={settings.model} onChange={change('model')} placeholder={API_PRESETS[provider].model || t('填写平台的模型名称', 'Enter your provider model ID')} /></label>
        <label className="setting-check"><input type="checkbox" checked={Boolean(settings.allowPrivateNetwork)} onChange={(event) => { setSettings({ ...settings, allowPrivateNetwork: event.target.checked }); setNotice(''); setTestNotice(''); }} />{t('允许本机/局域网 HTTP 接口（仅私有地址）', 'Allow local/LAN HTTP endpoints (private hosts only)')}</label>
        <p className="hint">{t('仅对 localhost、私有 IPv4/IPv6 和 .local/.lan/.home/.internal 域名生效；公网地址仍必须使用 HTTPS。', 'Only localhost, private IPv4/IPv6, and .local/.lan/.home/.internal hosts. Public addresses still require HTTPS.')}</p>
        {provider === 'glm' && <p className="hint">{t('使用智谱开放平台的通用 API 密钥；模型可以改为你账户已开通的型号。', 'Use a standard Zhipu API key and a model available to your account.')}</p>}
        {provider === 'openrouter' && <p className="hint">{t('填写 OpenRouter 密钥和完整模型 ID，例如 openai/gpt-4o-mini。查询会经 OpenRouter 转交模型提供方；请选择支持 JSON 输出的模型。默认模型并非免费，不自动切换其他模型。', 'Use an OpenRouter key and a full model ID, such as openai/gpt-4o-mini. Queries pass through OpenRouter to the model provider. Choose a model supporting JSON output. The default is not free; no automatic model fallback is added.')}</p>}
        {(provider === 'minimax' || provider === 'minimaxIntl') && <p className="hint">{t('国内站和国际站请分别使用对应平台的通用 API 密钥。默认 MiniMax-M3 关闭思考；其他思考型号可能更慢、费用更高。模型名称可改为账户支持的型号，返回 JSON 后仍会校验。', 'Use the API key for the selected China or international platform. The default MiniMax-M3 disables thinking; other reasoning models may be slower and cost more. Model IDs remain editable, and returned JSON is always validated.')}</p>}
        <label>{t('API 密钥', 'API key')}<input type="password" value={settings.apiKey} onChange={change('apiKey')} placeholder={t('粘贴此服务商的 API 密钥', 'Paste this provider’s API key')} autoComplete="off" spellCheck={false} /></label>
        <p className="security-note">{t('密钥仅保存在本机扩展存储中，不随收藏导出。客户端密钥不能视为绝对安全；请勿在不可信设备使用，并可随时在服务商平台撤销。当前为自带密钥直连模式。', 'Keys stay in local extension storage and are excluded from exports. Client-side keys are not absolutely secure. Avoid untrusted devices and revoke keys at your provider when needed. This version connects directly using your key.')}</p>
        <p className="hint">{t('公开版若提供官方统一密钥，必须通过后端代理，不能把密钥打包进插件；个人密钥经后端也不天然更安全。', 'A public version offering a shared service key must use a backend proxy, never bundle that key. Routing personal keys through a backend is not automatically safer.')}</p>
        <div className="settings-test-row"><button onClick={test} aria-describedby="api-test-status" disabled={!settings.apiKey.trim() || !settings.endpoint.trim() || !settings.model.trim()}>{t('测试连接', 'Test connection')}</button><p id="api-test-status" className="notice" role="status">{testNotice}</p></div>
      </details>
      <section className="settings-group"><h3>{t('隐私与历史', 'Privacy and history')}</h3>
        <p className="privacy-note">{t('只有主动查询才向所选 AI 发送内容：词语仅附所在句子（上下文最多 1000 字符），句段只发选区。不上传整篇文章或 PDF，网址、标题和文件名不发给模型。', 'Only active queries send text to your selected AI. Words use their sentence (context capped at 1000 characters); sentences and paragraphs use only your selection. Full articles, PDFs, URLs, titles, and filenames are not sent to the model.')}</p>
        <label className="setting-check"><input type="checkbox" checked={preferences.saveQueryHistory} onChange={(event) => setPreferences({ ...preferences, saveQueryHistory: event.target.checked })} />{t('保存查询历史（默认关闭）', 'Save query history (off by default)')}</label>
        <p className="hint">{t('只记录成功查询的选区与来源，最多保留最近 200 条；不记录浏览过的网页，也不影响主动收藏。', 'Stores up to 200 successful selections and their sources locally, not your browsing history. Favorites are independent.')}</p>
        <label className="setting-check"><input type="checkbox" checked={preferences.saveReadingProgress} onChange={(event) => setPreferences({ ...preferences, saveReadingProgress: event.target.checked })} />{t('保存本地 PDF、阅读进度与最近打开记录', 'Save local PDFs, reading progress, and recent documents')}</label>
        <p className="hint">{t('关闭后，新打开的 PDF 只在当前页面保留，不自动恢复或保存进度。已有历史和收藏不会被删除；重新开启后请重新打开文件以保存。', 'When off, newly opened PDFs stay in this tab only; no automatic resume or progress updates. Existing history and favorites are not deleted. Reopen a file after enabling to save it.')}</p>
      </section>
      <details className="settings-group"><summary>{t('允许工作的站点', 'Allowed websites')}</summary>
        <label>{t('站点范围', 'Website scope')}<select value={preferences.siteMode} onChange={(event) => setPreferences({ ...preferences, siteMode: event.target.value as 'all' | 'allowlist' })}><option value="all">{t('所有普通网页，排除名单除外', 'All regular websites, except exclusions')}</option><option value="allowlist">{t('仅允许名单中的站点', 'Only allowlisted websites')}</option></select></label>
        <label>{t('允许名单', 'Allowlist')}<textarea value={allowedSites} onChange={(event) => setAllowedSites(event.target.value)} placeholder={'example.com\nnews.example.org'} rows={3} spellCheck={false} /></label>
        <label>{t('排除名单（优先于允许名单）', 'Exclusions (override allowlist)')}<textarea value={blockedSites} onChange={(event) => setBlockedSites(event.target.value)} placeholder="private.example.com" rows={3} spellCheck={false} /></label>
        <p className="hint">{t('每行一个域名，同时覆盖其子域名；允许名单为空时，不在任何网页工作。PDF 不受名单限制。此设置控制插件响应，不收回浏览器授予的站点权限；可在扩展管理页另行调整。', 'One hostname per line, including its subdomains. An empty allowlist disables all websites. Local PDFs are unaffected. This controls reader activity, not browser-granted permissions; manage those on the extensions page.')}</p>
      </details>
      <div className="settings-actions"><button onClick={save}>{t('保存并返回', 'Save and return')}</button><button className="quiet" onClick={onCancel}>{t('返回，不保存', 'Cancel without saving')}</button></div>
    </fieldset>
    <p className="hint">{t('清空密钥并保存，可回到离线演示模式。设置仅在保存后生效。', 'Clear the key and save to use offline demo mode. Changes apply only after saving.')}</p>
    {notice && <p className="notice" role="status">{notice}</p>}
  </section>;
}
