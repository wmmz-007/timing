'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Timer } from 'lucide-react'
import EventSetupForm from '@/components/EventSetupForm'
import EventEditForm from '@/components/EventEditForm'
import type { Event } from '@/types'

type Mode = 'list' | 'create' | 'edit'

export default function HomePage() {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('list')
  const [events, setEvents] = useState<Event[]>([])
  const [editingEvent, setEditingEvent] = useState<Event | null>(null)
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deleteStats, setDeleteStats] = useState<{ recordCount: number; athleteCount: number } | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)

  const loadEvents = useCallback(async () => {
    setListLoading(true)
    setListError(false)
    try {
      const { getEvents } = await import('@/lib/db')
      const data = await getEvents()
      setEvents(data)
    } catch {
      setListError(true)
    } finally {
      setListLoading(false)
    }
  }, [])

  useEffect(() => {
    loadEvents()
  }, [loadEvents])

  async function handleDeleteClick(id: string) {
    setConfirmDeleteId(id)
    setStatsLoading(true)
    setDeleteStats(null)
    try {
      const { getEventStats } = await import('@/lib/db')
      const stats = await getEventStats(id)
      setDeleteStats(stats)
    } finally {
      setStatsLoading(false)
    }
  }

  async function handleDeleteConfirm() {
    if (!confirmDeleteId) return
    const id = confirmDeleteId
    try {
      const { deleteEvent } = await import('@/lib/db')
      const { clearEventCache } = await import('@/lib/storage')
      await deleteEvent(id)
      clearEventCache(id)
      setEvents((prev) => prev.filter((e) => e.id !== id))
    } finally {
      setConfirmDeleteId(null)
      setDeleteStats(null)
    }
  }

  function handleDeleteCancel() {
    setConfirmDeleteId(null)
    setDeleteStats(null)
  }

  function handleEditClick(event: Event) {
    setEditingEvent(event)
    setMode('edit')
  }

  async function handleEditSaved() {
    const { getEvents } = await import('@/lib/db')
    const data = await getEvents()
    setEvents(data)
    setMode('list')
    setEditingEvent(null)
  }

  function handleEditCancel() {
    setMode('list')
    setEditingEvent(null)
  }

  if (mode === 'create') {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm">
          <button
            onClick={() => setMode('list')}
            className="mb-4 text-sm text-gray-400"
          >
            ‹ ยกเลิก
          </button>
          <EventSetupForm onCreated={(event) => router.push(`/event/${event.id}`)} />
        </div>
      </main>
    )
  }

  if (mode === 'edit' && editingEvent) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm">
          <EventEditForm
            event={editingEvent}
            onSaved={handleEditSaved}
            onCancel={handleEditCancel}
          />
        </div>
      </main>
    )
  }

  // mode === 'list'
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center">
          <Timer className="mx-auto text-gray-900" size={48} strokeWidth={1.5} />
          <h1 className="mt-4 text-3xl font-semibold tracking-tight">Timing</h1>
          <p className="mt-2 text-gray-500 text-sm">บันทึกเวลานักวิ่ง</p>
        </div>

        {listLoading ? (
          <p className="text-center text-gray-400 text-sm py-8">กำลังโหลด...</p>
        ) : listError ? (
          <div className="text-center py-8">
            <p className="text-red-400 text-sm mb-3">โหลดไม่ได้ กรุณาลองใหม่</p>
            <button
              onClick={loadEvents}
              className="text-sm text-gray-600 underline"
            >
              ลองใหม่
            </button>
          </div>
        ) : (
          <>
            {events.length === 0 ? (
              <p className="text-center text-gray-400 text-sm py-8">ยังไม่มีงาน</p>
            ) : (
              <ul className="space-y-2 mb-4">
                {events.map((event) => (
                  <li key={event.id}>
                    <div className="flex items-center gap-2 rounded-xl border border-gray-100 px-4 py-3">
                      <button
                        className="flex-1 text-left text-base font-medium"
                        onClick={() => router.push(`/event/${event.id}`)}
                      >
                        {event.name}
                      </button>
                      <button
                        aria-label={`แก้ไข ${event.name}`}
                        onClick={() => handleEditClick(event)}
                        className="text-gray-400 px-1"
                      >
                        ✏️
                      </button>
                      <button
                        aria-label={`ลบ ${event.name}`}
                        onClick={() => handleDeleteClick(event.id)}
                        className="text-gray-400 px-1"
                      >
                        🗑️
                      </button>
                    </div>

                    {confirmDeleteId === event.id && (
                      <div className="mt-1 rounded-xl bg-red-50 border border-red-100 px-4 py-3">
                        {statsLoading ? (
                          <p className="text-sm text-gray-400">กำลังโหลด...</p>
                        ) : deleteStats ? (
                          <>
                            <p className="text-sm text-red-700 mb-3">
                              ลบงาน &apos;{event.name}&apos;? จะลบ {deleteStats.recordCount} บิบ และ {deleteStats.athleteCount} นักกีฬา ไม่สามารถกู้คืนได้
                            </p>
                            <div className="flex gap-2">
                              <button
                                onClick={handleDeleteConfirm}
                                className="flex-1 bg-red-600 text-white rounded-lg py-2 text-sm font-medium"
                              >
                                ยืนยันลบ
                              </button>
                              <button
                                onClick={handleDeleteCancel}
                                className="flex-1 border border-gray-200 rounded-lg py-2 text-sm text-gray-600"
                              >
                                ยกเลิก
                              </button>
                            </div>
                          </>
                        ) : null}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <button
              onClick={() => setMode('create')}
              className="w-full bg-black text-white rounded-xl py-4 text-base font-medium"
            >
              + สร้างงานใหม่
            </button>
          </>
        )}
      </div>
    </main>
  )
}
