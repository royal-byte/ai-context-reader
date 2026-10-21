# 架构与数据模型

```text
网页 / PDF 选区
       │  text + local context
内容脚本 / PDF 页面 ── chrome.runtime 消息 ── 后台 service worker
       │                                           ├─ OpenAI 兼容 API（仅后台发送）
       │                                           └─ Dexie / IndexedDB（收藏）
       └─ Shadow DOM 悬浮卡
阅读工作台 / 设置页 ────────────────────────────────┘
```

## 数据

`ReaderItem`：`selectedText`、`context`、`sourceUrl`、`sourceTitle`、解释 JSON、`createdAt`、`uniqueKey`。

`uniqueKey = 来源 URL + 规范化选区`，保存前查询它来去重。IndexedDB 保存收藏和本地 PDF；BYOL 设置单独放 Chrome 扩展本机存储，导出只读取收藏表。

## 边界

页面不能接触 API 密钥；只有后台 service worker 请求模型。Chrome 扩展存储对网页隔离，但不是操作系统密钥链：设置页明确提示用户在受保护的本机配置密钥。没有密钥时，后台返回演示解释，方便完整试用界面和收藏闭环。

## v0.2.0 自动解释与卡片

`ReaderCard` 被网页和 PDF 复用。`inferReadingMode` 以浏览器原生分句/分词和标点推断解释方式，类型只参与请求和收藏，不显示在弹窗。启发式推断有歧义，首版未引入额外分类服务。

`Explanation` 保留原四字段，新增可选的 `lemma`、`partOfSpeech`、`usage`、`structure`、`keyPoints`、`sentenceTranslation`；新请求按解释方式校验必要字段。`ReaderItem` 增加可选的 `mode` 和 `sourceSentence`，无需改变 IndexedDB 索引或迁移旧数据。

选区变化或关闭卡片时，旧请求返回值被忽略。原句仅用于理解和收藏，不在卡片里显示。同一来源选区重新收藏时更新解释并保留创建时间。

## v0.2.1 音标

`Explanation.phonetic?: string` 保存美式 IPA（例如 `/ˌʌn.dɚˈmaɪn/`）。单词请求要求模型返回该字段；解析时仅保留合理长度、无换行、以斜线包围的非空字符串。未提供或格式异常时忽略，不阻断解释。网页与 PDF 共用的卡片只在单词标题下展示，收藏和 JSON 导出沿用现有数据通路，无新增索引或数据迁移。

## v0.3.0 工作台与本地文档

- `chrome.action` → `openWorkspace` → 打开或聚焦 `pdf.html`，移除旧图标小弹窗。`Workbench` 管理导航、文档、收藏和阅读历史，复用原设置页。
- `PdfPage` 按需渲染单页 canvas + PDF.js 原生 `TextLayer`；翻页/缩放时取消旧任务，避免同时渲染整份文档。Worker、CMap、字体和 WASM 随扩展打包，渲染不走 CDN。
- Dexie v2 保留 v1 `items`，新增 `documents: id,lastOpenedAt`、`files: id`。元数据与二进制分表，读取历史不加载全部 PDF。
- `ReadingDocument`：SHA-256 内容 id、name、pageCount、currentPage、zoom、createdAt、lastOpenedAt。`DocumentFile`：id、data（ArrayBuffer）。文件与元数据事务保存，重复打开保留进度。
- `ReaderItem` 可选增加 kind、status、documentId、pageNumber，旧记录无需逐条迁移；`collectionKind` 兼容旧 mode，词性在共享格式函数统一。
- 词/短语为 vocabulary，句子/段落为 excerpt。解释 JSON 可返回 mode 修正初步启发式；校验修正类型的必要字段，不额外发送分类请求。
- 网页收藏仍由后台保存，发送本机 storage 变更信号通知工作台刷新。PDF 收藏复用相同消息流程；导出不包含 PDF 二进制和 API 配置。
- PDF 以 `local-pdf:<内容哈希>` 作为来源，记录页面便于回跳。原句只在收藏详情展示，不在取词卡展示。

## v0.3.1 设置返回流程

`SettingsForm` 复用现有服务商、测试连接和本机保存逻辑，供工作台内嵌设置及浏览器原生扩展设置入口使用。工作台不再调用 `openOptionsPage`；进入设置时隐藏而不卸载原阅读/收藏区域，保持页码、缩放、滚动及筛选。隐藏期间忽略宽度为 0 的尺寸通知，避免无效缩放。成功写入存储后才调用返回回调，失败留在表单；忙碌时禁用表单，防止重复提交。原生设置入口保存后聚焦已有工作台或打开工作台。

## v0.3.2 收藏展示

继续复用收藏过滤、导出和详情流程，不新增依赖或数据迁移。`Workbench` 按视图展示顶部操作；收藏控件集中分组，列表根据 vocabulary/excerpt 使用不同排版。摘录优先展示已保存的 translation，缺失时兼容回退到 definition。CSS 区分阅读侧栏与全屏收藏页的布局，统一工作台的字体层级、文字对比度及窄屏换行。新增服务端渲染检查覆盖操作归属、空状态、筛选无结果与列表内容。

## v0.3.3 原位详情

删除旧详情模态框及其状态/样式。共享收藏列表使用原生 `details/summary`，相同 name 形成单展开组，键盘交互由浏览器处理；收起按钮关闭最近的 details 并将焦点还给 summary。状态操作使用原生 auto Popover，浏览器负责外部点击、Escape 退出和焦点关系，不在 summary 内嵌交互按钮。

状态数量从当前范围的生词计算，不受当前状态筛选重复过滤。`ReaderCard` 按已经校验的解释 mode 显示保存去向，成功反馈仍只在后台保存返回成功后出现。数据模型、API 流程及去重规则不变，无新增依赖。
