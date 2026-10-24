# VoxRead

上传自己的 PDF → 解析成书 → 在手机上听书 / 阅读 的 Mobile Web 应用。

## 路线决策

**先做方案A（纯浏览器版）**：零服务器、零成本，用浏览器自带能力（pdf.js 解析 + Web Speech API 朗读）跑通全流程并真机验证听书效果；**若关键体验不达标，切换方案B（服务器版）**。

两方案通过「数据层 + 朗读引擎层」两个适配接口隔离，UI 与切块逻辑完全复用，切换成本控制在一天以内。

| | 方案A：纯浏览器版（当前） | 方案B：服务器版（后备） |
|---|---|---|
| 形态 | 静态 SPA，无服务器 | Next.js 全栈 + SQLite |
| 朗读 | 系统 Web Speech API | Azure 等 TTS 接口（后端代理） |
| 成本 | 0 | 本机/内网 0；VPS 约 ¥30–50/月 |
| 离线 | **读 + 听全离线** | 一期仅阅读离线，听书在线 |
| 主要风险 | iOS 锁屏后台朗读暂停、音色受限 | 需维护一个服务 |

## 文档

- [方案A：纯浏览器版（先行验证）](docs/plan-a-browser-only.md) — 技术栈、数据模型、浏览器坑与对策、**真机评估判据**、里程碑
- [方案B：服务器版（后备）](docs/plan-b-server.md) — API 设计、TTS Provider 抽象、听书流程、部署与迁移

## 当前状态

M1–M4 全部完成 + 多轮体验优化（书架/阅读/搜索/跳转/朗读稳定性），40 个单测全绿。**待办：M5 真机验证**——重点是 iOS 锁屏/后台朗读（评估判据 #1），其结果决定是否切换方案B。

## 快速开始

```bash
npm install
npm run prepare-assets   # 生成 PWA 图标 + 复制 pdf.js cmaps（可重复执行；升级 pdfjs-dist 后重跑）
npm run cert             # 生成本地 HTTPS 证书（需已安装 mkcert；证书含局域网 IP）
npm run dev              # 开发服务器（HTTPS，手机同 WiFi 访问终端打印的地址）
```

手机首次访问前（一次性）：`mkcert -CAROOT` 查看根证书目录，把 `rootCA.pem` 传到手机安装并信任（iOS：设置 → 通用 → 关于本机 → 证书信任设置）。

## 常用命令

| 命令 | 说明 |
|---|---|
| `npm run dev` | 开发服务器（HTTPS + 局域网可访问） |
| `npm run build` | TypeScript 检查 + 生产构建（输出 `dist/`） |
| `npm run preview` | 以 HTTPS 预览生产构建——**验证离线/PWA 用这个**（dev 模式不启用 Service Worker） |
| `npm test` | 单元测试（切块/切句/页眉页脚/搜索/质量检测） |
| `npm run typecheck` | 严格类型检查（含未使用变量/参数） |
| `npm run check` | typecheck + test + build 一键全量检查 |
| `npm run cert` | 重新生成本地 HTTPS 证书 |
| `npm run prepare-assets` | 重新生成图标与 pdf.js 资源（幂等） |
| `npm run make-test-pdf` | 生成 6 页测试 PDF（`test/fixtures/sample.pdf`，gitignore 状态，按需生成） |

### 离线 / PWA 验证（M5 一部分）

`npm run build && npm run preview`，手机访问终端打印的 HTTPS 地址 → 添加到主屏幕 → 开飞行模式打开应用，验证书架/阅读可用。

### 部署（Cloudflare Pages）

`npm run build` 后把 `dist/` 发布到 Cloudflare Pages（`public/_redirects` 已配置 SPA 回退），自动获得 HTTPS，即可随时随地访问。

## Git

`.gitignore` 已覆盖依赖/构建产物/本地证书/环境变量/测试产物。项目尚未初始化仓库，需要时：

```bash
git init && git add -A && git commit -m "VoxRead 方案A v0.1"
```

## 已知限制（方案A）

- iOS 锁屏 / 切后台：系统会暂停朗读（评估判据 #1，M5 重点验证项）
- 部分安卓机型 `speechSynthesis.pause()` 表现为"读完当前句再停"
- iOS 未"添加到主屏幕"的站点 7 天不访问会被清空书库（应用内有引导）
- 系统音色的瑕疵（偶发漏字/掐头）已做多级对策（分段合成/预热短句/句间间隙/熔断），但这是 Web Speech 的天花板；若真机验证不达标则切方案B
- 解析失败时错误横幅会显示失败阶段 + 错误类型 + 位置，长按可复制

兼容性备忘（升级 pdf.js 前必读，详见方案A文档 §5/§7）：

- pdf.js 必须用 **legacy 构建**（iOS Safari 缺 `Promise.withResolvers` 等新 API）
- `getTextContent` 依赖 **ReadableStream 异步迭代**，iOS WebKit 缺失 → `src/lib/readableStreamPolyfill.ts` 已补齐，且需同时注入 worker（`src/lib/pdfWorkerShim.ts`）
- worker 必须经 Vite `?worker` 引入（`?url` 在 dev 下会被转换注入 `/@vite/client` 导致解析挂起）
- 封面渲染用 **print intent**（display intent 依赖 rAF，页面被节流时会永久挂起）
