# 方案A：纯浏览器版（先行验证）

## 1. 定位与目标

- **零服务器、零后端、零 API Key、零运行成本**：所有逻辑跑在浏览器里
- Mobile Web 使用（手机浏览器 / PWA）
- 目的：**快速验证**「浏览器解析 PDF + 系统自带朗读」的听书体验是否可用；不达标则切换方案B（见 §9 评估判据）
- 天然优势：数据全在本地 IndexedDB，**阅读和朗读都天然完整离线**（系统音色本地可用），这是方案B一期做不到的

## 2. 技术栈

| 层 | 选型 | 说明 |
|---|---|---|
| 构建 | Vite + React + TypeScript | 纯静态 SPA，无需任何服务端 |
| UI | Tailwind CSS + antd-mobile（底部弹层/搜索栏/输入等移动端控件；暗色主题走 `data-prefers-color-scheme` 属性） | mobile-first |
| PDF 解析 | pdfjs-dist | 浏览器端解析，逐页提取文本 |
| 存储 | Dexie（IndexedDB） | 本地数据库 |
| 朗读 | Web Speech API（speechSynthesis） | 系统自带，免费，离线可用 |
| PWA | vite-plugin-pwa | manifest + Service Worker（Workbox） |
| 部署 | 静态托管（Cloudflare Pages / Netlify，免费 + HTTPS） | 开发期 `vite --host` 手机局域网访问 |

> 静态托管拿到 HTTPS 公网地址后，PWA 与「添加到主屏幕」才能完整生效，且手机随时随地可访问——虽然无服务器，但依然建议发布到免费静态托管，而不是只在本机跑。

## 3. 架构：适配层设计（为切换方案B留后路）

UI 组件**不直接**调用 Dexie 和 speechSynthesis，全部通过两个接口隔离：

```ts
// 书籍数据层
interface BookRepository {
  listBooks(): Promise<BookMeta[]>
  importBook(file: File, onProgress?: (pct: number) => void): Promise<BookMeta>
  getChunks(bookId: string, fromSeq: number, count: number): Promise<Chunk[]>
  saveProgress(bookId: string, p: Progress): Promise<void>
  getProgress(bookId: string): Promise<Progress | null>
  deleteBook(bookId: string): Promise<void>
  exportAll(): Promise<Blob>   // JSON，用于日后迁移到方案B
}

// 朗读引擎层
interface SpeechEngine {
  speak(sentences: string[], opts: { rate: number; voiceURI: string }): void
  pause(): void
  resume(): void
  stop(): void
  onSentenceEnd(cb: (chunkSeq: number, sentenceIndex: number) => void): void
  getVoices(): { uri: string; name: string; lang: string }[]
}
```

- 方案A 实现：`IndexedDBBookRepository` + `WebSpeechEngine`
- 方案B 实现：`HttpBookRepository` + `StreamingAudioEngine`（HTTP + `<audio>`）
- **书架、阅读页、播放控制的 UI 两方案完全复用**，切换只替换两个适配实现

## 4. 存储选型与数据模型

### 4.1 存储选型：IndexedDB（Dexie 封装）

离线阅读是硬需求，存储必须满足三点：**容量装得下多本书、Service Worker 里可访问（离线场景）、数据可查询（书架列表 / 分块分页）**。浏览器端候选逐一评估：

| 候选 | 结论 | 原因 |
|---|---|---|
| localStorage | ❌ | 上限约 5MB 且同步读写，十几本书就撑爆；**Service Worker 无法访问**，离线阅读不成立 |
| **IndexedDB（Dexie）** | ✅ 选用 | 浏览器标准本地数据库：容量宽松、支持索引与分页查询、Service Worker 可访问（离线关键）、Dexie 提供类型友好的 API |
| OPFS + SQLite WASM | ❌ | 能在浏览器跑「真 SQLite」，但需 Worker + 同步句柄 + 特殊响应头，iOS 兼容与构建复杂度都高；本应用就 4 张表，收益配不上风险。且迁移到方案B走的是 JSON 导出/导入，并不依赖「浏览器里也是 SQL」 |
| Cache API | 辅助 | 只适合缓存 Response（应用外壳用 Service Worker 预缓存），不是可查询的数据库 |

**容量账（只存文本，不存音频——朗读是实时合成的，无音频文件）**：

- 一本 20 万字的书 ≈ 0.5MB 文本 + 约 50KB 封面缩略图
- 100 本书 ≈ 约 60MB，而 Chrome/Android 与 iOS 的单站点配额通常在数百 MB 至 GB 级——**书架放几十上百本书毫无压力**
- 设置页用 `navigator.storage.estimate()` 展示已用/可用空间

