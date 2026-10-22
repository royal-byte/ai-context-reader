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

## v0.4.5 设置反馈归属

原问题来自 `SettingsForm` 的测试/保存共用底部 notice。将连接反馈分为 `testNotice`，在 API 设置内通过 flex 与测试按钮同排；通用 notice 仅保留配置读取/保存反馈。两个设置入口共享修复。接口、模型、密钥及服务商变化会清除旧测试结果；请求和存储流程不变。

## v0.4.6 安全批量恢复

`backup.ts` 在文件信任边界先限制字节数、记录数，再整份校验历史收藏数组。仅白名单复制收藏字段，忽略导入 ID、uniqueKey、配置和未知属性；来源仅接受 http/https/local-pdf/file，拒绝含凭证的 URL，PDF ID 必须与 local-pdf 来源一致。历史缺省字段按原分类规则处理，不把收藏误作新的模型输出做严格解析。

预览和最终恢复共享 `planRestore`，复用 `favoriteKey` / `contextKey` 去重，并兼容缺少 lemma 的旧记录相同选区。数据库事务内重读现有记录，重新规划，用 Set/Map 与一次 bulkAdd 合并，异常不在事务内吞掉，确保整批回滚。`savedRecord` 同时供主动收藏和恢复复用：重新生成键与编号，恢复保留时间和新词状态，已有词新语境继承当前状态。旧行不更新，documents/files/queries 和 Dexie v3 不变。

工作台原生文件选择器读取 JSON，确认前只在内存预览；成功后刷新列表、通知其他页面，通知失败不误报回滚。下载沿用旧数组格式，区分全量备份与筛选导出，并对导出应用同样上限。无新依赖、权限、后台消息、模型或网络请求。

## v0.5.0 信任边界与规模加固

后台启动时把 `storage.local` 限制为 `TRUSTED_CONTEXTS`；content script 只通过 `get-preferences` 读取偏好，`preferences-updated` 由后台按标签页广播。消息按来源分级：`items`/`export`/`delete` 移除，`test-api` 仅扩展页，`analyze`/`save`/`favorite-state` 允许 content script 与 `pdf.html`，并校验 `sender.id` 和网页收藏的来源一致性。`save` 复用 `normalizeFavoriteItem` 白名单与长度上限，网页收藏拒绝 `documentId`/`pageNumber`，PDF 编号必须是 64 位 SHA-256。

`createShadowRootUi` 使用 `mode: 'closed'`；选区、双击、快捷键与保存按钮拒绝 `isTrusted === false` 的合成事件。请求超时降为 25 秒，`api-keepalive` 端口在请求期间保活，`requestId`/`cancel` 允许关闭卡片时中止后台请求。模型输出先从代码围栏或前后文中恢复 JSON 对象，再按字段上限校验；compatible endpoint 在 400/422 时用最小 OpenAI 兼容 body 重试一次，推理模型省略 temperature、改用 `max_completion_tokens`，局域网 HTTP 需在设置中显式允许。

Dexie v4 为 `items` 增加 `termKey`、`contextKey` 与复合索引，升级时回填旧行；收藏查重、状态更新不再全表扫描。翻页进度改为 300ms debounce 并就地更新历史；关联词、筛选和计数使用 `useMemo`；设置页改为按需加载。content script 首次选区才挂载 Shadow DOM/React 树，上下文限制在最近 block 与 20k 字符窗口；PDF 文字层渲染后按 span 顺序写回 `pageText`，使选区偏移与文本层一致。

v0.5.0 增加默认开启的英文选区门：`isLikelyEnglish` 按 Latin/Han/Kana/Hangul 字符比例在本地判断，content script、PDF 捕获与后台 `analyze` 三层都拒绝非英文选区，避免无意义的模型请求；`englishOnly` 可在设置中关闭。Dexie v5 仅新增 `explanations` 缓存表（7 天、最多 500 条，API 设置变化时清空）。阅读卡片展示语境义/例句，收藏详情复用 `SavedContext` 展示完整字段；删除、CSV/Anki 导出、排序/搜索、站点停用和 TTS 都只使用本地数据或浏览器能力。

## v0.6.0 复习与离线词典

`ReviewPage` 消费 `dueReviewQueue(items)`：词汇按 `favoriteKey` 归组，已有复习记录且 `dueAt <= now` 的进入到期队列，没有 `reviewCount` 的旧收藏作为新词，每次最多 20 张。`scheduleReview` 是本地 SM-2 风格调度器，四档评分写入 `dueAt`、`intervalDays`、`ease`、`reviewCount`、`lapseCount`、`lastReviewedAt`，并据间隔自动切换 `reviewing`/`mastered`；`reviewTerm` 在事务里更新同一词条的所有语境，避免各语境状态不一致。复习字段沿用 `ReaderItem` 而不是新表，因此现有 JSON 备份/导出和 `parseBackup` 白名单能直接携带，备份恢复不需要额外迁移。

`dictionary.ts` 通过后台 `dictionary-lookup` 消息读取 `public/dictionary/ecdict.json`，只在单词模式触发；后台懒加载并缓存 `Map`，content script/PDF 不直接访问文件。卡片在 AI 请求期间或失败时展示本地释义，AI 结果缺少音标/词性时用本地值补齐；`dictionaryCandidates` 只做保守词形回退，不做词义推断。词典为 ECDICT（MIT）按频率截取的 20,000 词子集，构建脚本和许可证随数据一起分发。

