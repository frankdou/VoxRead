import { Pause, Play, Settings } from 'lucide-react'

interface Props {
  playing: boolean
  paused: boolean
  rate: number
  onToggle: () => void
  onRate: () => void
  onSettings: () => void
}

export default function PlayerBar({
  playing,
  paused,
  rate,
  onToggle,
  onRate,
  onSettings,
}: Props) {
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto flex max-w-prose items-center gap-2 px-4 py-2.5">
        <button
          onClick={onToggle}
          aria-label={playing && !paused ? '暂停' : '播放'}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 active:scale-95"
        >
          {playing && !paused ? <Pause size={26} fill="currentColor" /> : <Play size={26} fill="currentColor" className="ml-0.5" />}
        </button>
        <div className="flex-1" />
        <button
          onClick={() => onRate()}
          aria-label="语速"
          className="flex h-9 min-w-14 items-center justify-center rounded-full bg-slate-100 px-2 text-sm font-medium tabular-nums dark:bg-slate-800"
        >
          {rate}×
        </button>
        <button
          onClick={onSettings}
          aria-label="设置"
          className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 active:bg-slate-100 dark:text-slate-300 dark:active:bg-slate-800"
        >
          <Settings size={20} />
        </button>
      </div>
    </div>
  )
}
