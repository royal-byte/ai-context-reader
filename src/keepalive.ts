/**
 * MV3 service workers can be reclaimed after roughly 30 seconds of inactivity.
 * A connected port with periodic traffic keeps the worker alive for the short
 * lifetime of a model request. This is a best-effort compatibility shim; the
 * request still has a 25 second abort timeout.
 */
export function keepServiceWorkerAlive() {
  let port: chrome.runtime.Port | undefined;
  try { port = chrome.runtime.connect?.({ name: 'api-keepalive' }); } catch { return () => {}; }
  if (!port) return () => {};
  const timer = setInterval(() => {
    try { port?.postMessage('ping'); } catch { /* The worker or tab went away. */ }
  }, 10_000);
  return () => {
    clearInterval(timer);
    try { port?.disconnect(); } catch { /* Already disconnected. */ }
  };
}
