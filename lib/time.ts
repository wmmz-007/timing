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
