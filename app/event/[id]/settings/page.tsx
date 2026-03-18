'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronDown, ChevronUp, Trash2, Plus, ChevronLeft } from 'lucide-react'
import type { Event, EventDistance, Athlete, SubgroupPrizeOverride } from '@/types'
import DistanceList, { type DistanceRow, rowToStartTime } from '@/components/DistanceList'
import AthleteImport from '@/components/AthleteImport'
import PrizeConfig from '@/components/PrizeConfig'

export default function SettingsPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [event, setEvent] = useState<Event | null>(null)
  const [distances, setDistances] = useState<EventDistance[]>([])
  const [athletes, setAthletes] = useState<Athlete[]>([])
  const [overrides, setOverrides] = useState<SubgroupPrizeOverride[]>([])
  const [offline, setOffline] = useState(false)
  const [openSection, setOpenSection] = useState<0 | 1 | 2 | 3>(1)
  const [pwEditing, setPwEditing] = useState(false)
  const [pwInput, setPwInput] = useState('')
  const [pwError, setPwError] = useState<string | null>(null)
  const [addingDist, setAddingDist] = useState(false)
  const [newDistName, setNewDistName] = useState('')
  const [newDistTime, setNewDistTime] = useState('07:00')
  const [addDistError, setAddDistError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!navigator.onLine) { if (!cancelled) setOffline(true); return }
      const { getEvent, getDistancesForEvent, getAthletesForEvent, getSubgroupOverrides } = await import('@/lib/db')
      const { saveEvent, saveDistances, saveAthletes } = await import('@/lib/storage')
      const [ev, dists, aths, ovrs] = await Promise.all([
        getEvent(id),
        getDistancesForEvent(id),
        getAthletesForEvent(id),
        getSubgroupOverrides(id),
      ])
      if (cancelled) return
      if (!ev) { router.push('/'); return }
      saveEvent(ev)
      saveDistances(id, dists)
      saveAthletes(id, aths)
      setEvent(ev)
      setDistances(dists)
      setAthletes(aths)
      setOverrides(ovrs)
    }
    load()
    return () => { cancelled = true }
  }, [id, router])

  // ---- Section 1: Distances ----

  const [distRows, setDistRows] = useState<DistanceRow[]>([])
  useEffect(() => {
    setDistRows(distances.map((d) => ({
      key: d.id,
      name: d.name.endsWith(' km') ? d.name.slice(0, -3) : d.name,
      time: new Date(d.start_time).toLocaleTimeString('en-GB', {
        hour: '2-digit', minute: '2-digit', timeZone: event?.timezone ?? 'Asia/Bangkok',
      }),
    })))
  }, [distances, event])

  async function handleDistanceChange(rows: DistanceRow[]) {
    if (offline || !event) return
    setDistRows(rows)
    const { updateDistance } = await import('@/lib/db')
    const { saveDistances } = await import('@/lib/storage')
    const date = distances[0]
      ? new Date(distances[0].start_time).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10)
    for (const row of rows) {
      const existing = distances.find((d) => d.id === row.key)
      if (!existing) continue
      const newName = `${row.name.trim()} km`
      if (existing.name !== newName || !existing.start_time.startsWith(
        new Date(`${date}T${row.time}:00+07:00`).toISOString().slice(0, 16)
      )) {
        await updateDistance(row.key, {
          name: newName,
          start_time: rowToStartTime(date, row.time),
        })
      }
    }
    const { getDistancesForEvent } = await import('@/lib/db')
    const updated = await getDistancesForEvent(id)
    setDistances(updated)
    saveDistances(id, updated)
  }

  async function handleDeleteDistance(distId: string) {
    if (offline) return
    const count = athletes.filter((a) => a.distance_id === distId).length
    const msg = count > 0
      ? `This distance has ${count} athlete(s) — they will also be deleted. Confirm?`
      : 'Delete this distance?'
    if (!confirm(msg)) return
    const { deleteDistanceAndAthletes, getDistancesForEvent, getAthletesForEvent } = await import('@/lib/db')
    const { saveDistances, saveAthletes } = await import('@/lib/storage')
    await deleteDistanceAndAthletes(distId)
    const [dists, aths] = await Promise.all([getDistancesForEvent(id), getAthletesForEvent(id)])
    setDistances(dists); setAthletes(aths)
    saveDistances(id, dists); saveAthletes(id, aths)
  }

  async function handleSavePassword() {
    const trimmed = pwInput.trim()
    if (!trimmed) { setPwError('Password cannot be empty'); return }
    if (trimmed.length < 4) { setPwError('Password must be at least 4 characters'); return }
    try {
      const { updateEventPassword } = await import('@/lib/db')
      await updateEventPassword(id, trimmed)
      setEvent(prev => prev ? { ...prev, password: trimmed } : prev)
      setPwEditing(false)
      setPwError(null)
    } catch {
      setPwError('Failed to save. Try again.')
    }
  }

  async function handleAddDistance() {
    const name = newDistName.trim()
    if (!name || Number(name) <= 0) { setAddDistError('Enter a valid distance'); return }
    const date = distances[0]
      ? new Date(distances[0].start_time).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10)
    try {
      const { addDistance, getDistancesForEvent } = await import('@/lib/db')
      const { saveDistances } = await import('@/lib/storage')
      await addDistance(id, `${name} km`, rowToStartTime(date, newDistTime))
      const updated = await getDistancesForEvent(id)
      setDistances(updated)
      saveDistances(id, updated)
      setAddingDist(false)
      setNewDistName('')
      setNewDistTime('07:00')
      setAddDistError(null)
    } catch {
      setAddDistError('Failed to add. Try again.')
    }
  }

  if (!event) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    )
  }

  return (
    <main className="relative px-6 pt-8 pb-6 max-w-sm mx-auto">
      <Link href={`/event/${id}`} aria-label="back" className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-700">
        <ChevronLeft size={20} />
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight mb-1">Settings</h1>
      <p className="text-sm text-gray-400 mb-6">{event.name}</p>

      {offline && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 mb-4 text-sm text-yellow-800">
          Offline — edits available when online
        </div>
      )}

      {/* Section 1: Distances */}
      <div className="border border-gray-100 rounded-2xl mb-3 overflow-hidden">
        <button
          className="w-full flex items-center justify-between px-5 py-4 text-left"
          onClick={() => setOpenSection(openSection === 1 ? 0 : 1)}
        >
          <span className="font-medium">Distances &amp; Start Times</span>
          {openSection === 1 ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>

        {openSection === 1 && (
          <div className="px-5 pb-5 space-y-3">
            {distances.some((d) => d.name === '') && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-800">
                Name all distances before importing athletes
              </div>
            )}
            {distances.map((dist) => (
              <div key={dist.id} className="flex items-center gap-2">
                <div className="flex-1">
                  <DistanceList
                    rows={distRows.filter((r) => r.key === dist.id)}
                    date={new Date(dist.start_time).toISOString().slice(0, 10)}
                    hideAdd
                    onChange={(rows) => handleDistanceChange(
                      distRows.map((r) => r.key === dist.id ? rows[0] : r)
                    )}
                  />
                </div>
                {distances.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleDeleteDistance(dist.id)}
                    className="p-1.5 text-gray-400 hover:text-red-500"
                    aria-label="delete distance"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            ))}
            {addingDist ? (
              <div className="space-y-2 pt-2">
                <div className="flex gap-2 items-center">
                  <input
                    type="number"
                    value={newDistName}
                    onChange={e => { setNewDistName(e.target.value); setAddDistError(null) }}
                    placeholder="e.g. 10"
                    min="0.01"
                    step="any"
                    autoFocus
                    className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                  />
                  <span className="text-sm text-gray-500 shrink-0">km</span>
                  <input
                    type="time"
                    value={newDistTime}
                    onChange={e => setNewDistTime(e.target.value)}
                    className="w-28 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                  />
                </div>
                {addDistError && <p className="text-red-500 text-sm">{addDistError}</p>}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleAddDistance}
                    className="flex-1 bg-black text-white rounded-xl py-2.5 text-sm font-medium"
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => { setAddingDist(false); setAddDistError(null) }}
                    className="flex-1 border border-gray-200 rounded-xl py-2.5 text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAddingDist(true)}
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mt-1"
              >
                <Plus size={14} /> Add Distance
              </button>
            )}
          </div>
        )}
      </div>

      {/* Section 2: Athletes */}
      <div className="border border-gray-100 rounded-2xl mb-3 overflow-hidden">
        <button
          className="w-full flex items-center justify-between px-5 py-4 text-left"
          onClick={() => setOpenSection(openSection === 2 ? 0 : 2)}
        >
          <span className="font-medium">Athletes ({athletes.length})</span>
          {openSection === 2 ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
        {openSection === 2 && (
          <div className="px-5 pb-5">
            <AthleteImport
              eventId={id}
              distances={distances}
              disabled={offline}
              onImported={setAthletes}
            />
          </div>
        )}
      </div>
      {/* Section 3: Prizes */}
      <div className="border border-gray-100 rounded-2xl mb-3 overflow-hidden">
        <button
          className="w-full flex items-center justify-between px-5 py-4 text-left"
          onClick={() => setOpenSection(openSection === 3 ? 0 : 3)}
        >
          <span className="font-medium">Prizes</span>
          {openSection === 3 ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
        {openSection === 3 && event && (
          <div className="px-5 pb-5">
            <PrizeConfig
              event={event}
              distances={distances}
              athletes={athletes}
              overrides={overrides}
              disabled={offline}
              onUpdated={setOverrides}
              onEventUpdated={setEvent}
            />
          </div>
        )}
      </div>

      {/* Access Password — always visible */}
      <div className="border border-gray-100 rounded-2xl mt-3 overflow-hidden">
        <div className="px-5 py-4">
          <p className="font-medium mb-3">Access Password</p>
          {pwEditing ? (
            <div className="space-y-2">
              <input
                type="text"
                value={pwInput}
                onChange={e => { setPwInput(e.target.value); setPwError(null) }}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-black"
                autoFocus
              />
              {pwError && <p className="text-red-500 text-sm">{pwError}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSavePassword}
                  className="flex-1 bg-black text-white rounded-xl py-2.5 text-sm font-medium"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => { setPwEditing(false); setPwError(null) }}
                  className="flex-1 border border-gray-200 rounded-xl py-2.5 text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <span className="font-mono text-sm">{event.password}</span>
              <button
                type="button"
                onClick={() => { setPwInput(event.password ?? ''); setPwEditing(true) }}
                className="text-sm text-gray-500 underline"
              >
                Change
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
