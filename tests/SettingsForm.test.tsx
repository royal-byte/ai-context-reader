import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { SettingsForm } from '../src/SettingsForm';
import { DEFAULT_API_SETTINGS, SETTINGS_KEY } from '../src/api-settings';

const hooks = vi.hoisted(() => ({ values: [] as unknown[], notices: vi.fn() }));
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useEffect: () => {},
  useState: () => [hooks.values.shift(), hooks.notices]
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
  expect(set).toHaveBeenCalledWith({ [SETTINGS_KEY]: { ...DEFAULT_API_SETTINGS, apiKey: '' } });
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
