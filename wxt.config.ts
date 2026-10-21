import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'AI Context Reader',
    description: 'Select text on a page to understand it in context.',
    minimum_chrome_version: '120',
    permissions: ['storage', 'tabs'],
    host_permissions: ['http://*/*', 'https://*/*'],
    icons: { 16: 'icon/16.png', 32: 'icon/32.png', 48: 'icon/48.png', 128: 'icon/128.png' },
    content_security_policy: { extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'" },
    action: {
      default_title: '打开 AI Context Reader 阅读工作台',
      default_icon: { 16: 'icon/16.png', 32: 'icon/32.png', 48: 'icon/48.png', 128: 'icon/128.png' }
    }
  }
});
