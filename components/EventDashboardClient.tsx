'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, LayoutDashboard, RefreshCw } from 'lucide-react'
import { getEvents, getRecentFinishRecords } from '@/lib/db'
import { formatTime } from '@/lib/time'
import type { Event, FinishRecord } from '@/types'

const RECENT_LIMIT = 30

type Row = { event: Event; recent: FinishRecord[] }

export default function EventDashboardClient() {
  const router = useRouter()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)

  useEffect(() => {
    if (sessionStorage.getItem('authed') !== '1') {
      router.replace('/')
    }
  }, [router])

  const load = useCallback(async () => {
    try {
      const events = await getEvents()
      const recentLists = await Promise.all(
        events.map((e) => getRecentFinishRecords(e.id, RECENT_LIMIT)),
      )
      setRows(events.map((e, i) => ({ event: e, recent: recentLists[i] })))
      setUpdatedAt(new Date())
      setError(false)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const t = setInterval(() => {
      void load()
    }, 4000)
    return () => clearInterval(t)
  }, [load])

  return (
    <main className="relative min-h-screen px-6 pt-8 pb-10 max-w-lg mx-auto">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <Link
            href="/events"
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-2"
          >
            <ChevronLeft size={16} /> Events
          </Link>
          <div className="flex items-center gap-2">
            <LayoutDashboard size={22} className="text-gray-700" />
            <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            ฟินิชล่าสุดต่องาน (เลข BIB + เวลา) — อัปเดตทุก ~4 วินาที
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setLoading(true)
            void load()
          }}
          className="shrink-0 p-2 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50"
          aria-label="Refresh now"
        >
          <RefreshCw size={18} />
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-600 mb-4">โหลดข้อมูลไม่สำเร็จ ลองอีกครั้ง</p>
      )}

      {updatedAt && (
        <p className="text-xs text-gray-400 mb-4">
          อัปเดตล่าสุด:{' '}
          {updatedAt.toLocaleTimeString('th-TH', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })}
        </p>
      )}

      {loading && rows.length === 0 ? (
        <p className="text-gray-500">กำลังโหลด...</p>
      ) : rows.length === 0 ? (
        <p className="text-gray-500">ยังไม่มีงาน — สร้างได้ที่ Events</p>
      ) : (
        <ul className="space-y-4">
          {rows.map(({ event, recent }) => (
            <li key={event.id}>
              <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <p className="font-medium text-gray-900 leading-snug">{event.name}</p>
                  <Link
                    href={`/event/${event.id}/capture`}
                    className="shrink-0 text-xs text-gray-500 hover:text-gray-800 underline-offset-2 hover:underline"
                  >
                    Record
                  </Link>
                </div>
                {recent.length === 0 ? (
                  <p className="text-sm text-gray-400">ยังไม่มีฟินิช</p>
                ) : (
                  <ul className="space-y-2 border-t border-gray-100 pt-3">
                    {recent.map((r) => (
                      <li
                        key={r.id}
                        className="flex items-center justify-between gap-3 text-sm"
                      >
                        <span className="font-semibold tabular-nums text-gray-900">
                          {r.bib_number}
                        </span>
                        <span className="font-mono text-gray-700 tabular-nums">
                          {formatTime(r.finish_time, event.timezone)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
