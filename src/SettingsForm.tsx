import { useEffect, useState, type ChangeEvent } from 'react';
import type { ApiSettings } from './types';
import { API_PRESETS, DEFAULT_API_SETTINGS, SETTINGS_KEY, providerForEndpoint, selectApiProvider, type ApiProvider } from './api-settings';
import './settings.css';

export function SettingsForm({ onSaved, onCancel }: { onSaved: () => void; onCancel: () => void }) {
  const [settings, setSettings] = useState(DEFAULT_API_SETTINGS);
  const [provider, setProvider] = useState<ApiProvider>('openai');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    chrome.storage.local.get(SETTINGS_KEY).then((stored) => {
      const config = { ...DEFAULT_API_SETTINGS, ...(stored[SETTINGS_KEY] as Partial<ApiSettings> | undefined) };
      setSettings(config);
      setProvider(providerForEndpoint(config.endpoint));
    }).catch(() => setNotice('读取配置失败，请重新打开设置。')).finally(() => setLoading(false));
  }, []);
  const change = (field: keyof ApiSettings) => (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    // Changing a destination must not carry a different provider's credential along.
    setSettings({ ...settings, [field]: value, ...(field === 'endpoint' ? { apiKey: '' } : {}) });
    setNotice('');
  };
  const switchProvider = (event: ChangeEvent<HTMLSelectElement>) => {
    const selected = event.target.value as ApiProvider;
    setProvider(selected);
    setSettings(selectApiProvider(selected));
    setNotice('请填写此服务商的 API 密钥，再测试连接并保存。');
  };
  const save = async () => {
    setBusy(true); setNotice('正在保存…');
    try { await chrome.storage.local.set({ [SETTINGS_KEY]: settings }); onSaved(); }
    catch { setNotice('保存失败，请重试。'); }
    finally { setBusy(false); }
  };
  const test = async () => {
    setBusy(true); setNotice('正在测试连接与解释格式…');
    try {
      const result = await chrome.runtime.sendMessage({ type: 'test-api', settings });
      setNotice(result?.ok ? '连接和解释格式正常。点击“保存并返回”后生效。' : result?.error ?? '测试失败，请重试。');
    } catch { setNotice('扩展连接中断，请重新加载扩展后重试。'); }
    finally { setBusy(false); }
  };
  return <section className="settings-form" aria-label="模型连接设置">
    <p className="eyebrow">AI CONTEXT READER</p><h2>你的模型连接</h2>
    <p>选择服务商，填写该平台的 API 密钥。密钥仅保存在本机扩展存储中，不会随收藏导出。</p>
    <fieldset disabled={loading || busy}>
      <label>服务商<select value={provider} onChange={switchProvider}>{(Object.keys(API_PRESETS) as ApiProvider[]).map((id) => <option key={id} value={id}>{API_PRESETS[id].label}</option>)}</select></label>
      <label>API 地址<input value={settings.endpoint} onChange={change('endpoint')} readOnly={provider !== 'custom'} placeholder="https://example.com/v1" /></label>
      <label>模型<input value={settings.model} onChange={change('model')} placeholder={API_PRESETS[provider].model || '填写平台的模型名称'} /></label>
      {provider === 'glm' && <p className="hint">使用智谱开放平台的通用 API 密钥；模型可以改为你账户已开通的型号。</p>}
      <label>API 密钥<input type="password" value={settings.apiKey} onChange={change('apiKey')} placeholder="粘贴此服务商的 API 密钥" autoComplete="off" spellCheck={false} /></label>
      <div className="settings-actions"><button onClick={test} disabled={!settings.apiKey.trim() || !settings.endpoint.trim() || !settings.model.trim()}>测试连接</button><button onClick={save}>保存并返回</button><button className="quiet" onClick={onCancel}>返回，不保存</button></div>
    </fieldset>
    <p className="hint">清空密钥并保存，可回到离线演示模式。真实解释会将选中文字和附近上下文发送给所选服务商。</p>
    {notice && <p className="notice" role="status">{notice}</p>}
  </section>;
}
