import type { FinishRecord, Event } from '@/types'
import { calcNetTime, formatTime, formatNetTime } from './time'

export function generateCsv(records: FinishRecord[], event: Event): string {
  const sorted = [...records].sort((a, b) =>
    calcNetTime(event.start_time, a.finish_time) - calcNetTime(event.start_time, b.finish_time)
  )
  const header = 'bib,finish_time,net_time'
  const rows = sorted.map((r) => {
    const finishFormatted = formatTime(r.finish_time, event.timezone)
    const netMs = calcNetTime(event.start_time, r.finish_time)
    return `${r.bib_number},${finishFormatted},${formatNetTime(netMs)}`
  })
  return [header, ...rows].join('\n')
}

export function downloadCsv(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
