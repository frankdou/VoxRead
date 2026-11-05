import { useEffect, useState } from 'react'
import { Popup } from 'antd-mobile'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useSettings } from '../store/settings'
import type { AppLocale } from '../i18n/locale'
import { currentLocale, setLocale } from '../i18n'

interface Props {
  open: boolean
  onClose: () => void
}

const LANGUAGE_OPTIONS = [
  { value: 'zh-Hans', labelKey: 'language.zhHans' },
  { value: 'zh-Hant', labelKey: 'language.zhHant' },
  { value: 'ja', labelKey: 'language.ja' },
  { value: 'ko', labelKey: 'language.ko' },
  { value: 'en', labelKey: 'language.en' },
] as const

export default function SettingsSheet({ open, onClose }: Props) {
  const { t } = useTranslation()
  const { settings, update } = useSettings()
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null)
  // 无手动偏好时 currentLocale() 已是按浏览器匹配后的实际语言，默认高亮它
  const [activeLocale, setActiveLocale] = useState<AppLocale>(currentLocale)

  useEffect(() => {
    if (!open) return
    navigator.storage?.estimate?.().then(e => {
      if (e.quota) setStorage({ usage: e.usage ?? 0, quota: e.quota })
    })
  }, [open])

  const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`

  const changeLocale = (locale: AppLocale) => {
    setActiveLocale(locale)
    // 只切换界面文案与文档元信息，不触碰朗读引擎
    void setLocale(locale)
  }

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
          <h2 className="text-base font-semibold">{t('settings.title')}</h2>
          <button onClick={onClose} aria-label={t('common.close')} className="text-slate-400">
            <X size={20} />
          </button>
        </div>

        <section className="px-5 py-4">
          <h3 className="mb-2 text-sm font-medium text-slate-500">
            {t('settings.rate')}{' '}
            <span className="tabular-nums text-slate-900 dark:text-slate-100">{settings.rate}×</span>
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
            {t('settings.fontSize')}{' '}
            <span className="tabular-nums text-slate-900 dark:text-slate-100">{settings.fontSize}px</span>
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
          <h3 className="mb-2 text-sm font-medium text-slate-500">{t('settings.theme')}</h3>
          <div className="flex gap-2">
            {(['light', 'dark'] as const).map(theme => (
              <button
                key={theme}
                onClick={() => update({ theme })}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm ${
                  settings.theme === theme
                    ? 'border-indigo-600 bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300'
                    : 'border-slate-200 dark:border-slate-700'
                }`}
              >
                {t(theme === 'light' ? 'settings.themeLight' : 'settings.themeDark')}
              </button>
            ))}
          </div>
        </section>

        <section className="border-t border-slate-100 px-5 py-4 dark:border-slate-800">
          <h3 className="mb-2 text-sm font-medium text-slate-500">{t('settings.language')}</h3>
          <div className="grid grid-cols-2 gap-2">
            {LANGUAGE_OPTIONS.map(option => (
              <button
                key={option.value}
                onClick={() => changeLocale(option.value)}
                className={`rounded-lg border px-2 py-2 text-xs ${
                  activeLocale === option.value
                    ? 'border-indigo-600 bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300'
                    : 'border-slate-200 dark:border-slate-700'
                }`}
              >
                {t(option.labelKey)}
              </button>
            ))}
          </div>
        </section>

        <section className="border-t border-slate-100 px-5 py-4 dark:border-slate-800">
          <h3 className="mb-2 text-sm font-medium text-slate-500">{t('settings.data')}</h3>
          {storage && (
            <p className="text-xs text-slate-400">
              {t('settings.storageUsage', { usage: mb(storage.usage), quota: mb(storage.quota) })}
            </p>
          )}
        </section>
      </div>
    </Popup>
  )
}
