import { useEffect, useRef, useState } from 'react'
import { Popup } from 'antd-mobile'
import { Volume2, X } from 'lucide-react'
import { speechEngine } from '../adapters/webSpeech'
import { repository, ImportError } from '../adapters/indexeddb'
import { LANGUAGE_GROUPS, voiceGroupLabel } from '../lib/voices'

/** 各语言的试听文案：试听强制用点选的音色，文案必须与音色语言一致才能真实试出效果 */
const PREVIEW_TEXT: Record<string, string> = {
  中文: '你好，我是你的专属读书声。翻开一本书，就像推开一扇窗，让故事自己走进来。',
  English: "Hello, I'm your reading voice. Open a book, and let the story carry you away.",
  日本語: 'こんにちは、私があなたの読み上げの声です。物語の世界へご案内します。',
}

/** 各语言关闭面板时的兜底试听文案（音色语言无法归组时用中文） */
const FALLBACK_PREVIEW = PREVIEW_TEXT['中文']
import { useSettings } from '../store/settings'

interface Props {
  open: boolean
  onClose: () => void
  onMessage?: (msg: string) => void
}

export default function SettingsSheet({ open, onClose, onMessage }: Props) {
  const { settings, update } = useSettings()
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null)
  const importRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    const refresh = () => setVoices(speechEngine.getVoices())
    refresh()
    window.speechSynthesis.addEventListener('voiceschanged', refresh)
    navigator.storage?.estimate?.().then(e => {
      if (e.quota) setStorage({ usage: e.usage ?? 0, quota: e.quota })
    })
    return () => window.speechSynthesis.removeEventListener('voiceschanged', refresh)
  }, [open])

  const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`

  const close = () => {
    // 关闭设置面板时停掉还在播的试听；此前若在朗读正文会接着读回去
    speechEngine.stopPreview()
    onClose()
  }

  const exportLibrary = async () => {
    const blob = await repository.exportAll()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `voxread-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    onMessage?.('书库已导出')
  }

  const importLibrary = async (file: File) => {
    try {
      const data = JSON.parse(await file.text())
      const count = (data.books ?? []).length
      if (!window.confirm(`将导入 ${count} 本书（相同 ID 的书会被覆盖），继续？`)) return
      const res = await repository.importJson(data)
      onMessage?.(`已恢复 ${res.books} 本书`)
    } catch (e) {
      onMessage?.(e instanceof ImportError ? e.message : '恢复失败，文件格式可能不正确')
    }
  }

  return (
    <Popup
      visible={open}
      onMaskClick={close}
      position="bottom"
      destroyOnClose
      onClose={close}
      bodyStyle={{ borderTopLeftRadius: 16, borderTopRightRadius: 16 }}
    >
      <div className="max-h-[78vh] overflow-y-auto pb-[calc(env(safe-area-inset-bottom)+8px)] pt-3.5">
        <div className="sticky top-0 z-10 mb-1 flex items-center justify-between bg-white px-5 py-2 dark:bg-slate-900">
          <h2 className="text-base font-semibold">设置</h2>
          <button onClick={close} aria-label="关闭" className="text-slate-400">
            <X size={20} />
          </button>
        </div>

        <section className="px-5 py-4">
          <h3 className="mb-2 text-sm font-medium text-slate-500">
            音色 <span className="font-normal text-slate-400">（支持中文 / 英文 / 日语）</span>
          </h3>
          {voices.length === 0 && (
            <p className="text-sm text-slate-400">
              未获取到系统音色（部分浏览器需要先触发一次朗读或下载语音包）
            </p>
          )}
          {LANGUAGE_GROUPS.map(group => {
            const groupVoices = voices.filter(v => voiceGroupLabel(v.lang) === group.label)
            if (groupVoices.length === 0) return null
            return (
              <div key={group.rank} className="mb-2">
                <p className="mb-1 mt-3 text-xs font-medium text-slate-400">{group.label}</p>
                <div className="space-y-1">
                  {groupVoices.map(v => (
                    <div
                      key={v.voiceURI}
                      className="flex items-center gap-2 rounded-lg px-2 py-2 active:bg-slate-50 dark:active:bg-slate-800"
                    >
                      <button
                        className="min-w-0 flex-1 text-left"
                        onClick={() => update({ voiceURI: v.voiceURI })}
                      >
                        <p className="truncate text-sm">
                          {v.voiceURI === settings.voiceURI ? '✓ ' : ''}
                          {v.name}
                        </p>
                        <p className="text-xs text-slate-400">
                          {v.lang}
                          {v.localService ? ' · 本地' : ' · 在线'}
                        </p>
                      </button>
                      <button
                        className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs dark:bg-slate-800"
                        onClick={() =>
                          speechEngine.preview(
                            PREVIEW_TEXT[voiceGroupLabel(v.lang) ?? '中文'] ?? FALLBACK_PREVIEW,
                            {
                              rate: settings.rate,
                              voiceURI: v.voiceURI,
                            },
                          )
                        }
                      >
                        <Volume2 size={13} />
                        试听
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </section>

        <section className="border-t border-slate-100 px-5 py-4 dark:border-slate-800">
          <h3 className="mb-2 text-sm font-medium text-slate-500">
            语速 <span className="tabular-nums text-slate-900 dark:text-slate-100">{settings.rate}×</span>
          </h3>
          <input
            type="range"
            min={0.5}
            max={2}
            step={0.25}
            value={settings.rate}
            onChange={e => update({ rate: Number(e.target.value) })}
            className="w-full accent-indigo-600"
          />
        </section>

        <section className="border-t border-slate-100 px-5 py-4 dark:border-slate-800">
          <h3 className="mb-2 text-sm font-medium text-slate-500">
            阅读字号 <span className="tabular-nums text-slate-900 dark:text-slate-100">{settings.fontSize}px</span>
          </h3>
          <input
            type="range"
            min={16}
            max={26}
            step={1}
            value={settings.fontSize}
            onChange={e => update({ fontSize: Number(e.target.value) })}
            className="w-full accent-indigo-600"
          />
        </section>

        <section className="border-t border-slate-100 px-5 py-4 dark:border-slate-800">
          <h3 className="mb-2 text-sm font-medium text-slate-500">主题</h3>
          <div className="flex gap-2">
            {(['light', 'dark'] as const).map(t => (
              <button
                key={t}
                onClick={() => update({ theme: t })}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm ${
                  settings.theme === t
                    ? 'border-indigo-600 bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300'
                    : 'border-slate-200 dark:border-slate-700'
                }`}
              >
                {t === 'light' ? '浅色' : '深色'}
              </button>
            ))}
          </div>
        </section>

        <section className="border-t border-slate-100 px-5 py-4 dark:border-slate-800">
          <h3 className="mb-2 text-sm font-medium text-slate-500">数据</h3>
          {storage && (
            <p className="mb-2 text-xs text-slate-400">
              本地存储已用 {mb(storage.usage)} / 可用约 {mb(storage.quota)}
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={exportLibrary}
              className="flex-1 rounded-lg bg-slate-100 px-3 py-2 text-sm dark:bg-slate-800"
            >
              导出书库备份
            </button>
            <button
              onClick={() => importRef.current?.click()}
              className="flex-1 rounded-lg bg-slate-100 px-3 py-2 text-sm dark:bg-slate-800"
            >
              恢复书库
            </button>
          </div>
          <input
            ref={importRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0]
              if (f) importLibrary(f)
              e.target.value = ''
            }}
          />
        </section>
      </div>
    </Popup>
  )
}
