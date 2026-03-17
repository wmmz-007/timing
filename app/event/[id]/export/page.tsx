'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import type { Event, FinishRecord, EventDistance, Athlete, SubgroupPrizeOverride } from '@/types'
import { getEvent, getDistancesForEvent, getAthletesForEvent, getSubgroupOverrides, getFinishRecords } from '@/lib/db'
import { getEventById, saveEvent, getDistances, saveDistances, getAthletes, saveAthletes } from '@/lib/storage'
import { generateCsv, downloadCsv } from '@/lib/export'
import { computeRanks } from '@/lib/ranking'
import { Download } from 'lucide-react'

export default function ExportPage() {
  const { id } = useParams<{ id: string }>()
  const [event, setEvent] = useState<Event | null>(null)
  const [records, setRecords] = useState<FinishRecord[]>([])
  const [distances, setDistances] = useState<EventDistance[]>([])
  const [athletes, setAthletes] = useState<Athlete[]>([])
  const [overrides, setOverrides] = useState<SubgroupPrizeOverride[]>([])

  useEffect(() => {
    let cancelled = false

    async function load() {
      const local = getEventById(id)
      const ev = local ?? await getEvent(id)
      if (cancelled || !ev) return
      if (!local) saveEvent(ev)
      setEvent(ev)

      let dists: EventDistance[]
      let aths: Athlete[]
      if (navigator.onLine) {
        ;[dists, aths] = await Promise.all([getDistancesForEvent(id), getAthletesForEvent(id)])
        if (cancelled) return
        saveDistances(id, dists); saveAthletes(id, aths)
      } else {
        dists = getDistances(id); aths = getAthletes(id)
      }
      setDistances(dists); setAthletes(aths)

      if (navigator.onLine) {
        const ovrs = await getSubgroupOverrides(id)
        if (cancelled) return
        setOverrides(ovrs)
      }

      const recs = await getFinishRecords(id)
      if (cancelled) return
      setRecords(recs)
    }

    load()
    return () => { cancelled = true }
  }, [id])

  function handleDownload() {
    if (!event) return
    const rankMap = computeRanks(records, athletes, distances, overrides, event.overall_lockout)
    const csv = generateCsv(records, event, athletes, distances, rankMap)
    const sorted = [...distances].sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
    const date = sorted[0]?.start_time.slice(0, 10) ?? new Date().toISOString().slice(0, 10)
    downloadCsv(csv, `timing-${date}.csv`)
  }

  if (!event) {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-400">กำลังโหลด...</p></div>
  }

  return (
    <main className="px-6 pt-8 pb-6 max-w-sm mx-auto">
      <h1 className="text-2xl font-semibold tracking-tight mb-1">ส่งออก CSV</h1>
      <p className="text-sm text-gray-400 mb-6">{event.name}</p>

      <div className="bg-gray-50 rounded-2xl p-4 mb-6 text-sm space-y-1">
        <p className="text-gray-500">จำนวนบันทึก: <span className="font-semibold text-gray-900">{records.length} คน</span></p>
        <p className="text-gray-500">จำนวนนักกีฬา: <span className="font-semibold text-gray-900">{athletes.length} คน</span></p>
        {distances.map((d) => (
          <p key={d.id} className="text-gray-500">
            {d.name}: <span className="font-mono font-semibold text-gray-900">
              {new Intl.DateTimeFormat('en-GB', { timeZone: event.timezone, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(d.start_time))}
            </span>
          </p>
        ))}
      </div>

      <button
        onClick={handleDownload}
        disabled={records.length === 0}
        className="w-full bg-black text-white rounded-xl py-4 text-base font-medium disabled:opacity-40 flex items-center justify-center gap-2"
      >
        <Download size={18} /> ดาวน์โหลด CSV
      </button>

      <p className="mt-4 text-xs text-gray-400 text-center">
        คอลัมน์: bib, name, distance, gender, age_group, finish_time, net_time, overall_rank, division_rank
      </p>
    </main>
  )
}
