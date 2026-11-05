import { useEffect, useState } from 'react'
import { Popup } from 'antd-mobile'
import { X } from 'lucide-react'
import { useSettings } from '../store/settings'

interface Props {
  open: boolean
  onClose: () => void
}

export default function SettingsSheet({ open, onClose }: Props) {
  const { settings, update } = useSettings()
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null)

  useEffect(() => {
    if (!open) return
    navigator.storage?.estimate?.().then(e => {
      if (e.quota) setStorage({ usage: e.usage ?? 0, quota: e.quota })
    })
  }, [open])

  const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`

  return (
    <Popup
      visible={open}
      onMaskClick={onClose}
      position="bottom"
      destroyOnClose
      onClose={onClose}
      bodyStyle={{ borderTopLeftRadius: 16, borderTopRightRadius: 16 }}
    >
      <div className="max-h-[78vh] overflow-y-auto pb-[calc(env(safe-area-inset-bottom)+8px)] pt-3.5">
        <div className="sticky top-0 z-10 mb-1 flex items-center justify-between bg-white px-5 py-2 dark:bg-slate-900">
          <h2 className="text-base font-semibold">设置</h2>
          <button onClick={onClose} aria-label="关闭" className="text-slate-400">
            <X size={20} />
          </button>
        </div>

        <section className="px-5 py-4">
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
            <p className="text-xs text-slate-400">
              本地存储已用 {mb(storage.usage)} / 可用约 {mb(storage.quota)}
            </p>
          )}
        </section>
      </div>
    </Popup>
  )
}
