import { useEffect, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { applyDocumentLocale, currentLocale } from './index'

/** 挂在应用根：语言变化时同步 <html lang> 与 document.title，其余交给 react-i18next */
export function I18nProvider({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation()

  useEffect(() => {
    const sync = () => applyDocumentLocale(currentLocale())
    sync()
    i18n.on('languageChanged', sync)
    return () => {
      i18n.off('languageChanged', sync)
    }
  }, [i18n])

  return <>{children}</>
}
