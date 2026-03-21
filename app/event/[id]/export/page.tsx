'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import type { Event, FinishRecord, EventDistance, Athlete, SubgroupPrizeOverride } from '@/types'
import { getEvent, getDistancesForEvent, getAthletesForEvent, getSubgroupOverrides, getFinishRecords } from '@/lib/db'
import { getEventById, saveEvent, getDistances, saveDistances, getAthletes, saveAthletes } from '@/lib/storage'
import { generateCsv, generateChipComparisonCsv, downloadCsv } from '@/lib/export'
import { computeRanks } from '@/lib/ranking'
import { Download, ChevronLeft } from 'lucide-react'

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

  function handleDownloadChipComparison() {
    if (!event) return
    const csv = generateChipComparisonCsv(records, event)
    const sorted = [...distances].sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
    const date = sorted[0]?.start_time.slice(0, 10) ?? new Date().toISOString().slice(0, 10)
    downloadCsv(csv, `timing-chip-compare-${date}.csv`)
  }

  if (!event) {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-400">Loading...</p></div>
  }

  return (
    <main className="relative px-6 pt-8 pb-6 max-w-sm mx-auto">
      <Link href={`/event/${id}`} aria-label="back" className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-700">
        <ChevronLeft size={20} />
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight mb-1">Export CSV</h1>
      <p className="text-sm text-gray-400 mb-6">{event.name}</p>

      <div className="bg-gray-50 rounded-2xl p-4 mb-6 text-sm space-y-1">
        <p className="text-gray-500">Records: <span className="font-semibold text-gray-900">{records.length}</span></p>
        <p className="text-gray-500">Athletes: <span className="font-semibold text-gray-900">{athletes.length}</span></p>
      </div>

      <button
        onClick={handleDownload}
        disabled={records.length === 0}
        className="w-full bg-black text-white rounded-xl py-4 text-base font-medium disabled:opacity-40 flex items-center justify-center gap-2"
      >
        <Download size={18} /> Download CSV
      </button>

      <button
        type="button"
        onClick={handleDownloadChipComparison}
        disabled={records.length === 0}
        className="mt-3 w-full border border-gray-300 bg-white text-gray-900 rounded-xl py-4 text-base font-medium disabled:opacity-40 flex items-center justify-center gap-2 hover:bg-gray-50"
      >
        <Download size={18} /> Download chip compare
      </button>

      <p className="mt-4 text-xs text-gray-400 text-center">
        Columns: bib, name, distance, gender, age_group, finish_time, net_time, overall_rank, division_rank
      </p>
      <p className="mt-2 text-xs text-gray-400 text-center">
        Chip compare: bib, finish_time_local, finish_time_utc
      </p>
    </main>
  )
}
