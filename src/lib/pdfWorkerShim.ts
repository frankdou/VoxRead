// pdf.js worker 的包装入口：先安装 ReadableStream 异步迭代 polyfill（iOS WebKit 需要），再加载 worker 本体
import './readableStreamPolyfill'
import 'pdfjs-dist/legacy/build/pdf.worker.min.mjs'
