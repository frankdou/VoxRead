/** 跳块入口来源：翻页箭头 / 页码跳转 / 搜索命中 */
export type JumpSource = 'arrow' | 'page' | 'search'

/**
 * 跳块时是否沿用当前朗读会话：
 * - 翻页箭头（arrow）：正在朗读则继续读
 * - 页码跳转（page）、搜索命中（search）：一律停止朗读，不自动续读
 */
export function shouldContinueReading(source: JumpSource, wasActive: boolean): boolean {
  return source === 'arrow' && wasActive
}
