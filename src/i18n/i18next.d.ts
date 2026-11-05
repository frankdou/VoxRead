import 'i18next'
import zhHans from './locales/zh-Hans'

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation'
    resources: {
      translation: typeof zhHans
    }
  }
}
