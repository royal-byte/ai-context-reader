import { afterEach, expect, it, vi } from 'vitest';
import { openWorkspace } from '../src/workspace';
afterEach(() => vi.unstubAllGlobals());
it.each([false, true])('opens or reuses the reading workspace (existing=%s)', async (existing) => {
  const url = 'chrome-extension://test/pdf.html';
  const create = vi.fn(); const update = vi.fn(); const focus = vi.fn();
  vi.stubGlobal('chrome', { runtime: { getURL: () => url }, tabs: { query: async () => existing ? [{ id: 9, windowId: 2, url }] : [], create, update }, windows: { update: focus } });
  await openWorkspace();
  if (existing) { expect(update).toHaveBeenCalledWith(9, { active: true }); expect(focus).toHaveBeenCalledWith(2, { focused: true }); expect(create).not.toHaveBeenCalled(); }
  else expect(create).toHaveBeenCalledWith({ url });
});
