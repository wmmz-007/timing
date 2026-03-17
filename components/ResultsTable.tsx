import { useState } from 'react'
import type { FinishRecord, Event, Athlete, EventDistance } from '@/types'
import type { RankMap } from '@/lib/ranking'
import { getDistanceStartTime, formatNetTime, calcNetTime } from '@/lib/time'

interface Props {
  records: FinishRecord[]
  event: Event
  athletes: Athlete[]
  distances: EventDistance[]
  rankMap: RankMap
}

export default function ResultsTable({ records, athletes, distances, rankMap }: Props) {
  const [filterDistance, setFilterDistance] = useState('all')
  const [filterGender, setFilterGender] = useState('all')

  const athleteByBib = new Map(athletes.map((a) => [a.bib_number, a]))
  const distanceById = new Map(distances.map((d) => [d.id, d]))

  const distanceNames = [...new Set(distances.map((d) => d.name))]
  const genders = [...new Set(athletes.map((a) => a.gender).filter(Boolean))]

  const sorted = [...records].sort((a, b) => {
    const startA = getDistanceStartTime(a.bib_number, athletes, distances) ?? ''
    const startB = getDistanceStartTime(b.bib_number, athletes, distances) ?? ''
    if (!startA || !startB) return 0
    return calcNetTime(startA, a.finish_time) - calcNetTime(startB, b.finish_time)
  })

  const filtered = sorted.filter((r) => {
    const athlete = athleteByBib.get(r.bib_number)
    if (filterDistance !== 'all') {
      const dist = athlete ? distanceById.get(athlete.distance_id) : undefined
      if (dist?.name !== filterDistance) return false
    }
    if (filterGender !== 'all') {
      if (athlete?.gender !== filterGender) return false
    }
    return true
  })

  if (records.length === 0) {
    return <p className="text-gray-400 text-center text-sm py-8">ยังไม่มีผล</p>
  }

  return (
    <div className="w-full">
      {/* Filter bar */}
      {(distanceNames.length > 1 || genders.length > 0) && (
        <div className="flex gap-2 mb-3 flex-wrap">
          {distanceNames.length > 1 && (
            <select
              value={filterDistance}
              onChange={(e) => setFilterDistance(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none"
            >
              <option value="all">ทุกระยะ</option>
              {distanceNames.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          )}
          {genders.length > 0 && (
            <select
              value={filterGender}
              onChange={(e) => setFilterGender(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none"
            >
              <option value="all">ทุกเพศ</option>
              {genders.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          )}
        </div>
      )}

      {/* Table header */}
      <div className="grid grid-cols-[2rem_3rem_1fr_4rem_3rem_3rem] text-xs text-gray-400 font-medium uppercase tracking-wider pb-2 border-b border-gray-100 gap-1">
        <span>#</span>
        <span>บิบ</span>
        <span>ชื่อ</span>
        <span className="text-right">เวลาสุทธิ</span>
        <span className="text-center">OA</span>
        <span className="text-center">DIV</span>
      </div>

      {filtered.map((r, i) => {
        const athlete = athleteByBib.get(r.bib_number)
        const dist = athlete ? distanceById.get(athlete.distance_id) : undefined
        const startTime = getDistanceStartTime(r.bib_number, athletes, distances)
        const netMs = startTime ? calcNetTime(startTime, r.finish_time) : null
        const ranks = rankMap.get(r.bib_number)

        return (
          <div key={r.id} className="grid grid-cols-[2rem_3rem_1fr_4rem_3rem_3rem] py-3 border-b border-gray-50 text-sm gap-1 items-center">
            <span className="text-gray-400 font-medium text-xs">{i + 1}</span>
            <span className="font-mono font-semibold text-xs">{r.bib_number}</span>
            <div className="min-w-0">
              <p className="truncate text-xs">{athlete?.name || '—'}</p>
              {dist && <p className="text-xs text-gray-400">{dist.name}{athlete?.age_group ? ` · ${athlete.age_group}` : ''}</p>}
            </div>
            <span className="font-mono text-right text-xs">
              {netMs !== null ? formatNetTime(netMs) : '—'}
            </span>
            <span className="text-center text-xs text-gray-500">
              {ranks?.overallRank ?? '—'}
            </span>
            <span className="text-center text-xs text-gray-500">
              {ranks?.divisionRank ?? '—'}
            </span>
          </div>
        )
      })}
    </div>
  )
}
