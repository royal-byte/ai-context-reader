import type { ApiSettings } from './types';

export const API_PRESETS = {
  openai: { label: 'OpenAI', endpoint: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  glm: { label: 'GLM（智谱）', endpoint: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4.7' },
  deepseek: { label: 'DeepSeek', endpoint: 'https://api.deepseek.com', model: 'deepseek-flash' },
  openrouter: { label: 'OpenRouter', endpoint: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o-mini' },
  minimax: { label: 'MiniMax（国内）', endpoint: 'https://api.minimax.cn/v1', model: 'MiniMax-M3' },
  minimaxIntl: { label: 'MiniMax（国际）', endpoint: 'https://api.minimax.io/v1', model: 'MiniMax-M3' },
  custom: { label: '自定义兼容接口', endpoint: '', model: '' }
};
export type ApiProvider = keyof typeof API_PRESETS;
export const SETTINGS_KEY = 'byol-settings';
export const DEFAULT_API_SETTINGS: ApiSettings = {
  endpoint: API_PRESETS.openai.endpoint, model: API_PRESETS.openai.model, apiKey: '', allowPrivateNetwork: false
};

export function normalizeApiSettings(value: unknown): ApiSettings {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    endpoint: typeof input.endpoint === 'string' ? input.endpoint : DEFAULT_API_SETTINGS.endpoint,
    model: typeof input.model === 'string' ? input.model : DEFAULT_API_SETTINGS.model,
    apiKey: typeof input.apiKey === 'string' ? input.apiKey : '',
    allowPrivateNetwork: input.allowPrivateNetwork === true
  };
}

export function providerForEndpoint(endpoint: string): ApiProvider {
  try {
    const hostname = new URL(endpoint).hostname;
    if (hostname === 'api.openai.com') return 'openai';
    if (hostname === 'open.bigmodel.cn') return 'glm';
    if (hostname === 'api.deepseek.com') return 'deepseek';
    if (hostname === 'openrouter.ai') return 'openrouter';
    if (['api.minimax.cn', 'api.minimaxi.com'].includes(hostname)) return 'minimax';
    if (hostname === 'api.minimax.io') return 'minimaxIntl';
  } catch { /* An unfinished custom address remains editable. */ }
  return 'custom';
}

export function selectApiProvider(provider: ApiProvider): ApiSettings {
  const { endpoint, model } = API_PRESETS[provider];
  return { endpoint, model, apiKey: '', allowPrivateNetwork: false };
}
