import type { BridgeWorkTime } from '@askx/core'

/** 归一化后的工作时间窗口，使用当天分钟和次日分钟表示。 */
export interface NormalizedWorkTimeWindow {
  /** 起始分钟，范围 0 到 1439。 */
  startMinute: number
  /** 结束分钟，范围 0 到 1439；小于起点表示跨午夜。 */
  endMinute: number
}

/** 工作时间当前判定结果。 */
export interface WorkTimeStatus {
  /** 当前是否允许启动桥接 runtime。 */
  insideWindow: boolean
  /** 下一个工作时间边界。 */
  nextTransitionAt: string | null
}

/** 将 HH:mm 转换为当天分钟。 */
export function minuteOfDay(value: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  if (!match) throw new Error(`Invalid work time: ${value}`)
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) throw new Error(`Invalid work time: ${value}`)
  return hour * 60 + minute
}

/** 将 Core 配置中的窗口转换成调度器使用的分钟结构。 */
export function normalizeWorkTime(workTime: BridgeWorkTime): NormalizedWorkTimeWindow[] {
  if (workTime.mode === 'always') return []
  if (!workTime.window) throw new Error('Work time window is required')
  const window = { startMinute: minuteOfDay(workTime.window.start), endMinute: minuteOfDay(workTime.window.end) }
  const length = window.endMinute > window.startMinute ? window.endMinute - window.startMinute : 1440 - window.startMinute + window.endMinute
  if (length <= 0 || length >= 1440) throw new Error('Work time window must cover less than one day')
  return [window]
}

/** 计算当前时刻和下一次窗口边界。 */
export function getWorkTimeStatus(workTime: BridgeWorkTime, now = new Date()): WorkTimeStatus {
  if (workTime.mode === 'always') return { insideWindow: true, nextTransitionAt: null }
  const windows = normalizeWorkTime(workTime)
  const currentMinute = now.getHours() * 60 + now.getMinutes()
  const inside = windows.some((window) => window.startMinute < window.endMinute
    ? currentMinute >= window.startMinute && currentMinute < window.endMinute
    : currentMinute >= window.startMinute || currentMinute < window.endMinute)
  const candidates = windows.flatMap((window) => [window.startMinute, window.endMinute]).map(minute => { const next = new Date(now); next.setHours(Math.floor(minute / 60), minute % 60, 0, 0); if (next <= now) next.setDate(next.getDate() + 1); return next })
  candidates.sort((a, b) => a.getTime() - b.getTime())
  return { insideWindow: inside, nextTransitionAt: candidates[0]?.toISOString() ?? null }
}
