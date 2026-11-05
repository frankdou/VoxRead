import { describe, expect, it } from 'vitest'
import { shouldContinueReading } from '../jump'

describe('shouldContinueReading', () => {
  it('正在朗读时翻页箭头继续朗读', () => {
    expect(shouldContinueReading('arrow', true)).toBe(true)
  })

  it('正在朗读时页码跳转必须停止朗读', () => {
    expect(shouldContinueReading('page', true)).toBe(false)
  })

  it('搜索命中不自动续读', () => {
    expect(shouldContinueReading('search', true)).toBe(false)
  })

  it('未在朗读时翻页也不启动朗读', () => {
    expect(shouldContinueReading('arrow', false)).toBe(false)
    expect(shouldContinueReading('page', false)).toBe(false)
  })
})
