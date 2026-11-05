import { Popup } from 'antd-mobile'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { speechEngine } from '../adapters/webSpeech'
import { useSettings } from '../store/settings'
import { LANGUAGE_LABEL_KEYS, voiceGroupCode, type TextLang } from '../lib/voices'
import VoiceList from './VoiceList'

interface Props {
  open: boolean
  onClose: () => void
  voices: SpeechSynthesisVoice[]
  /** 当前书籍语言：音色列表只展示匹配语言 */
  lang?: TextLang | null
  onSelect: (voiceURI: string) => void
}

/** 读书页的音色快捷切换：点选即生效，不用再进设置面板翻列表 */
export default function VoiceSheet({ open, onClose, voices, lang, onSelect }: Props) {
  const { t } = useTranslation()
  const { settings } = useSettings()
  // 标题旁的语言：优先本书语言，缺失时回退当前生效音色的语言；都取不到就不显示
  const selectedVoice = voices.find(v => v.voiceURI === settings.voiceURI)
  const langCode = lang ?? (selectedVoice ? voiceGroupCode(selectedVoice.lang) : null)
  const langLabel = langCode ? t(LANGUAGE_LABEL_KEYS[langCode]) : null

  const close = () => {
    // 关面板时停掉还在播的试听；此前若在朗读正文会接着读回去
    speechEngine.stopPreview()
    onClose()
  }

  const select = (voiceURI: string) => {
    speechEngine.stopPreview()
    onSelect(voiceURI)
    onClose()
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
      <div className="max-h-[70vh] overflow-y-auto pb-[calc(env(safe-area-inset-bottom)+8px)] pt-3.5">
        <div className="sticky top-0 z-10 flex items-center justify-between bg-white px-5 py-2 dark:bg-slate-900">
          <h2 className="text-base font-semibold">
            {t('voice.title')}
            {langLabel && (
              <span className="ml-2 text-xs font-normal text-slate-400">· {langLabel}</span>
            )}
          </h2>
          <button onClick={close} aria-label={t('common.close')} className="text-slate-400">
            <X size={20} />
          </button>
        </div>
        <div className="px-5 pb-4">
          <p className="mb-1 text-xs text-slate-400">{t('voice.hint')}</p>
          <VoiceList
            voices={voices}
            selectedURI={settings.voiceURI}
            rate={settings.rate}
            lang={lang}
            onSelect={select}
          />
        </div>
      </div>
    </Popup>
  )
}
