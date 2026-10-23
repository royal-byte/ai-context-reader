# AI Context Reader

[English](README.md) · **简体中文**

[![CI](https://github.com/royal-byte/ai-context-reader/actions/workflows/ci.yml/badge.svg)](https://github.com/royal-byte/ai-context-reader/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Manifest V3](https://img.shields.io/badge/manifest-v3-315a46.svg)](https://developer.chrome.com/docs/extensions/develop/migrate)

**一个开源的、本地优先的 Chrome / Edge 英文阅读上下文助手。**

在网页、PDF 或 EPUB 中选中单词、短语、句子或段落，AI Context Reader 会解释它**在当前语境中的意思**，并把标准词典义和语境义分开显示。你可以保存、写笔记，并用间隔复习回顾读过的内容。

无需账号、无后端、无遥测。使用自己的 API Key，或先用离线演示模式体验界面。

[功能](#功能) · [安装](#安装) · [隐私](#隐私) · [架构](ARCHITECTURE.md) · [参与贡献](CONTRIBUTING.md) · [许可证](#许可证)

---

## 为什么

大多数阅读工具给你一整页词典释义。AI Context Reader 只想回答一个更窄的问题：

> **这个词在这里到底是什么意思？**

它把信息分成三层：

- **标准释义** — 常见词典义；本地词典有收录时优先使用本地结果。
- **语境义** — 这个词或短语在当前句子、段落中的意思。
- **解释** — 为什么这里应该取这个语境义。

最终是一张紧凑的卡片，而不是一整页词典。

---

## 功能

### 结合上下文的解释

- 支持单词、短语、句子和段落选区。
- 使用有长度上限的 **Context Packet**：所在句、前后句、段落片段、章节标题（有则带）。
- 要求模型选择当前语境下的含义，而不是罗列所有词典义。
- 标准义与语境义分开显示。
- 长选区做摘要，不会被当成一个“单词”处理。

### 本地优先的词典

- 内置 20,000 词 ECDICT 高频子集。
- 中文释义、IPA、词性。
- 多词性按词性分组。
- 常见异音词按词性显示不同音标。
- 本地没有收录时，才回退到 AI 释义。
- 页面加载时预加载词典，首次双击不会因为词典 JSON 加载而看起来像在等 AI。

### 三种阅读场景

- **网页** — 普通文章、文档页面中的划词解释。
- **PDF** — 翻页、适合页面、夜间模式、目录、右侧解释栏。
- **EPUB** — 章节导航、字号调节、图片、章节进度、划词解释。
- 本地文件和阅读进度只保存在本机。

### 笔记与本文词汇

- 每条已保存语境可以写一条简短笔记。
- 网页右下角的 **本文词汇** 抽屉会列出当前文章查过的单词和短语。
- 笔记随收藏保存，失焦自动保存。
- 笔记会进入生词库、搜索、CSV/Anki 导出和复习答案。

### 复习

- 本地 SM-2 风格间隔复习。
- 每日新词/到期卡上限。
- 键盘操作：`Space` 显示答案，`1–4` 评分，`U` 撤销。
- “没想起来”会在本次会话末尾再出现一次。
- 显示进度、撤销和会话总结。
- 意义回忆：单词保持可见，例句中高亮该词，问的是含义，不是拼写。

### 自带 API Key

- 直连 OpenAI 兼容服务商。
- 不把 API Key 打包进扩展。
- 服务商和模型可配置。
- Key 只保存在本机扩展存储中，不随导出泄露。
- 没有 Key 也可以使用演示模式。

---

## 工作方式

```text
网页 / PDF / EPUB 选区
        │
        ▼
  Context Packet v2
  所在句 + 前后句 + 段落 + 标题
        │
        ▼
  后台 service worker ──────────► 所选 AI 服务商
        │                              （BYOK，直连）
        ▼
  ReaderCard
  标准释义 · 语境义 · 解释 · 笔记
        │
        ▼
  本地 Dexie / IndexedDB
  收藏 · 语境 · 笔记 · 复习计划
```

页面本身拿不到 API Key。只有后台 service worker 会发送模型请求。扩展不会把 URL、页面标题或文件名发给模型。

更多细节：[ARCHITECTURE.md](ARCHITECTURE.md)。

---

## 安装

### 使用 Release

1. 打开 [Releases](https://github.com/royal-byte/ai-context-reader/releases)。
2. 下载最新的 `ai-context-reader-*.zip`。
3. 解压。
4. Edge 打开 `edge://extensions`；Chrome 打开 `chrome://extensions`。
5. 开启 **开发者模式**。
6. 点击 **加载解压缩的扩展**，选择包含 `manifest.json` 的文件夹。
7. 更新后重新加载扩展。

要求 Chromium / Edge 120+。

### 从源码构建

```bash
npm install
npm run build
```

然后把 `.output/chrome-mv3` 作为解压缩扩展加载。

开发模式：

```bash
npm run dev
```

---

## 配置

打开工作台 → **设置** → **AI 模型与接口**。

| 服务商          | 默认地址                               | 默认模型             |
| --------------- | -------------------------------------- | -------------------- |
| OpenAI          | `https://api.openai.com/v1`            | `gpt-4o-mini`        |
| DeepSeek        | `https://api.deepseek.com`             | `deepseek-flash`     |
| GLM（智谱）     | `https://open.bigmodel.cn/api/paas/v4` | `glm-4.7`            |
| OpenRouter      | `https://openrouter.ai/api/v1`         | `openai/gpt-4o-mini` |
| MiniMax（国内） | `https://api.minimax.cn/v1`            | `MiniMax-M3`         |
| MiniMax（国际） | `https://api.minimax.io/v1`            | `MiniMax-M3`         |
| 自定义          | 你的兼容接口                           | 你的模型             |

自定义接口可以使用 HTTPS；在设置中显式允许后，也可以使用 localhost / 私有局域网的 HTTP 地址。也支持填写完整的 `/chat/completions` 地址。

扩展会要求 JSON 输出并校验字段。密钥错误、余额不足、权限不足、模型不存在、限流等错误会分别提示。

---

## 隐私

- 无账号、无后端、无分析、无遥测。
- 只有主动查询才会把选区发给模型。
- 上下文有长度上限：词语只带所在句；句子和段落只带选区。
- 不把 URL、页面标题、本地文件名发给模型。
- API Key 只保存在本机扩展存储中，不进入导出文件。
- 收藏、语境、笔记、复习数据、PDF、EPUB 进度都保存在本机 IndexedDB。
- 查询历史默认关闭。
- PDF/EPUB 文件本身不会离开设备。

客户端 API Key 并不等同于安全的服务端密钥。请在可信设备上使用；如怀疑泄露，请到服务商平台撤销。

完整说明：[PRIVACY.md](PRIVACY.md)。安全说明：[SECURITY.md](SECURITY.md)。

---

## 技术栈

- Chrome / Edge Manifest V3
- WXT
- React 19
- TypeScript
- Dexie / IndexedDB
- PDF.js
- JSZip
- Vitest

---

## 开发

```bash
npm install
npm test
npm run typecheck
npm run build
npm run zip
```

- `npm test`：运行 Vitest 测试。
- `npm run typecheck`：TypeScript 类型检查。
- `npm run build`：生成可加载的扩展。
- `npm run zip`：生成可发布的压缩包。

目录：

```text
entrypoints/        content script、后台 worker、PDF/EPUB 工作台
src/                阅读卡片、词典、API、存储、复习、笔记
public/dictionary/  ECDICT 子集与许可证
public/pdfjs/       打包的 PDF.js worker、cmaps、字体、wasm
tests/              单元与渲染测试
```

---

## 参与贡献

欢迎 Issue 和 Pull Request。提交较大改动前，请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。

特别欢迎：

- 可复现的 bug：浏览器、页面类型、操作步骤；
- 词典覆盖和释义改进；
- PDF/EPUB 可访问性与排版修复；
- 边界情况测试；
- 文档和翻译。

请不要在 Issue 中包含 API Key、私人文档或个人阅读数据。

安全敏感问题请按 [SECURITY.md](SECURITY.md) 私下报告，不要开公开 Issue。

---

## 已知限制

- 本地词典是 20,000 词高频子集，非常用词会回退到模型释义。
- 没有文字层的扫描版 PDF 不支持（无 OCR）。
- EPUB 不支持 DRM、固定版式还原和脚注跳转。
- 没有云同步或账号系统，数据只在本机。
- BYOK 需要你自己注册服务商并获取 API Key。
- 解释质量取决于所选模型；扩展会校验输出，但不能保证事实绝对正确。
- 扩展运行在普通 HTTP(S) 页面；浏览器内部页面、部分 canvas 编辑器和跨域 iframe 可能拿不到可选择的文字。

---

## 致谢

- [ECDICT](https://github.com/skywind3000/ECDICT) — MIT 许可证的英汉词典数据，本项目使用其高频子集。
- [PDF.js](https://mozilla.github.io/pdf.js/) — PDF 渲染和文字层。
- [JSZip](https://stuk.github.io/jszip/) — EPUB 容器解析。
- [WXT](https://wxt.dev/)、[React](https://react.dev/)、[Dexie](https://dexie.org/)、[Vitest](https://vitest.dev/)。

---

## 许可证

[MIT](LICENSE) © AI Context Reader contributors。

MIT 许可证适用于源代码。项目名称和图标不授予“官方背书”或“官方合作”的使用权；fork 请使用自己的名称和图标。
