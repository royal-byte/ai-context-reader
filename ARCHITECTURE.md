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

## v0.3.4 延迟解释

网页和 `Workbench` 共用 `selectionIntent` 识别 mouseup / dblclick：忽略右键和双击的第二次 mouseup，普通拖选仅展示 `SelectionReader` 的按钮。只有双击单词或点击按钮才挂载 `ReaderCard`，从而复用原请求流程，拖选与复制不会发送 analyze 消息。PDF 通过 `PdfPage` 传递原鼠标事件，不再把两种手势都直接打开卡片。

按钮的 pointerdown / mousedown 阻止默认聚焦但不劫持 copy 或 contextmenu；外部关闭复用 `dismissCardOnOutsidePress`，按钮关闭不清除选区，右键对按钮和卡片都不清除选区。Escape 在文档层关闭。按钮额外在滚动和 resize 时关闭，避免选区位置变化后悬空。无新依赖、无数据库迁移、无改动模型限流处理。

## v0.4.0 设置与隐私边界

`reader-preferences` 与 `byol-settings` 分开保存；设置页一次 storage.set 保存两者，取消不写入。配置归一化只接收枚举、布尔和验证后的域名，不向阅读组件传密钥。初次读取失败时不允许发起选区查询；订阅配置变化时关闭旧选区。语言文案由显式 `uiText` 处理，不翻译或改写用户的收藏正文。

`minimalContext` 在网页/PDF、共享卡片、后台及最终 API 层复用：词语仅取所处句子，长句局部窗口最多 1000 字符，句段仅选区。`validateSelection` 在后台/API 入口拒绝空值与超过 3000 字符的数据。来源只用于本机收藏/可选查询历史，不进入模型 messages。后台以实际 sender.url 做站点名单检查，不信任网页声称的来源。名单是应用响应限制，manifest 的既有浏览器权限不变。

Dexie v3 仅新增 `queries: ++id,createdAt`，保留旧表和已有数据。查询历史默认关闭，成功后重新读取开关再记录，事务内裁剪至最近 200 条，避免并发写入覆盖。保存历史失败返回非阻断 warning。PDF 开关关闭时 `rememberDocument(..., false)` 仅生成内存元数据，不读旧进度、不写文件/历史；工作台不自动恢复或更新进度。开关不自动删除既有数据。

保持 BYOL 本机直连，设置页说明客户端风险。官方统一服务密钥的后端代理属于后续公开服务架构，不把个人密钥经过后端描述成天然安全。本次没有引入代理、额外依赖、遥测、后台文章抓取或付费自动回退。

## v0.4.2 服务商兼容

复用 `API_PRESETS`、严格主机名识别、`selectApiProvider` 和原设置表单。新增 OpenRouter、MiniMax 国内/国际的固定端点，旧 MiniMax 国内域名仅用于识别既有配置，默认采用最新官方国内域名，不迁移或转发用户密钥。

共享 `requestExplanation` 根据目标主机发送必要的少量差异参数。OpenRouter 保留 `response_format: json_object`，设置 `provider.require_parameters`，不附带网页 HTTP-Referer 或模型回退列表。MiniMax 使用 `reasoning_split` 与 `max_completion_tokens`，仅默认 M3 关闭思考，M3.1-Flash 使用 low 档；未文档化的 response_format 不发送。两者都只解析最终 content 并复用 `parseExplanation`，不向 UI 暴露 reasoning_content；MiniMax 非零 base_resp 业务码抛出安全错误，不回显原始服务器文本。

数据模型、数据库、后台消息、查询触发与密钥存储不变；没有 SDK、新依赖、自动重试或新增浏览器权限。

## v0.4.3 多语境与 PDF 解释面板

保持 Dexie v3、`items` 的原字段及单行语境，不执行重写旧记录的迁移。`favoriteKey` 对单词使用已返回的 lemma（否则选区），短语使用完整选区；摘录另含语境键。`contextKey` 使用文档 ID/网址、页码和已有原句提取规则。展示层 `groupFavorites` 归组但保留每条原始记录，最早的收藏作为摘要；文档范围先过滤再归组，导出展平所有匹配语境。学习状态在同一词条所有记录上事务更新。

`getFavoriteState` 仅做本机查询，经 `favorite-state` 消息告知卡片 new/context/duplicate。`saveItem` 在读写事务里再次检查，原语境返回 duplicate 而不覆盖，新语境 add 且继承词条状态。当前 O(n) 扫描为保留旧格式的 MVP 简化；未来规模扩大时增加带迁移的词条索引。保存完成但通知失败返回非阻断 warning，避免误报保存失败。

`ReaderCard` 复用同一请求、校验与保存逻辑，新增 popup/panel 展示选项。PDF 的主动查询挂载在右侧；待确认选区仍用轻量按钮，复用 `opensImmediately` 触发规则。侧栏切换、收起使用 hidden 保持卡片，不重新请求；文档/页码/设置变化会清除旧查询。网页保持外部点击关闭，固定解释面板不绑定外部点击关闭。两处都不重复显示原句或分类控件。

词典仅入待办，未新增查询接口、词库、依赖、权限或网络上传。

## v0.4.4 本地词汇关联

复用 `groupFavorites`、`favoriteKey`、`contextKey` 与已有原句提取。`relatedVocabulary` 只消费当前范围的保存记录，将语境按原句分句、按词边界匹配当前词与其他收藏词，原形仅使用已保存值，不做新词形推断。去重使用来源 ID/网址、页码与整理空白的原句，同页后缀重叠保守保留较短文本，避免页眉混入导致计数膨胀；无文本坐标时不承诺精确出现次数。只有同来源时返回双方原句对照，并明确不是共现结论。

关联在当前展开卡片上按需计算，关闭卡片不计算，结果不写入数据库。当前词条×保存原句扫描以及同来源重叠比较适用于 MVP；大库应以本地倒排索引和保存的文本坐标升级。UI 使用已有内联 details 展示依据和已有来源动作，最多展示 5 个关联、每个 3 条共现依据；词条跳转复用原生 accordion，清除筛选、展开并聚焦 summary。单独导航与主题/搭配识别暂不实现，无额外 AI、数据迁移或权限变化。
