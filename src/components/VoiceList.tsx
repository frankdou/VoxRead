import { Volume2 } from 'lucide-react'
import { speechEngine } from '../adapters/webSpeech'
import {
  FALLBACK_PREVIEW_TEXT,
  LANGUAGE_GROUPS,
  VOICE_PREVIEW_TEXT,
  languageLabel,
  voiceGroupLabel,
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
  if (voices.length === 0) {
    return (
      <p className="text-sm text-slate-400">
        未获取到系统音色（部分浏览器需要先触发一次朗读或下载语音包）
      </p>
    )
  }
  const targetLabel = lang ? languageLabel(lang) : null
  const matching = targetLabel
    ? voices.filter(v => voiceGroupLabel(v.lang) === targetLabel)
    : voices
  // 该书语言没有任何音色时不能出现空列表：回退到全部音色并明确提示
  const noLanguageVoice = targetLabel !== null && matching.length === 0
  const shown = noLanguageVoice ? voices : matching
  const groups = lang && !noLanguageVoice
    ? LANGUAGE_GROUPS.filter(g => g.code === lang)
    : LANGUAGE_GROUPS
  return (
    <>
      {noLanguageVoice && (
        <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
          系统没有可用的{targetLabel}音色，已显示全部可用音色
        </p>
      )}
      {groups.map(group => {
        const groupVoices = shown.filter(v => voiceGroupLabel(v.lang) === group.label)
        if (groupVoices.length === 0) return null
        return (
          <div key={group.rank} className="mb-2">
            <p className="mb-1 mt-3 text-xs font-medium text-slate-400">{group.label}</p>
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
                        {v.localService ? ' · 本地' : ' · 在线'}
                      </p>
                    </button>
                    <button
                      className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs dark:bg-slate-800"
                      onClick={() =>
                        speechEngine.preview(
                          VOICE_PREVIEW_TEXT[voiceGroupLabel(v.lang) ?? '中文'] ?? FALLBACK_PREVIEW_TEXT,
                          { rate, voiceURI: v.voiceURI },
                        )
                      }
                    >
                      <Volume2 size={13} />
                      试听
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
