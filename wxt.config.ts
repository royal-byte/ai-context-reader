import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'AI Context Reader',
    description: 'Select text on a page to understand it in context.',
    permissions: ['storage', 'downloads', 'tabs'],
    host_permissions: ['<all_urls>'],
    content_security_policy: { extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'" },
    action: { default_title: '打开 AI Context Reader 阅读工作台' }
  }
});
