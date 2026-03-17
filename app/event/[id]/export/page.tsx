'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import type { Event, FinishRecord } from '@/types'
import { getEvent } from '@/lib/db'
import { getEventById, saveEvent } from '@/lib/storage'
import { generateCsv, downloadCsv } from '@/lib/export'
import { formatTime } from '@/lib/time'

export default function ExportPage() {
  const { id } = useParams<{ id: string }>()
  const [event, setEvent] = useState<Event | null>(null)
  const [records, setRecords] = useState<FinishRecord[]>([])

  useEffect(() => {
    async function load() {
      const local = getEventById(id)
      if (local) setEvent(local)
      else {
        const remote = await getEvent(id)
        if (remote) { saveEvent(remote); setEvent(remote) }
      }
      const { getFinishRecords } = await import('@/lib/db')
      const data = await getFinishRecords(id)
      setRecords(data)
    }
    load()
  }, [id])

  function handleDownload() {
    if (!event) return
    // TODO (Task 12): load athletes, distances, rankMap and pass them here
    const csv = generateCsv(records, event, [], [], new Map())
    const date = new Date().toISOString().slice(0, 10)
    downloadCsv(csv, `timing-${date}.csv`)
  }

  if (!event) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400">กำลังโหลด...</p>
      </div>
    )
  }

  return (
    <main className="px-6 pt-8 pb-6 max-w-sm mx-auto">
      <h1 className="text-2xl font-semibold tracking-tight mb-1">ส่งออก CSV</h1>
      <p className="text-sm text-gray-400 mb-6">{event.name}</p>

      <div className="bg-gray-50 rounded-2xl p-4 mb-6 text-sm">
        <p className="text-gray-500">จำนวนบันทึก: <span className="font-semibold text-gray-900">{records.length} คน</span></p>
        <p className="text-gray-500 mt-1">ปล่อยตัว: <span className="font-semibold text-gray-900 font-mono">{formatTime(event.start_time, event.timezone)}</span></p>
      </div>

      <button
        onClick={handleDownload}
        disabled={records.length === 0}
        className="w-full bg-black text-white rounded-xl py-4 text-base font-medium disabled:opacity-40"
      >
        ⬇️ ดาวน์โหลด CSV
      </button>

      <p className="mt-4 text-xs text-gray-400 text-center">
        ไฟล์มีคอลัมน์: bib, finish_time, net_time
      </p>
    </main>
  )
}
