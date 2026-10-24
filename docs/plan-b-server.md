# 方案B：服务器版（后备方案）

> 触发条件：方案A（纯浏览器版）真机验证不达标，详见 [方案A §9 评估判据](./plan-a-browser-only.md#9-效果评估与切换判据本方案的存在意义)。

## 1. 定位

Next.js 一体化的 Mobile Web 应用（PWA）。手机上传 PDF → 服务端解析切块存 SQLite → 在线流式听书（TTS 后端代理合成 + 服务端音频缓存）→ 文本自动缓存到手机，支持离线阅读。**音频不缓存到手机**（一期）。

相比方案A解决的问题：朗读不依赖系统音色（质量可控、iOS 锁屏后台可持续）、暂停/继续稳定、音色一致。

## 2. 技术栈

| 层 | 选型 |
|---|---|
| 前端 | Next.js（App Router）+ TypeScript + Tailwind，mobile-first，PWA（manifest + Service Worker） |
| 后端 | Next.js API Routes（同一项目） |
| 数据库 | SQLite + Drizzle ORM（服务端单文件库） |
| PDF 解析 | unpdf（pdf.js 的服务端封装） |
| TTS | Azure 语音（默认，免费额度 50 万字符/月）；Provider 抽象层可切 Edge TTS / OpenAI |
| 部署 | 本机局域网 → 正式用 VPS 或家里电脑 + Tailscale；公网部署必须加密码门禁 |

## 3. 数据模型（SQLite）

```sql
books      (id, title, source_filename, page_count, total_chunks, status, created_at)
chunks     (id, book_id, seq, text)            -- 每块按段落聚合，≤1500 字符，段落不跨块
progress   (book_id PK, chunk_seq, offset_seconds, updated_at)
audio_cache(chunk_id PK, file_path, provider, voice, bitrate, created_at)
```

- 与方案A的 IndexedDB chunks 结构字段对齐，支持从A一键导入
- 原始 PDF 文件保留在服务端磁盘（未来「边听边看原版」用；不需要可解析后即删）
- 音频文件存磁盘，audio_cache 只存索引

## 4. API 设计

| 端点 | 方法 | 说明 |
|---|---|---|
| `/api/books` | POST | 上传 PDF，multipart；服务端解析切块入库，返回 book 元数据 |
| `/api/books` | GET | 书架列表（元数据 + 进度摘要） |
| `/api/books/:id/chunks?from=&to=` | GET | 分页拉文本块 |
| `/api/books/:id/progress` | GET / PUT | 读 / 写进度 |
| `/api/audio/:bookId/:seq` | GET | 取某块音频；**命中缓存直接流式返回 mp3（支持 Range）；未命中现场调 TTS 合成 → 落盘 → 返回** |
| `/api/books/:id` | DELETE | 删书及关联数据 |
| `/api/import` | POST | 从方案A迁移：导入 exportAll() 的 JSON |
| `/api/settings/voice` | GET | 列出可用音色（来自 TTS Provider） |

**门禁**：公网部署时全 API 加单人密码（cookie session 或 Bearer token），防止 TTS 额度被第三方刷光。局域网/Tailscale 可关闭。

## 5. TTS Provider 抽象

```ts
interface TtsProvider {
  synthesize(text: string, opts: { voice: string; format: string }): Promise<Buffer>
  listVoices(): Promise<Voice[]>
}
// 实现：AzureTtsProvider（默认）/ EdgeTtsProvider（免费非官方）/ OpenAiTtsProvider
// .env 配置切换；音色参数随 audio_cache 记录，换音色后视为未缓存重新合成
```

## 6. 听书流程

```
点开书 → GET 第 1 块音频：服务端查 audio_cache
  ├─ 命中 → 直接流式返回 mp3，秒开
  └─ 未命中 → 调 TTS 合成（约几秒）→ 落盘 → 返回
播放开始 → 前端预取第 2 块 → 服务端后台合成落盘
当前块播完 → 下一块已就位 → 无缝续播 → 再预取第 3 块 ……
```

- 一块 1500 字 ≈ 5–7 分钟音频，合成仅需几秒，预取一块即可完全隐藏延迟
- 不整本预生成：首声快、弃书不浪费额度；听过的块永久缓存，重听零成本秒开
- 留「预生成整本」后台按钮的口子（二期）

## 7. 前端与移动端要点

- **单一 `<audio>` 元素全程复用换 src**：iOS 一次手势解锁后，后续块无缝切换
- **Media Session API**：锁屏显示书名 / 封面 / 暂停快进控制
- **引导添加到主屏幕**：iOS 下 PWA 存储不受 7 天清理规则，离线阅读才可靠
- 阅读页与方案A完全同构：全文渲染、当前朗读块高亮滚动、字号 / 夜间模式
- 适配层同方案A：`HttpBookRepository` + `StreamingAudioEngine` 替换两个实现即可，UI 复用
- 倍速：`audio.playbackRate`，不重新合成

## 8. 文本离线（阅读）

- Service Worker 缓存应用外壳；**打开过的书自动缓存全文**（每本几百 KB，免按钮）
- 离线时：书架 / 阅读正常，播放按钮置灰提示需联网，进度先记本机（IndexedDB 队列）回网同步（单人使用，后写覆盖前写）
- `navigator.storage.persist()` 请求持久存储

## 9. 部署

| 形态 | 说明 |
|---|---|
| 开发期 | 本机 `next dev`，手机同 WiFi 访问局域网地址 |
| 家用 | 家里电脑常开 + Tailscale，出门前无需任何操作（音频在线拉）；零成本 |
| 公网 VPS | 腾讯/阿里轻量（约 ¥30–50/月），随时随地；**必须开密码门禁** |

## 10. 分期

**一期**：上传解析、书架、阅读页、在线流式听书、断点续听、倍速、文本离线缓存 + 离线阅读 + 进度回网同步、PWA 化、`/api/import` 迁移入口

**二期（留口子不做）**：整本音频离线下载（约 250MB/本，24kbps 可减半）、预生成整本、OCR 扫描版、多用户

## 11. 从方案A迁移

1. 方案A页面执行 `exportAll()` 下载 JSON
2. `POST /api/import` 上传 → 服务端写入 books / chunks / progress
3. 前端仅替换 Repository / SpeechEngine 两个适配实现，UI 不动
4. 预计成本：一天以内
