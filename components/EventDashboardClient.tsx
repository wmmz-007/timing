'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, LayoutDashboard, RefreshCw } from 'lucide-react'
import { getEvents, getEventStats } from '@/lib/db'
import type { Event } from '@/types'

type Row = { event: Event; recordCount: number; athleteCount: number }

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
      const stats = await Promise.all(events.map((e) => getEventStats(e.id)))
      setRows(
        events.map((e, i) => ({
          event: e,
          recordCount: stats[i].recordCount,
          athleteCount: stats[i].athleteCount,
        })),
      )
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
            อัปเดตจำนวนฟินิชแบบใกล้เคียงเรียลไทม์ (รีเฟรชทุก ~4 วินาที)
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
        <ul className="space-y-3">
          {rows.map(({ event, recordCount, athleteCount }) => (
            <li key={event.id}>
              <Link
                href={`/event/${event.id}/capture`}
                className="block rounded-2xl border border-gray-200 bg-white p-4 shadow-sm hover:border-gray-300 transition-colors"
              >
                <p className="font-medium text-gray-900">{event.name}</p>
                <div className="mt-2 flex gap-4 text-sm text-gray-600">
                  <span>
                    ฟินิช:{' '}
                    <strong className="text-gray-900 tabular-nums">{recordCount}</strong>
                  </span>
                  <span>
                    นักวิ่ง:{' '}
                    <strong className="text-gray-900 tabular-nums">{athleteCount}</strong>
                  </span>
                </div>
                <p className="mt-2 text-xs text-gray-400">แตะเพื่อไปหน้า Record</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
