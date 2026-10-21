import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestExplanation } from '../src/api';
import { API_PRESETS, providerForEndpoint, selectApiProvider, type ApiProvider } from '../src/api-settings';

const explanation = { definition: '能够恢复的', translation: '有韧性的', explanation: '这里指系统故障后恢复的能力。', examples: ['A resilient system recovers quickly.'], lemma: 'resilient', partOfSpeech: '形容词', phonetic: '/rɪˈzɪljənt/' };
const response = () => new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(explanation) } }] }));
afterEach(() => vi.unstubAllGlobals());

describe('provider support', () => {
  it.each(['word', 'phrase', 'sentence', 'paragraph'] as const)('sends %s instructions to the model and checks the corresponding fields', async (mode) => {
    const full = { ...explanation, usage: '搭配说明', structure: ['主干'], keyPoints: ['要点'] };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(full) } }] })));
    vi.stubGlobal('fetch', fetchMock);
    await requestExplanation({ ...selectApiProvider('deepseek'), apiKey: 'test-only-key' }, 'selected text', 'context', mode);
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.messages[0].content).toContain(`${mode.toUpperCase()} mode`);
    if (mode === 'word') expect(body.messages[0].content).toContain('General American IPA');
    expect(body.messages[1].content).toContain(`Reading mode: ${mode}`);
    expect(body.max_tokens).toBe(mode === 'paragraph' ? 2048 : 1024);
  });
  it.each(['openai', 'glm', 'deepseek', 'openrouter', 'minimax', 'minimaxIntl'] as const)('requests and parses %s explanations', async (provider) => {
    const fetchMock = vi.fn().mockResolvedValue(response());
    vi.stubGlobal('fetch', fetchMock);
    const settings = { ...selectApiProvider(provider), apiKey: 'test-only-key' };
    expect(await requestExplanation(settings, 'resilient', 'A resilient system recovers.')).toEqual(explanation);
    const [endpoint, init] = fetchMock.mock.calls[0]!;
    expect(endpoint).toBe(`${API_PRESETS[provider].endpoint}/chat/completions`);
    expect(init.headers.Authorization).toBe('Bearer test-only-key');
    expect(init.redirect).toBe('error');
    const body = JSON.parse(init.body);
    expect(body.model).toBe(API_PRESETS[provider].model);
    const minimax = provider === 'minimax' || provider === 'minimaxIntl';
    expect(body.response_format).toEqual(minimax ? undefined : { type: 'json_object' });
    expect(body.reasoning_split).toBe(minimax ? true : undefined);
    expect(body.provider).toEqual(provider === 'openrouter' ? { require_parameters: true } : undefined);
    expect(body.max_completion_tokens).toBe(minimax ? 1024 : undefined);
    expect(body.max_tokens).toBe(minimax ? undefined : 1024);
    expect(body.messages[1].content).toContain('A resilient system recovers.');
    expect(body.thinking).toEqual(['openai', 'openrouter'].includes(provider) ? undefined : { type: 'disabled' });
    expect(init.headers).not.toHaveProperty('HTTP-Referer');
    expect(body.stream).toBe(false);
  });

  it.each(Object.keys(API_PRESETS) as ApiProvider[])('switching to %s starts with no credential', (provider) => {
    expect(selectApiProvider(provider).apiKey).toBe('');
  });

  it('recognizes old settings by exact hostname without trusting lookalikes', () => {
    expect(providerForEndpoint('https://open.bigmodel.cn/api/paas/v4/chat/completions')).toBe('glm');
    expect(providerForEndpoint('https://api.deepseek.com/v1')).toBe('deepseek');
    expect(providerForEndpoint('https://api.deepseek.com.other.example/v1')).toBe('custom');
    expect(providerForEndpoint('https://openrouter.ai/api/v1/chat/completions')).toBe('openrouter');
    expect(providerForEndpoint('https://openrouter.ai.evil.example/api/v1')).toBe('custom');
    expect(providerForEndpoint('https://api.minimax.cn/v1')).toBe('minimax');
    expect(providerForEndpoint('https://api.minimaxi.com/v1')).toBe('minimax');
    expect(providerForEndpoint('https://api.minimax.io/v1')).toBe('minimaxIntl');
    expect(providerForEndpoint('https://api.minimax.io.evil.example/v1')).toBe('custom');
    expect(providerForEndpoint('unfinished')).toBe('custom');
  });

  it('keeps full custom endpoints and custom models usable', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response());
    vi.stubGlobal('fetch', fetchMock);
    await requestExplanation({ endpoint: 'https://custom.example/v1/chat/completions/', model: 'my-model', apiKey: 'test-only-key' }, 'text', 'context');
    expect(fetchMock.mock.calls[0]![0]).toBe('https://custom.example/v1/chat/completions');
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.model).toBe('my-model');
    expect(body).not.toHaveProperty('thinking');
  });

  it.each(['MiniMax-M3.1-Flash', 'MiniMax-M2.7'])('separates reasoning without trying to disable mandatory thinking (%s)', async (model) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ base_resp: { status_code: 0 }, choices: [{ message: { reasoning_content: 'Private reasoning, not a JSON answer.', content: JSON.stringify(explanation) }, finish_reason: 'stop' }] })));
    vi.stubGlobal('fetch', fetchMock);
    expect(await requestExplanation({ ...selectApiProvider('minimax'), model, apiKey: 'test-only-key' }, 'resilient', 'A resilient system recovers.')).toEqual(explanation);
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.reasoning_split).toBe(true);
    expect(body).not.toHaveProperty('thinking');
    expect(body).not.toHaveProperty('response_format');
    expect(body.reasoning_effort).toBe(model === 'MiniMax-M3.1-Flash' ? 'low' : undefined);
    expect(body.max_completion_tokens).toBe(4096);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('reports MiniMax business failures inside HTTP 200 without exposing server text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ base_resp: { status_code: 1004, status_msg: 'do not echo test-only-key' } }))));
    const task = requestExplanation({ ...selectApiProvider('minimax'), apiKey: 'test-only-key' }, 'resilient', 'context');
    await expect(task).rejects.toThrow('业务码 1004');
    await expect(task).rejects.not.toThrow('test-only-key');
  });

  it('explains incompatible OpenRouter model routes and does not silently retry or switch models', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('private server details', { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(requestExplanation({ ...selectApiProvider('openrouter'), apiKey: 'test-only-key' }, 'resilient', 'context')).rejects.toThrow('支持 JSON 输出');
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

describe('connection failures', () => {
  const settings = { ...selectApiProvider('glm'), apiKey: 'test-only-key' };
  it.each([
    ['bad address', '地址无效'],
    ['http://remote.example/v1', 'HTTPS'],
    ['https://user:password@remote.example/v1', '账号'],
    ['https://remote.example/v1?api_key=secret', '查询参数']
  ])('rejects %s before sending a credential', async (endpoint, hint) => {
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    await expect(requestExplanation({ ...settings, endpoint }, 'text', 'context')).rejects.toThrow(hint);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([[401, '密钥无效'], [402, '余额不足'], [404, '模型不存在'], [429, '额度不足']] as const)('explains HTTP %s without exposing server details', async (status, hint) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('do not echo test-only-key', { status })));
    await expect(requestExplanation(settings, 'text', 'context')).rejects.toThrow(hint);
  });

  it('reports timeout instead of waiting indefinitely', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('timed out', 'TimeoutError')));
    await expect(requestExplanation(settings, 'text', 'context')).rejects.toThrow('45 秒');
  });

  it('rejects malformed or truncated model output', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ finish_reason: 'length', message: { content: '{' } }] })));
    vi.stubGlobal('fetch', fetchMock);
    await expect(requestExplanation(settings, 'text', 'context')).rejects.toThrow('definition');
    await expect(requestExplanation(settings, 'text', 'context')).rejects.toThrow('截断');
  });
});
