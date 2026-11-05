import type { Progress } from '../types'

export interface ResumePosition {
  seq: number
  sentenceIndex: number
}

/** 进入阅读页时把持久化进度约束到合法范围：脏数据/越界不会让定位落回 0 号块 */
export function resolveResumePosition(
  progress: Pick<Progress, 'chunkSeq' | 'sentenceIndex'> | null | undefined,
  totalChunks: number,
): ResumePosition {
  if (totalChunks <= 0) return { seq: 0, sentenceIndex: 0 }
  const int = (v: number | undefined, fallback = 0) =>
    Number.isFinite(v) ? Math.floor(v as number) : fallback
  return {
    seq: Math.min(Math.max(0, int(progress?.chunkSeq)), totalChunks - 1),
    sentenceIndex: Math.max(0, int(progress?.sentenceIndex)),
  }
}
