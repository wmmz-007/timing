export function calcNetTime(startIso: string | undefined, finishIso: string): number {
  if (!startIso) return 0
  return new Date(finishIso).getTime() - new Date(startIso).getTime()
}

export function formatTime(iso: string | undefined, timezone: string): string {
  if (!iso) return '--:--:--'
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(iso))
}

export function formatNetTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':')
}

import type { Athlete, EventDistance } from '@/types'

export function getDistanceStartTime(
  bib: string,
  athletes: Athlete[],
  distances: EventDistance[]
): string | null {
  const athlete = athletes.find((a) => a.bib_number === bib)
  if (athlete) {
    const dist = distances.find((d) => d.id === athlete.distance_id)
    if (dist) return dist.start_time
  }
  // Fallback: earliest distance by start_time
  if (distances.length === 0) return null
  return [...distances].sort(
    (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
  )[0].start_time
}
