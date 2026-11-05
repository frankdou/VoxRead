import { useEffect, useRef, useState } from 'react'
import { Popup } from 'antd-mobile'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useKeyboardOverlap } from '../hooks/useKeyboardOverlap'

interface Props {
  open: boolean
  total: number
  current: number
  onClose: () => void
  onJump: (target: number) => void
}

/** 首屏与每次追加渲染的方块数量（大书按需渲染） */
const STEP = 120

export default function PageJumpSheet({ open, total, current, onClose, onJump }: Props) {
  const { t } = useTranslation()
  const [count, setCount] = useState(STEP)
  const gridRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  // 输入页码时键盘升起，把弹层抬到键盘上方
  const keyboardOverlap = useKeyboardOverlap(open)

  useEffect(() => {
    if (open) setCount(Math.min(STEP, total))
  }, [open, total])

  // 打开时滚动到当前块
  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => {
      gridRef.current
        ?.querySelector(`[data-chunk="${current}"]`)
        ?.scrollIntoView({ block: 'center' })
    }, 150)
    return () => window.clearTimeout(timer)
  }, [open, current])

  // 滚动到底部哨兵时追加渲染更多方块
  useEffect(() => {
    if (!open) return
    const el = sentinelRef.current
    if (!el) return
    const io = new IntersectionObserver(
      entries => {
        if (entries.some(e => e.isIntersecting)) {
          setCount(c => Math.min(c + STEP, total))
        }
      },
      { root: gridRef.current, rootMargin: '400px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [open, total])

  const tile = (n: number) => {
    const base =
      'flex h-9 items-center justify-center rounded-lg text-xs tabular-nums transition-transform active:scale-90'
    if (n === current) return `${base} bg-indigo-600 font-semibold text-white`
    if (n < current)
      return `${base} bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300`
    return `${base} bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300`
  }

  return (
    <Popup
      visible={open}
      onMaskClick={onClose}
      position="bottom"
      destroyOnClose
      onClose={onClose}
      bodyStyle={{
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        bottom: keyboardOverlap || 0,
      }}
    >
      <div className="px-5 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3.5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-base font-semibold">{t('jump.title')}</p>
            <p className="mt-0.5 text-xs text-slate-400">
              {t('jump.subtitle', { total })}
            </p>
          </div>
          <button onClick={onClose} aria-label={t('common.close')} className="text-slate-400">
            <X size={20} />
          </button>
        </div>
        <div ref={gridRef} className="mt-3 max-h-[52vh] overflow-y-auto">
          <div className="grid grid-cols-8 gap-1.5">
            {Array.from({ length: Math.min(count, total) }, (_, n) => (
              <button key={n} data-chunk={n} className={tile(n)} onClick={() => {
                onJump(n)
                onClose()
              }}>
                {n + 1}
              </button>
            ))}
          </div>
          {count < total && <div ref={sentinelRef} className="h-10" />}
          {count >= total && total > 0 && (
            <p className="py-3 text-center text-xs text-slate-400">{t('jump.end')}</p>
          )}
        </div>
      </div>
    </Popup>
  )
}