**可靠性两道保险（对抗浏览器清存储）**：

1. 启动即调 `navigator.storage.persist()` 申请持久存储，降低被系统自动清理的优先级
2. iOS 引导「添加到主屏幕」（安装后的 PWA 不受 7 天未访问即清存储的规则约束）；设置页提供**「导出书库（JSON）」**按钮作为手动备份后路（复用迁移用的 `exportAll()`）

### 4.2 数据模型（IndexedDB / Dexie，库名 `voxread`）

| 表 | 字段 | 说明 |
|---|---|---|
| books | id, title, sourceFilename, pageCount, totalChunks, createdAt, lastReadAt, coverBlob? | 书元数据；coverBlob 为导入时用 pdf.js 渲染首页生成的缩略图，lastReadAt 驱动书架「最近阅读」排序 |
| chunks | [bookId, seq]（复合主键）, text | **字段结构与方案B的 SQLite 完全对齐**，便于迁移 |
| progress | bookId（主键）, chunkSeq, sentenceIndex, updatedAt | 断点续听 |
| settings | id='global', rate, voiceURI, theme, fontSize | 全局设置 |

- chunks 以 bookId 建索引：书架列表查 books 表，阅读页按 `[bookId, seq]` 范围分页取块——多本书互不干扰，删除书时级联删 chunks / progress

- 块（chunk）：按段落聚合，每块 ≤1500 字符，段落不跨块
- 句（sentence）：朗读时由块实时切分（按 `。！？；\n`，长句再按逗号切，每句 ≤200 字），不单独存储
- 解析完成后**只存文本**，原始 PDF 字节不保留（二期可选「保留原文件」存 Blob）

## 5. PDF 解析与切块流程

```
input[type=file] 选 PDF → ArrayBuffer → pdfjs getDocument()
→ 逐页 page.getTextContent()（带页码进度回调）
→ 文本项按 y 坐标聚合成行 → 行聚合成段落 → 段落聚合成分块
→ 写入 IndexedDB → 书架出现新书
```

- **段落判定（启发式）**：行间距突变 / 行尾无标点且下一行有缩进 / 行尾是句号类标点。中文全角标点结尾是较强的段落信号
- **扫描版检测**：整页提取字符数低于阈值 → 标记该书为「扫描版，暂不支持」（OCR 是方案B二期）
- **解析质量四大坑与对策**（直接影响听书体验；导入时检测，异常的书在书架卡片标记「解析质量差」）：
  1. **乱码**：部分 PDF 字体缺 ToUnicode 映射，提取出乱码/生僻字 → 检测替换符（U+FFFD）与私用区字符占比，超标则警告
  2. **页眉页脚混入**：每页重复的书名/页码会不断打断朗读 → 跨页重复行检测（在 ≥ 半数页面出现的相同行视为页眉页脚，剔除）
  3. **双栏排版**：学术书按原始顺序提取会左右栏交错 → 暂不支持，检测到疑似双栏时警告（小说类主场景基本不受影响）
  4. **CJK 兼容字符**：部分 PDF（尤其 InDesign 导出）文本层用康熙部首等兼容字符（"⽬"≠"目"、"⾎"≠"血"），导致搜索/分章/朗读全部失灵 → normalizeText 对部首区（U+2E80–U+2FDF）与兼容表意区（U+F900–U+FAFF）做 NFKC 归一（不动全角标点，避免破坏排版）；搜索对已入库数据同样归一
- **封面**：导入时用 pdf.js 渲染第 1 页为小尺寸缩略图（约 50KB）存入 `books.coverBlob`，书架卡片展示
- **内存与体积**：手机解析超大 PDF 有标签页崩溃风险 → 上传上限设 100MB，超过 30MB 提示「解析较慢」；解析在 pdf.js Worker 中逐页进行并及时释放页资源
- 手机解析大 PDF（≥300 页）需要几秒到几十秒，UI 必须有进度条；这也是真机评估项之一

## 6. 朗读（Web Speech API）实现要点

数据流：`块 → 句子切分 → 每句一个 SpeechSynthesisUtterance → speechSynthesis.speak()`（API 自带队列，逐句出声）

