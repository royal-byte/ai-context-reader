export async function openWorkspace() {
  const url = chrome.runtime.getURL('/pdf.html');
  const tabs = await chrome.tabs.query({});
  const existing = tabs.find((tab) => tab.url?.split('#')[0] === url);
  if (existing?.id !== undefined) {
    await chrome.tabs.update(existing.id, { active: true });
    if (existing.windowId !== undefined) await chrome.windows.update(existing.windowId, { focused: true });
  } else await chrome.tabs.create({ url });
}
