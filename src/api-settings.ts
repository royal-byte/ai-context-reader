import type { ApiSettings } from './types';

export const API_PRESETS = {
  openai: { label: 'OpenAI', endpoint: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  glm: { label: 'GLM（智谱）', endpoint: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4.7' },
  deepseek: { label: 'DeepSeek', endpoint: 'https://api.deepseek.com', model: 'deepseek-flash' },
  custom: { label: '自定义兼容接口', endpoint: '', model: '' }
};
export type ApiProvider = keyof typeof API_PRESETS;
export const SETTINGS_KEY = 'byol-settings';
export const DEFAULT_API_SETTINGS: ApiSettings = {
  endpoint: API_PRESETS.openai.endpoint, model: API_PRESETS.openai.model, apiKey: ''
};

export function providerForEndpoint(endpoint: string): ApiProvider {
  try {
    const hostname = new URL(endpoint).hostname;
    if (hostname === 'api.openai.com') return 'openai';
    if (hostname === 'open.bigmodel.cn') return 'glm';
    if (hostname === 'api.deepseek.com') return 'deepseek';
  } catch { /* An unfinished custom address remains editable. */ }
  return 'custom';
}

export function selectApiProvider(provider: ApiProvider): ApiSettings {
  const { endpoint, model } = API_PRESETS[provider];
  return { endpoint, model, apiKey: '' };
}