- **进度与听读同步**：每句 `utterance.onend` → 更新 progress（chunkSeq + sentenceIndex）→ 阅读页高亮当前句并自动滚动
- **音色**：`getVoices()` 过滤 `zh-*`；音色列表**异步加载**，需监听 `voiceschanged`；iOS 需用户在系统设置里已下载的音色才可选
- **语速**：`utterance.rate`（0.5–2），调整后下一句生效，无需重头播
- **手势要求**：iOS 首次 `speak()` 必须由用户点击触发（播放按钮天然满足）
- **块间衔接**：当前块播完后从 Dexie 取下一块继续 speak；预读下一块文本（本地查询，瞬时）

### 6.1 已知浏览器坑与对策（务必在实现中处理）

| 坑 | 平台 | 对策 |
|---|---|---|
| 长句朗读约 15 秒后静音 | Chrome 桌面 | 每句 ≤200 字 + 兜底：speaking 期间每 10s `pause()/resume()` 一次 |
| `pause()` 后 `resume()` 无效或直接结束 | 部分 Android | 暂停改为 `cancel()` + 记录当前句位置；继续时从该句重新 `speak()` |
| `getVoices()` 首次返回空数组 | 全平台 | 监听 `voiceschanged`，缓存进 settings |
| **锁屏 / 切后台朗读暂停** | iOS（**最大风险，无完美解**） | 缓解：Wake Lock 保持屏幕常亮 + 引导用户屏幕常亮使用；此项是切换方案B的首要判据 |
| 音色质量参差 | 全平台 | 设置页提供音色试听；iOS/macOS 中文音色（婷婷等）与 Android 的 Google 语音引擎通常可用 |

## 7. PWA 与离线

- vite-plugin-pwa 预缓存应用外壳；书文数据本来就在 IndexedDB → **全功能离线**（读 + 听）
- **Service Worker 只在 HTTPS（或 localhost）下可注册**：局域网 IP + HTTP 验证不了离线与 PWA 安装引导。真机验证前二选一：mkcert 给本机开发服务配证书，或直接部署到静态托管拿 HTTPS 地址
- **必须引导「添加到主屏幕」**：iOS 对未安装的站点，7 天不访问即清空 IndexedDB（书会全丢）；安装为 PWA 后不受此规则约束
- 启动时调用 `navigator.storage.persist()` 请求持久存储
- 离线能力完整性是方案A相对方案B的核心卖点（方案B一期只有文本离线，音频在线）

## 8. 页面与交互（与方案B保持一致）

1. **书架页（多本书）**：
   - 上传按钮（`accept="application/pdf"`，支持一次多选）；书架无数量上限（容量见 §4.1）
   - 书卡片：封面缩略图（导入时渲染的首页）、标题、读/听进度条、最近阅读时间；按 lastReadAt 倒序排列
   - 卡片操作：点按进书、长按/侧滑删除（级联删该书 chunks 与 progress，二次确认）
   - 标题搜索、空状态引导（上传第一本书 + 添加到主屏幕 + 选音色）
2. **阅读播放页**：
   - 阅读视图：**按块懒渲染**（只挂载当前块前后若干块，20 万字不全量进 DOM）、当前朗读句高亮 + 自动滚动、字号 / 夜间模式
   - **点击任意句子（含其他块）从该句开始朗读**；切换音色/语速即时生效（取消当前句后以新参数重读）；设置里"试听"音色会暂停朗读、试听结束自动从当前句恢复
   - 头部导航（无书名、页码居中）：‹ 块序号/总数 › 翻块；**页码跟随视口顶部可见块**（滚动/翻页后页码与所见内容始终对应，翻块操作也基于可视位置）；**进入书自动定位到记录的进度块**（可见窗口必须等进度初始化后再创建，且换书时重置）；点页码弹出**方块网格跳块面板**（每块一个方块，点击直达；当前块深色高亮、已读浅色；大书按需渲染，每次 120 个，滚动到底自动追加）
   - **全文模糊搜索**（**顶部弹出面板**：键盘从底部升起不会遮挡搜索框与结果，规避 iOS 底部弹层被键盘盖住的经典问题）：查询词各字符间允许少量空格/标点差异（"第一章前言"可命中"第一章 前言"），CJK 兼容字符自动归一；命中列表带高亮上下文，**点选定位到命中所在的精确句子**（记录段落序号 + 段内句序号，不依赖文字比对；不自动播放）、目标句短暂闪亮；结果与关键词跨开关保留；引擎连续 4 句合成失败自动熔断并提示（防止"越播越快"式跳句狂奔）
   - 弹层统一用 antd-mobile Popup（遮罩点击关闭、锁定背景滚动）；**朗读跟随滚动**：瞬时居中（iOS 的 smooth scrollIntoView 间歇失效）+ 依赖 chunks/vis 变化重试 + 400ms 延迟兜底，并随播放自动扩展可见窗口
   - 底部播放条：播放/暂停、语速、设置
   - 进入书自动定位到 progress 断点
