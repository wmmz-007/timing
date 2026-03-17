'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import ResultsTable from '@/components/ResultsTable'
import ConflictsPanel from '@/components/ConflictsPanel'
import type { Event, FinishRecord, SyncConflict } from '@/types'
import { supabase } from '@/lib/supabase'
import { getEvent } from '@/lib/db'
import { getEventById, saveEvent } from '@/lib/storage'

export default function ResultsPage() {
  const { id } = useParams<{ id: string }>()
  const [event, setEvent] = useState<Event | null>(null)
  const [records, setRecords] = useState<FinishRecord[]>([])
  const [conflicts, setConflicts] = useState<SyncConflict[]>([])

  useEffect(() => {
    async function load() {
      const local = getEventById(id)
      if (local) { setEvent(local) }
      else {
        const remote = await getEvent(id)
        if (remote) { saveEvent(remote); setEvent(remote) }
      }

      const { getFinishRecords } = await import('@/lib/db')
      const data = await getFinishRecords(id)
      setRecords(data)

      // Trigger sync of any pending offline records; surface conflicts
      const { syncPendingRecords } = await import('@/lib/sync')
      await syncPendingRecords(id, (conflict) => {
        setConflicts((prev) => [...prev, conflict])
      })
    }
    load()
  }, [id])

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`results-${id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'finish_records', filter: `event_id=eq.${id}` },
        () => {
          import('@/lib/db').then(({ getFinishRecords }) =>
            getFinishRecords(id).then(setRecords)
          )
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [id])

  if (!event) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400">กำลังโหลด...</p>
      </div>
    )
  }

  return (
    <main className="px-6 pt-8 pb-6 max-w-sm mx-auto">
      <h1 className="text-2xl font-semibold tracking-tight mb-1">ผลการแข่งขัน</h1>
      <p className="text-sm text-gray-400 mb-6">{event.name}</p>
      <ConflictsPanel conflicts={conflicts} timezone={event.timezone} />
      <div className="mt-4">
        <ResultsTable records={records} event={event} />
      </div>
    </main>
  )
}
