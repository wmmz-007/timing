import type { FinishRecord, Event, Athlete, EventDistance } from '@/types'
import type { RankMap } from './ranking'
import { getDistanceStartTime, formatTime, formatNetTime, calcNetTime } from './time'

export function generateCsv(
  records: FinishRecord[],
  event: Event,
  athletes: Athlete[],
  distances: EventDistance[],
  rankMap: RankMap
): string {
  const athleteByBib = new Map(athletes.map((a) => [a.bib_number, a]))
  const distanceById = new Map(distances.map((d) => [d.id, d]))

  const sorted = [...records].sort((a, b) => {
    const startA = getDistanceStartTime(a.bib_number, athletes, distances) ?? ''
    const startB = getDistanceStartTime(b.bib_number, athletes, distances) ?? ''
    return calcNetTime(startA, a.finish_time) - calcNetTime(startB, b.finish_time)
  })

  const header = 'bib,name,distance,gender,age_group,finish_time,net_time,overall_rank,division_rank'

  const rows = sorted.map((r) => {
    const athlete = athleteByBib.get(r.bib_number)
    const dist = athlete ? distanceById.get(athlete.distance_id) : undefined
    const startTime = getDistanceStartTime(r.bib_number, athletes, distances)
    const finishFormatted = formatTime(r.finish_time, event.timezone)
    const netTime = startTime ? formatNetTime(calcNetTime(startTime, r.finish_time)) : ''
    const ranks = rankMap.get(r.bib_number)
    return [
      r.bib_number,
      athlete?.name ?? '',
      dist?.name ?? '',
      athlete?.gender ?? '',
      athlete?.age_group ?? '',
      finishFormatted,
      netTime,
      ranks?.overallRank ?? '',
      ranks?.divisionRank ?? '',
    ].join(',')
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
