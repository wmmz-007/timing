'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import ResultsTable from '@/components/ResultsTable'
import ConflictsPanel from '@/components/ConflictsPanel'
import type { Event, FinishRecord, SyncConflict, EventDistance, Athlete, SubgroupPrizeOverride } from '@/types'
import type { RankMap } from '@/lib/ranking'
import { supabase } from '@/lib/supabase'
import { getEvent, getDistancesForEvent, getAthletesForEvent, getSubgroupOverrides, getFinishRecords } from '@/lib/db'
import { getEventById, saveEvent, getDistances, saveDistances, getAthletes, saveAthletes } from '@/lib/storage'
import { computeRanks } from '@/lib/ranking'

export default function ResultsPage() {
  const { id } = useParams<{ id: string }>()
  const [event, setEvent] = useState<Event | null>(null)
  const [records, setRecords] = useState<FinishRecord[]>([])
  const [distances, setDistances] = useState<EventDistance[]>([])
  const [athletes, setAthletes] = useState<Athlete[]>([])
  const [overrides, setOverrides] = useState<SubgroupPrizeOverride[]>([])
  const [rankMap, setRankMap] = useState<RankMap>(new Map())
  const [conflicts, setConflicts] = useState<SyncConflict[]>([])

  useEffect(() => {
    let cancelled = false

    async function load() {
      // Event
      const local = getEventById(id)
      const ev = local ?? await getEvent(id)
      if (cancelled || !ev) return
      if (!local) saveEvent(ev)
      setEvent(ev)

      // Distances + athletes (online preferred)
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

      // Overrides
      let ovrs: SubgroupPrizeOverride[] = []
      if (navigator.onLine) {
        ovrs = await getSubgroupOverrides(id)
        if (cancelled) return
      }
      setOverrides(ovrs)

      // Records
      const recs = await getFinishRecords(id)
      if (cancelled) return
      setRecords(recs)

      // Sync pending
      const { syncPendingRecords } = await import('@/lib/sync')
      await syncPendingRecords(id, (conflict) => {
        if (!cancelled) setConflicts((prev) => [...prev, conflict])
      })
    }

    load()

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        setDistances(getDistances(id)); setAthletes(getAthletes(id))
      }
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [id])

  // Recompute ranks when inputs change
  useEffect(() => {
    if (!event) return
    setRankMap(computeRanks(records, athletes, distances, overrides, event.overall_lockout))
  }, [records, athletes, distances, overrides, event])

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`results-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'finish_records', filter: `event_id=eq.${id}` }, () => {
        getFinishRecords(id).then(setRecords)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [id])

  if (!event) {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-400">กำลังโหลด...</p></div>
  }

  return (
    <main className="px-6 pt-8 pb-6 max-w-sm mx-auto">
      <h1 className="text-2xl font-semibold tracking-tight mb-1">ผลการแข่งขัน</h1>
      <p className="text-sm text-gray-400 mb-6">{event.name}</p>
      <ConflictsPanel conflicts={conflicts} timezone={event.timezone} />
      <div className="mt-4">
        <ResultsTable
          records={records}
          event={event}
          athletes={athletes}
          distances={distances}
          rankMap={rankMap}
        />
      </div>
    </main>
  )
}
