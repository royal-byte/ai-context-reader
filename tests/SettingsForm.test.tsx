import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import { SettingsForm } from '../src/SettingsForm';
import { DEFAULT_API_SETTINGS, SETTINGS_KEY } from '../src/api-settings';
import { DEFAULT_PREFERENCES, PREFERENCES_KEY } from '../src/preferences';

const hooks = vi.hoisted(() => ({ values: [] as unknown[], notices: vi.fn() }));
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useEffect: () => {},
  useState: (initial: unknown) => [hooks.values.length ? hooks.values.shift() : initial, hooks.notices]
}));
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
