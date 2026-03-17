'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react'
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
      name: d.name,
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
      if (existing.name !== row.name || !existing.start_time.startsWith(
        new Date(`${date}T${row.time}:00+07:00`).toISOString().slice(0, 16)
      )) {
        await updateDistance(row.key, {
          name: row.name,
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
      ? `ระยะนี้มีนักกีฬา ${count} คน — ลบแล้วนักกีฬาเหล่านี้จะถูกลบด้วย ยืนยันไหม?`
      : 'ลบระยะนี้?'
    if (!confirm(msg)) return
    const { deleteDistanceAndAthletes, getDistancesForEvent, getAthletesForEvent } = await import('@/lib/db')
    const { saveDistances, saveAthletes } = await import('@/lib/storage')
    await deleteDistanceAndAthletes(distId)
    const [dists, aths] = await Promise.all([getDistancesForEvent(id), getAthletesForEvent(id)])
    setDistances(dists); setAthletes(aths)
    saveDistances(id, dists); saveAthletes(id, aths)
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
      <h1 className="text-2xl font-semibold tracking-tight mb-1">ตั้งค่า</h1>
      <p className="text-sm text-gray-400 mb-6">{event.name}</p>

      {offline && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 mb-4 text-sm text-yellow-800">
          ไม่มีการเชื่อมต่อ — แก้ไขได้เมื่อออนไลน์
        </div>
      )}

      {/* Section 1: Distances */}
      <div className="border border-gray-100 rounded-2xl mb-3 overflow-hidden">
        <button
          className="w-full flex items-center justify-between px-5 py-4 text-left"
          onClick={() => setOpenSection(openSection === 1 ? 0 : 1)}
        >
          <span className="font-medium">ระยะและเวลาปล่อยตัว</span>
          {openSection === 1 ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>

        {openSection === 1 && (
          <div className="px-5 pb-5 space-y-3">
            {distances.some((d) => d.name === 'ทั้งหมด') && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-800">
                กรุณาตั้งชื่อระยะก่อน import นักกีฬา
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
          </div>
        )}
      </div>

      {/* Section 2: Athletes */}
      <div className="border border-gray-100 rounded-2xl mb-3 overflow-hidden">
        <button
          className="w-full flex items-center justify-between px-5 py-4 text-left"
          onClick={() => setOpenSection(openSection === 2 ? 0 : 2)}
        >
          <span className="font-medium">นักกีฬา</span>
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
          <span className="font-medium">รางวัล</span>
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
    </main>
  )
}