3. **设置页**：音色（**仅中文 / 英文 / 日语三组**，不含粤语；过滤 iOS 趣味/特效音色（Albert/Zarvox/Bahh 等）与老式机器人音（Fred 等）；Enhanced/Premium 高品质音色优先；每组最多 5 个；**试听强制用点选音色 + 按其语言的母语文案**（中/英/日各一句），关闭设置面板即停试听、此前在朗读则接着读）、语速、主题、字号、书库导出/恢复、存储用量

## 9. 效果评估与切换判据（本方案的存在意义）

在真机（重点 **iOS Safari + Android Chrome**）验证以下各项，任意一条「不可接受」即触发切换方案B：

> **验证前准备（否则音色评估失真）**：iOS 先在「设置 → 辅助功能 → 朗读内容 → 声音」下载高质量中文语音；Android 确认系统 TTS 引擎可用（部分国产 ROM 需自行安装 Google TTS 或讯飞语音引擎）。另需 HTTPS 环境（见 §7）才能验证离线与 PWA。

| # | 评估项 | 通过标准 |
|---|---|---|
| 1 | iOS 锁屏/后台朗读 | 能持续朗读。**若听书时锁屏是刚需，预期此项不过 → 直接转B** |
| 2 | 音色质量 | 连续听 10 分钟不出戏、不疲劳 |
| 3 | 暂停/继续/跳句稳定性 | 各项操作后朗读位置正确、不死音 |
| 4 | 大 PDF 解析 | 300 页书在手机上解析成功且进度可见 |
| 5 | 中文断句自然度 | 数字、英文混排、常见标点处停顿合理 |

结论与真机型号记录到本文档末尾附录。

## 10. 里程碑

- **M1 骨架**：Vite + React + TS + Tailwind + PWA，空书架页
- **M2 上传与解析**：pdf.js 切块入库，书架列表
- **M3 阅读页**：文本渲染 + 进度定位
- **M4 朗读**：WebSpeechEngine + 播放控制 + 句级高亮 + 断点续听
- **M5 真机验证**：按 §9 清单出结论，决定去留

## 11. 从方案A迁移到方案B

- chunks 字段结构两边一致；`exportAll()` 导出 JSON（books + chunks + progress）→ 方案B 提供 `POST /api/import` 一键导入（progress 的 sentenceIndex 在B中对应音频时间偏移，导入时取整到块起点即可）
- UI 全部复用，仅替换 Repository / SpeechEngine 两个适配实现
- 预计迁移成本：一天以内

---

## 附录：真机验证记录

（待 M5 填写）

### 已实施的 TTS 稳定性对策备忘

- **词内漏音节（"线粒体"→"线体"）**：iOS 引擎对长文本（百字级整句）会随机漏音节 → 喂给合成器前把句子再切成 ≤80 字的段（先按标点、超长硬切），段间 80ms 间隙；分段是引擎内部细节，高亮/进度仍按句
- **开口掐头（"火车为什么停下"→"为什么停下"）**：cancel/恢复后引擎直接开口会丢第一个词 → 每轮朗读先走一个**零音量（volume 0）的静音预热合成**垫场（孤立标点当预热文本会被引擎读出名字，如"句号"，不能用）
- **音色与句子语言自动匹配**：英文音色读中文文本会静音（日语音色认汉字所以"能读"但发音是日语）→ 每句按语言检测（假名→日、汉字→中、纯拉丁→英）解析音色：选中音色语言匹配就用，不匹配自动退到该语言组最优可用音色，保证任何选法都有声
- **吞字**：句间加间隙（强标点后 200ms、其他 90ms）避免零间隙连喂截掉句首音节。只在 TTS 层生效，显示文本不变
- **诊断入口**：设置页"试听"文本固定含易漏音节词（祖父/线粒体），试听即可判断是音色问题还是文本问题；换音色/降语速是剩余吞字的最有效手段
- 15 秒静音 pause/resume 脉冲仅桌面 Chrome 启用（该 bug 为桌面 Chrome 特有；iOS 上脉冲反而可能截断音频）
- iOS 朗读僵死（多次重载后无声）：发声看门狗自动重试 + 音色空列表检测 + 引导完全退出浏览器
- 越播越快：连续 4 段合成失败自动熔断并提示
