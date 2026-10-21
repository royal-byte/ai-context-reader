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
  it.each(['openai', 'glm', 'deepseek'] as const)('requests and parses %s explanations', async (provider) => {
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
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.messages[1].content).toContain('A resilient system recovers.');
    expect(body.thinking).toEqual(provider === 'openai' ? undefined : { type: 'disabled' });
    expect(body.stream).toBe(false);
  });

  it.each(Object.keys(API_PRESETS) as ApiProvider[])('switching to %s starts with no credential', (provider) => {
    expect(selectApiProvider(provider).apiKey).toBe('');
  });

  it('recognizes old settings by exact hostname without trusting lookalikes', () => {
    expect(providerForEndpoint('https://open.bigmodel.cn/api/paas/v4/chat/completions')).toBe('glm');
    expect(providerForEndpoint('https://api.deepseek.com/v1')).toBe('deepseek');
    expect(providerForEndpoint('https://api.deepseek.com.other.example/v1')).toBe('custom');
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
