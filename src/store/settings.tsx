import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { repository } from '../adapters/indexeddb'
import type { Settings } from '../types'

const DEFAULTS: Settings = { id: 'global', rate: 1, voiceURI: null, theme: 'light', fontSize: 18 }

interface SettingsCtx {
  settings: Settings
  update: (patch: Partial<Settings>) => void
}

const Ctx = createContext<SettingsCtx>({ settings: DEFAULTS, update: () => {} })

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULTS)

  useEffect(() => {
    repository.getSettings().then(s => {
      if (s) setSettings(s)
    })
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', settings.theme === 'dark')
    // antd-mobile 的暗色主题走 data-prefers-color-scheme 属性选择器
    document.documentElement.setAttribute(
      'data-prefers-color-scheme',
      settings.theme === 'dark' ? 'dark' : 'light',
    )
    document.documentElement.style.setProperty('--reader-font-size', `${settings.fontSize}px`)
  }, [settings.theme, settings.fontSize])

  const update = (patch: Partial<Settings>) => {
    setSettings(prev => {
      const next = { ...prev, ...patch }
      repository.saveSettings(next)
      return next
    })
  }

  return <Ctx.Provider value={{ settings, update }}>{children}</Ctx.Provider>
}

export const useSettings = () => useContext(Ctx)
