import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SettingsForm } from '../src/SettingsForm';
import { DEFAULT_API_SETTINGS, SETTINGS_KEY } from '../src/api-settings';
import { DEFAULT_PREFERENCES, PREFERENCES_KEY } from '../src/preferences';

const hooks = vi.hoisted(() => ({ values: [] as unknown[], notices: vi.fn(), testNotices: vi.fn(), cursor: 0 }));
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useEffect: () => {},
  useState: (initial: unknown) => [hooks.values.length ? hooks.values.shift() : initial, hooks.cursor++ === 8 ? hooks.testNotices : hooks.notices]
}));
beforeEach(() => { hooks.cursor = 0; hooks.values = []; });
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

function button(tree: ReactNode, label: string): ReactElement<{ onClick: () => Promise<void> }> | undefined {
  for (const node of Children.toArray(tree)) {
    if (!isValidElement<{ children?: ReactNode }>(node)) continue;
    if (node.type === 'button' && node.props.children === label) return node as ReactElement<{ onClick: () => Promise<void> }>;
    const found = button(node.props.children, label);
    if (found) return found;
  }
}

it.each([false, true])('returns only after successful persistence (storage fails=%s)', async (fails) => {
  hooks.values = [{ ...DEFAULT_API_SETTINGS, apiKey: '' }, 'openai', '', false, false];
  let complete!: () => void;
  const pending = new Promise<void>((resolve, reject) => { complete = () => fails ? reject(new Error('quota')) : resolve(); });
  const set = vi.fn(() => pending);
  vi.stubGlobal('chrome', { storage: { local: { set } } });
  const onSaved = vi.fn();
  const save = button(SettingsForm({ onSaved, onCancel: vi.fn() }), '保存并返回')!;
  const task = save.props.onClick();
  expect(onSaved).not.toHaveBeenCalled();
  expect(set).toHaveBeenCalledWith({ [SETTINGS_KEY]: { ...DEFAULT_API_SETTINGS, apiKey: '' }, [PREFERENCES_KEY]: DEFAULT_PREFERENCES });
  complete();
  await task;
  expect(onSaved).toHaveBeenCalledTimes(fails ? 0 : 1);
  if (fails) expect(hooks.notices).toHaveBeenCalledWith('保存失败，请重试。');
});

it('can return without saving or testing the connection', async () => {
  hooks.values = [DEFAULT_API_SETTINGS, 'openai', '', false, false];
  const onCancel = vi.fn();
  const set = vi.fn();
  vi.stubGlobal('chrome', { storage: { local: { set } } });
  await button(SettingsForm({ onSaved: vi.fn(), onCancel }), '返回，不保存')!.props.onClick();
  expect(onCancel).toHaveBeenCalledOnce();
  expect(set).not.toHaveBeenCalled();
});

it('rejects an invalid site list without overwriting API or reading settings', async () => {
  hooks.values = [DEFAULT_API_SETTINGS, 'openai', '', false, false, DEFAULT_PREFERENCES, 'https://example.com/private', ''];
  const set = vi.fn(); const onSaved = vi.fn();
  vi.stubGlobal('chrome', { storage: { local: { set } } });
  await button(SettingsForm({ onSaved, onCancel: vi.fn() }), '保存并返回')!.props.onClick();
  expect(set).not.toHaveBeenCalled();
  expect(onSaved).not.toHaveBeenCalled();
  expect(hooks.notices).toHaveBeenCalledWith(expect.stringContaining('站点仅填写域名'));
});

it('offers the new providers and keeps provider routing and key guidance visible', () => {
  hooks.values = [];
  const markup = renderToStaticMarkup(SettingsForm({ onSaved: vi.fn(), onCancel: vi.fn() }));
  expect(markup).toContain('value="openrouter"');
  expect(markup).toContain('value="minimax"');
  expect(markup).toContain('value="minimaxIntl"');
});

it.each(['连接和解释格式正常。点击“保存并返回”后生效。', 'API 请求失败（429）。', '正在测试连接与解释格式…'])('places test feedback beside the connection button, not at the form footer (%s)', (message) => {
  hooks.values = [DEFAULT_API_SETTINGS, 'openai', '', false, false, DEFAULT_PREFERENCES, '', '', message];
  const markup = renderToStaticMarkup(SettingsForm({ onSaved: vi.fn(), onCancel: vi.fn() }));
  const row = markup.match(/<div class="settings-test-row"[\s\S]*?<\/div>/)?.[0];
  expect(row).toContain('测试连接'); expect(row).toContain(message);
  expect(row).toContain('role="status"');
  expect(markup.slice(markup.indexOf('</fieldset>'))).not.toContain(message);
});

it('keeps persistence errors at the form footer rather than the connection row', () => {
  hooks.values = [DEFAULT_API_SETTINGS, 'openai', '保存失败，请重试。', false, false, DEFAULT_PREFERENCES, '', '', ''];
  const markup = renderToStaticMarkup(SettingsForm({ onSaved: vi.fn(), onCancel: vi.fn() }));
  expect(markup.slice(markup.indexOf('</fieldset>'))).toContain('保存失败，请重试。');
  expect(markup.match(/<div class="settings-test-row"[\s\S]*?<\/div>/)?.[0]).not.toContain('保存失败');
});

it.each([true, false])('updates only the connection status while testing (ok=%s)', async (ok) => {
  hooks.values = [{ ...DEFAULT_API_SETTINGS, apiKey: 'test-only-key' }, 'openai', '', false, false];
  vi.stubGlobal('chrome', { runtime: { sendMessage: vi.fn(async () => ({ ok, error: ok ? undefined : 'API 请求失败（429）。' })) } });
  await button(SettingsForm({ onSaved: vi.fn(), onCancel: vi.fn() }), '测试连接')!.props.onClick();
  expect(hooks.testNotices).toHaveBeenCalledWith('正在测试连接与解释格式…');
  expect(hooks.testNotices).toHaveBeenLastCalledWith(ok ? '连接和解释格式正常。点击“保存并返回”后生效。' : 'API 请求失败（429）。');
  expect(hooks.notices).not.toHaveBeenCalledWith(expect.any(String));
});
