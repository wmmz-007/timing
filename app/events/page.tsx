'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Trash2 } from 'lucide-react'
import EventSetupForm from '@/components/EventSetupForm'
import EventEditForm from '@/components/EventEditForm'
import { getEvents, getEventStats, deleteEvent } from '@/lib/db'
import { clearEventCache } from '@/lib/storage'
import type { Event } from '@/types'

type Mode = 'list' | 'edit'

export default function EventsPage() {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('list')
  const [events, setEvents] = useState<Event[]>([])
  const [editingEvent, setEditingEvent] = useState<Event | null>(null)
  const [query, setQuery] = useState('')
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deleteStats, setDeleteStats] = useState<{ recordCount: number; athleteCount: number } | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)
  const [statsError, setStatsError] = useState(false)
  const [deleteError, setDeleteError] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [modalState, setModalState] = useState<'form' | 'created'>('form')
  const [createdEvent, setCreatedEvent] = useState<Event | null>(null)

  useEffect(() => {
    if (sessionStorage.getItem('authed') !== '1') {
      router.replace('/')
    }
  }, [router])

  const loadEvents = useCallback(async () => {
    setListLoading(true)
    setListError(false)
    try {
      setEvents(await getEvents())
    } catch {
      setListError(true)
    } finally {
      setListLoading(false)
    }
  }, [])

  useEffect(() => { loadEvents() }, [loadEvents])

  function handleLogout() {
    sessionStorage.removeItem('authed')
    router.push('/')
  }

  async function handleDeleteClick(id: string) {
    setConfirmDeleteId(id)
    setStatsLoading(true)
    setStatsError(false)
    setDeleteError(false)
    try {
      setDeleteStats(await getEventStats(id))
    } catch {
      setStatsError(true)
    } finally {
      setStatsLoading(false)
    }
  }

  function handleDeleteCancel() {
    setConfirmDeleteId(null)
    setDeleteStats(null)
    setStatsError(false)
    setDeleteError(false)
  }

  async function handleDeleteConfirm() {
    if (!confirmDeleteId) return
    const id = confirmDeleteId
    setDeleteError(false)
    try {
      await deleteEvent(id)
      clearEventCache(id)
      setEvents(prev => prev.filter(e => e.id !== id))
      setConfirmDeleteId(null)
      setDeleteStats(null)
    } catch {
      setDeleteError(true)
    }
  }

  function handleEditClick(event: Event) {
    setEditingEvent(event)
    setMode('edit')
  }

  async function handleEditSaved() {
    setMode('list')
    setEditingEvent(null)
    await loadEvents()
  }

  function handleEditCancel() {
    setMode('list')
    setEditingEvent(null)
  }

  function openAddModal() {
    setModalState('form')
    setCreatedEvent(null)
    setShowAddModal(true)
  }

  function handleEventCreated(event: Event) {
    setCreatedEvent(event)
    setModalState('created')
  }

  function handleModalClose() {
    setShowAddModal(false)
    if (modalState === 'created') loadEvents()
  }

  const filtered = events.filter(e =>
    e.name.toLowerCase().includes(query.toLowerCase())
  )
  const noMatches = query.length > 0 && filtered.length === 0

  if (mode === 'edit' && editingEvent) {
    return (
      <main className="min-h-screen p-6 max-w-md mx-auto">
        <EventEditForm event={editingEvent} onSaved={handleEditSaved} onCancel={handleEditCancel} />
      </main>
    )
  }

  return (
    <main className="min-h-screen p-6 max-w-md mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Events</h1>
        <button onClick={handleLogout} className="text-sm text-gray-500">Logout</button>
      </div>

      <input
        role="searchbox"
        type="search"
        placeholder="Search events..."
        value={query}
        onChange={e => setQuery(e.target.value)}
        className="w-full border rounded-xl px-4 py-3 mb-4 text-base"
      />

      {listLoading && <p className="text-gray-400 text-center py-8">Loading...</p>}

      {listError && (
        <div className="text-center py-8">
          <p className="text-red-500 mb-2">Failed to load. Retry</p>
          <button onClick={loadEvents} className="text-sm underline">Retry</button>
        </div>
      )}

      {!listLoading && !listError && events.length === 0 && (
        <div className="text-center py-8">
          <p className="text-gray-400 mb-4">No events yet</p>
          <button onClick={openAddModal} className="bg-black text-white rounded-xl px-6 py-3">
            + Add Event
          </button>
        </div>
      )}

      {!listLoading && !listError && events.length > 0 && (
        <ul className="space-y-2">
          {filtered.map(event => (
            <li key={event.id}>
              <div className="flex items-center gap-2 p-3 rounded-xl border">
                <button
                  className="flex-1 text-left font-medium"
                  onClick={() => router.push(`/event/${event.id}`)}
                >
                  {event.name}
                </button>
                <button
                  aria-label={`Edit ${event.name}`}
                  onClick={() => handleEditClick(event)}
                  className="p-1 text-gray-400"
                >
                  <Pencil size={16} />
                </button>
                <button
                  aria-label={`Delete ${event.name}`}
                  onClick={() => handleDeleteClick(event.id)}
                  className="p-1 text-gray-400"
                >
                  <Trash2 size={16} />
                </button>
              </div>

              {confirmDeleteId === event.id && (
                <div className="mt-1 p-3 rounded-xl border border-red-200 bg-red-50">
                  {statsLoading && <p className="text-sm text-gray-500">Loading...</p>}
                  {!statsLoading && statsError && (
                    <div>
                      <p className="text-sm text-red-500">Failed to load stats</p>
                      <button onClick={handleDeleteCancel} className="text-sm underline mt-1">Cancel</button>
                    </div>
                  )}
                  {!statsLoading && deleteStats && (
                    <>
                      {deleteError && <p className="text-sm text-red-500 mb-2">Delete failed. Please try again.</p>}
                      <p className="text-sm mb-2">
                        Delete &ldquo;{event.name}&rdquo;? This will remove {deleteStats.recordCount} records and {deleteStats.athleteCount} athletes. This cannot be undone.
                      </p>
                      <div className="flex gap-2">
                        <button
                          aria-label="Confirm delete"
                          onClick={handleDeleteConfirm}
                          className="bg-red-600 text-white rounded-lg px-3 py-1 text-sm"
                        >
                          Confirm Delete
                        </button>
                        <button
                          onClick={handleDeleteCancel}
                          className="text-sm underline"
                        >
                          Cancel
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {noMatches && (
        <div className="text-center py-4">
          <p className="text-gray-400 mb-3">No events match &ldquo;{query}&rdquo;</p>
          <button onClick={openAddModal} className="bg-black text-white rounded-xl px-6 py-3">
            + Add Event
          </button>
        </div>
      )}

      {!listLoading && !listError && (
        <div className="mt-6">
          <button
            onClick={openAddModal}
            className="w-full border-2 border-dashed rounded-xl py-4 text-gray-500"
          >
            + Add Event
          </button>
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50">
          <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-end mb-4">
              <button aria-label="Close" onClick={handleModalClose} className="text-gray-400 text-xl">✕</button>
            </div>
            {modalState === 'form' && (
              <EventSetupForm onCreated={handleEventCreated} />
            )}
            {modalState === 'created' && createdEvent && (
              <div className="text-center py-4">
                <p className="text-xl font-semibold mb-1">Event created!</p>
                <p className="text-gray-500 mb-6">{createdEvent.name}</p>
                <button
                  onClick={() => router.push(`/event/${createdEvent.id}`)}
                  className="bg-black text-white rounded-xl px-8 py-4 text-base font-medium"
                >
                  Go to this page
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  )
}
