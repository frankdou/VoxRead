import { Popup } from 'antd-mobile'
import { X } from 'lucide-react'
import { speechEngine } from '../adapters/webSpeech'
import { useSettings } from '../store/settings'
import VoiceList from './VoiceList'

interface Props {
  open: boolean
  onClose: () => void
  voices: SpeechSynthesisVoice[]
}

/** 读书页的音色快捷切换：点选即生效，不用再进设置面板翻列表 */
export default function VoiceSheet({ open, onClose, voices }: Props) {
  const { settings, update } = useSettings()

  const close = () => {
    // 关面板时停掉还在播的试听；此前若在朗读正文会接着读回去
    speechEngine.stopPreview()
    onClose()
  }

  const select = (voiceURI: string) => {
    speechEngine.stopPreview()
    update({ voiceURI })
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
          <h2 className="text-base font-semibold">音色</h2>
          <button onClick={close} aria-label="关闭" className="text-slate-400">
            <X size={20} />
          </button>
        </div>
        <div className="px-5 pb-4">
          <p className="mb-1 text-xs text-slate-400">点选后立即生效；开关面板不影响正在进行的朗读</p>
          <VoiceList
            voices={voices}
            selectedURI={settings.voiceURI}
            rate={settings.rate}
            onSelect={select}
          />
        </div>
      </div>
    </Popup>
  )
}
