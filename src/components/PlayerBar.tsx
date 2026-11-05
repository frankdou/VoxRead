import { AudioLines, Pause, Play, Settings } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface Props {
  playing: boolean
  paused: boolean
  /** 当前音色名（未选择/未加载时为空） */
  voiceName: string | null
  onToggle: () => void
  onVoice: () => void
  onSettings: () => void
}

export default function PlayerBar({
  playing,
  paused,
  voiceName,
  onToggle,
  onVoice,
  onSettings,
}: Props) {
  const { t } = useTranslation()

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto flex max-w-prose items-center gap-4 px-4 py-2.5">
        <button
          onClick={onToggle}
          aria-label={playing && !paused ? t('player.pause') : t('player.play')}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 active:scale-95"
        >
          {playing && !paused ? <Pause size={26} fill="currentColor" /> : <Play size={26} fill="currentColor" className="ml-0.5" />}
        </button>
        <div className="flex-1" />
        <button
          onClick={onVoice}
          aria-label={t('player.voice')}
          className="flex h-9 max-w-24 items-center gap-1 rounded-full bg-slate-100 px-2.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300"
        >
          <AudioLines size={15} className="shrink-0" />
          <span className="truncate">{voiceName ?? t('player.voiceFallback')}</span>
        </button>
        <button
          onClick={onSettings}
          aria-label={t('player.settings')}
          className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 active:bg-slate-100 dark:text-slate-300 dark:active:bg-slate-800"
        >
          <Settings size={20} />
        </button>
      </div>
    </div>
  )
}
