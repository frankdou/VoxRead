import { Volume2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { speechEngine } from '../adapters/webSpeech'
import {
  LANGUAGE_GROUPS,
  LANGUAGE_LABEL_KEYS,
  VOICE_PREVIEW_TEXT,
  voiceGroupCode,
  type TextLang,
} from '../lib/voices'

interface Props {
  voices: SpeechSynthesisVoice[]
  selectedURI: string | null
  rate: number
  /** 书籍语言：只展示该语言的音色；该语言没有可用音色时回退展示全部并提示 */
  lang?: TextLang | null
  onSelect: (voiceURI: string) => void
}

/** 音色列表：按语言分组，点名称选中、点试听听效果（设置面板与阅读页快捷切换共用） */
export default function VoiceList({ voices, selectedURI, rate, lang, onSelect }: Props) {
  const { t } = useTranslation()
  if (voices.length === 0) {
    return <p className="text-sm text-slate-400">{t('voice.empty')}</p>
  }
  const matching = lang ? voices.filter(v => voiceGroupCode(v.lang) === lang) : voices
  // 该书语言没有任何音色时不能出现空列表：回退到全部音色并明确提示
  const noLanguageVoice = lang != null && matching.length === 0
  const shown = noLanguageVoice ? voices : matching
  const groups = lang && !noLanguageVoice
    ? LANGUAGE_GROUPS.filter(g => g.code === lang)
    : LANGUAGE_GROUPS
  return (
    <>
      {noLanguageVoice && lang && (
        <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
          {t('voice.noLanguageVoice', { language: t(LANGUAGE_LABEL_KEYS[lang]) })}
        </p>
      )}
      {groups.map(group => {
        const groupVoices = shown.filter(v => voiceGroupCode(v.lang) === group.code)
        if (groupVoices.length === 0) return null
        return (
          <div key={group.rank} className="mb-2">
            <p className="mb-1 mt-3 text-xs font-medium text-slate-400">{t(group.labelKey)}</p>
            <div className="space-y-1">
              {groupVoices.map(v => {
                const selected = v.voiceURI === selectedURI
                return (
                  <div
                    key={v.voiceURI}
                    className={`flex items-center gap-2 rounded-lg px-2 py-2 ${
                      selected
                        ? 'bg-indigo-50 dark:bg-indigo-500/10'
                        : 'active:bg-slate-50 dark:active:bg-slate-800'
                    }`}
                  >
                    <button className="min-w-0 flex-1 text-left" onClick={() => onSelect(v.voiceURI)}>
                      <p className="truncate text-sm">
                        {selected ? '✓ ' : ''}
                        {v.name}
                      </p>
                      <p className="text-xs text-slate-400">
                        {v.lang}
                        {' · '}
                        {t(v.localService ? 'voice.local' : 'voice.online')}
                      </p>
                    </button>
                    <button
                      className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs dark:bg-slate-800"
                      onClick={() =>
                        speechEngine.preview(
                          VOICE_PREVIEW_TEXT[voiceGroupCode(v.lang) ?? 'zh'],
                          { rate, voiceURI: v.voiceURI },
                        )
                      }
                    >
                      <Volume2 size={13} />
                      {t('voice.preview')}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </>
  )
}
