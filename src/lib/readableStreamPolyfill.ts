/**
 * ReadableStream 异步迭代 polyfill。
 * pdf.js v6 的 getTextContent 内部用 `for await...of` 消费 ReadableStream（legacy 构建也未补齐），
 * iOS WebKit 对 ReadableStream 异步迭代的支持远晚于桌面浏览器，缺失时 for-await 直接抛
 * "undefined is not a function"。这里按规范语义手动补齐（基于 getReader() 的标准实现）。
 * 主线程与 pdf.js worker 均需安装（worker 经由 pdfWorkerShim 引入本模块）。
 */

export function installReadableStreamAsyncIteration(): void {
  const proto = ReadableStream.prototype as unknown as Record<PropertyKey, unknown>
  if (typeof proto[Symbol.asyncIterator] === 'function') return

  const makeIterator = (
    stream: ReadableStream<unknown>,
    preventCancel: boolean,
  ): AsyncIterableIterator<unknown> => {
    const reader = stream.getReader()
    return {
      next: () => reader.read(),
      async return(value?: unknown) {
        if (!preventCancel) await reader.cancel(value)
        return { done: true, value: undefined }
      },
      [Symbol.asyncIterator]() {
        return this
      },
    }
  }

  if (typeof proto.values !== 'function') {
    proto.values = function (this: ReadableStream<unknown>, options?: { preventCancel?: boolean }) {
      return makeIterator(this, options?.preventCancel === true)
    }
  }
  proto[Symbol.asyncIterator] = function (
    this: ReadableStream<unknown>,
    options?: { preventCancel?: boolean },
  ) {
    return makeIterator(this, options?.preventCancel === true)
  }
}

installReadableStreamAsyncIteration()