## v0.7.0 PDF 体验与 EPUB

`ReadingDocument.kind` 是可选的 `'pdf' | 'epub'`；旧历史记录没有该字段，按 PDF 处理，因此不需要 Dexie 迁移。PDF/EPUB 文件仍共用 `files` 表，`rememberDocument` 在保存时写入 kind；PDF 的 `pageCount` 是页数，EPUB 的 `pageCount` 是章节数，`currentPage`/`zoom` 分别复用为章节索引和字号百分比。

EPUB 在主扩展页面内用 JSZip 解压：读取 `META-INF/container.xml` 与 OPF，按 `spine` 顺序取 XHTML 章节，解析 nav/NCX 目录标题；章节 HTML 用 DOMParser 清洗，移除脚本/样式/表单/iframe/事件属性，只保留阅读标签，图片解析到 zip 内文件后转成生命周期受控的 blob URL。`EpubPage` 使用 `dangerouslySetInnerHTML` 渲染章节内容前已完成清洗；关闭或替换文档时统一 `revokeObjectURL`。选区仍走 Workbench 的 `capture`，EPUB 用 `contextForRange` 取最近 block 的上下文，PDF 保留文字层 span 偏移映射；两者共用 `local-pdf:` 来源前缀、收藏和回到原文逻辑。

PDF 侧新增键盘翻页（不拦截可编辑控件和卡片打开状态）、`fit page` 缩放（用 viewport 高度计算）、夜间模式以及基于 `pdf.getOutline()`/`getDestination()` 的目录跳转。目录只负责跳页，不引入 PDF link annotation 层；搜索、链接注释和连续滚动仍留待后续。

## v0.7.1 Context Packet v2

`src/context.ts` 定义 `ContextPacket` 和有界构造器：网页/EPUB 由 `contextPacketForRange` 从最近 block、Range 偏移、邻近标题生成；PDF 由 `contextPacketForText` 从文字层整页文本和 span 偏移生成。字段上限为所在句 320、相邻句 180、段落 700、标题 120 字符；`normalizeContextPacket` 不信任消息中的 selection，重新使用已校验的选区，并重新裁剪所有字段。Packet 不含 URL、页面标题或文件名。

后台 `analyze` 用 packet 生成缓存 key 和 prompt；`requestExplanation` 再校验一次，将 packet 作为“引用材料”传给模型，而不是让模型执行其中的指令。Prompt 保持 `definition` 为常见词典义、`translation` 为语境义，`explanation` 只解释语境判断且不重复前两者；`partOfSpeech` 取语境词性，多词性不全部罗列。落在 `src/context.test.ts`、`selection-packet.test.ts` 和 `query-privacy.test.ts`。

v0.7.2 进一步把 `definition` 的语言钉死为简体中文：Prompt 禁止英文词典释义，缓存版本升到 v3；后台 `ensureChineseDefinition` 在单词定义仍为英文时用本地 ECDICT 子集补齐中文标准义/词性/音标，在短语/句子/段落仍为英文时用中文语境翻译兜底，避免 UI 出现纯英文“标准释义”。

v0.7.3 把单词的“标准释义”所有权从模型移回本地词典：`ReaderCard` 先请求 `dictionary-lookup`，单词模式用 `local.translation`（去掉首词性前缀）和 `local.partOfSpeech` 渲染标准义，AI 的 `definition` 只作为本地缺词时的 fallback；语境义仍取 AI `translation`。标准义在 AI 加载期间就显示，保存收藏时也写入本地标准义/词性/音标，避免生词库保存模型的语境义。

v0.7.4 修复 PDF “适合页面”抖动：`.reading-viewport` 使用 `scrollbar-gutter: stable`，fit-page 模式隐藏滚动条，`.pdf-stage` 固定为 100% 尺寸并用 flex 居中，页面高度按 viewport 高度减 padding 计算。这样 PDF 尺寸变化不会再触发滚动条出现/消失，从而打断 ResizeObserver → 缩放 → 布局的反馈环。

v0.7.5 把本地词典的 `translation` 在加载时解析为按词性分组的 senses：`parseDictionarySenses` 按 `;`/换行和 POS 前缀拆分，并用 `HETERONYMS` 给常见异音词补按词性音标。`ReaderCard` 先渲染语境义，再渲染 `SenseList`（语境词性优先）；`normalizeDictionaryGloss` 只对完全相同的标准义与语境义去重，子集/特化不会误合并。收藏仍写回完整标准释义字符串，避免数据库 schema 变化。

v0.7.6 把模型输出中的 `examples` 从硬校验改为可选元数据：`explanationExamples` 对缺失返回 `[]`、字符串包装为单元素数组、数组过滤非字符串并截断超长项，最多保留 5 条。段落模式不再因为模型省略示例而丢弃整段解释；prompt 仍要求无例句时返回空数组。

v0.7.7 调整卡片信息层级：本地标准释义先渲染（AI 未返回时也显示），语境义/整句翻译在后；多词性行使用更窄的 POS 列和间距。这样标准词典结果不再等待模型，卡片也不会出现词性与释义之间的大块空白。

v0.7.8 把多词性行从 flex 列改为行内文本 `n. 释义`，只保留一个普通空格；语境义中的 `n. · 释义` 改为 `n. 释义`，去掉分隔标点。
