'use client'
import { useState, useEffect, useRef } from 'react'
import type { Event, EventDistance } from '@/types'
import DistanceList, { type DistanceRow, rowToStartTime } from './DistanceList'

interface Props {
  event: Event
  onSaved: () => void
  onCancel: () => void
}

function isoToLocalParts(iso: string): { date: string; time: string } {
  const d = new Date(iso)
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d)
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d)
  return { date, time }
}

export default function EventEditForm({ event, onSaved, onCancel }: Props) {
  const [name, setName] = useState(event.name)
  const [date, setDate] = useState('')
  const [distances, setDistances] = useState<DistanceRow[]>([])
  const [originalDistances, setOriginalDistances] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleteErrors, setDeleteErrors] = useState<string[]>([])

  const onCancelRef = useRef(onCancel)
  useEffect(() => { onCancelRef.current = onCancel })

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const { getDistancesForEvent } = await import('@/lib/db')
        const dists = await getDistancesForEvent(event.id)
        if (cancelled) return

        // Stale edit guard: if no distances, event was deleted on another device
        if (dists.length === 0) {
          onCancelRef.current()
          return
        }

        const sorted = [...dists].sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
        const derivedDate = isoToLocalParts(sorted[0].start_time).date

        const rows: DistanceRow[] = sorted.map((d) => ({
          key: d.id,
          distanceId: d.id,
          name: d.name,
          time: isoToLocalParts(d.start_time).time,
        }))

        setDate(derivedDate)
        setDistances(rows)
        setOriginalDistances(new Map(dists.map((d) => [d.id, d.name])))
        setLoading(false)
      } catch {
        if (cancelled) return
        setLoadError(true)
        setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [event.id])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setDeleteErrors([])

    try {
      const { updateEventName, updateDistance, addDistance, deleteDistance, getDistancesForEvent } = await import('@/lib/db')
      const { saveEvent, saveDistances } = await import('@/lib/storage')

      if (name !== event.name) {
        await updateEventName(event.id, name)
      }

      const currentIds = new Set(distances.filter((r) => r.distanceId).map((r) => r.distanceId as string))
      const deletedIds = [...originalDistances.keys()].filter((id) => !currentIds.has(id))

      const errs: string[] = []
      for (const distId of deletedIds) {
        try {
          await deleteDistance(distId)
        } catch {
          const distName = originalDistances.get(distId) ?? distId
          errs.push(`Cannot delete distance "${distName}" — athletes are assigned. Manage in Settings.`)
        }
      }

      for (const row of distances) {
        const startTime = rowToStartTime(date, row.time)
        if (row.distanceId) {
          await updateDistance(row.distanceId, { name: row.name, start_time: startTime })
        } else {
          await addDistance(event.id, row.name, startTime)
        }
      }

      saveEvent({ ...event, name })
      const refreshed = await getDistancesForEvent(event.id)
      saveDistances(event.id, refreshed)

      if (errs.length > 0) {
        setDeleteErrors(errs)
        return
      }

      onSaved()
    } catch {
      setError('Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button type="button" onClick={onCancel} className="text-sm text-gray-400">
          ‹ Cancel
        </button>
        <h2 className="text-lg font-semibold">Edit Event</h2>
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm text-center py-8">Loading...</p>
      ) : loadError ? (
        <p className="text-red-400 text-sm text-center py-8">Failed to load. Please try again.</p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Event Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-black"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-black"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Distances & Start Times</label>
            <DistanceList rows={distances} date={date} onChange={setDistances} />
          </div>

          {deleteErrors.length > 0 && (
            <div className="rounded-xl bg-orange-50 border border-orange-100 px-4 py-3 space-y-1">
              {deleteErrors.map((msg, i) => (
                <p key={i} className="text-sm text-orange-700">{msg}</p>
              ))}
              <p className="text-xs text-orange-500 mt-1">Other changes were saved.</p>
            </div>
          )}

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-black text-white rounded-xl py-4 text-base font-medium disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </form>
      )}
    </div>
  )
}
