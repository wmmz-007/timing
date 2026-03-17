'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import CaptureScreen from '@/components/CaptureScreen'
import type { Event, EventDistance, Athlete } from '@/types'

export default function CapturePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [event, setEvent] = useState<Event | null>(null)
  const [distances, setDistances] = useState<EventDistance[]>([])
  const [athletes, setAthletes] = useState<Athlete[]>([])

  useEffect(() => {
    async function load() {
      const { getEventById } = await import('@/lib/storage')
      const local = getEventById(id)
      if (local) { setEvent(local) } else {
        const { getEvent } = await import('@/lib/db')
        const remote = await getEvent(id)
        if (remote) {
          const { saveEvent } = await import('@/lib/storage')
          saveEvent(remote)
          setEvent(remote)
        } else {
          router.push('/')
          return
        }
      }

      if (navigator.onLine) {
        const { getDistancesForEvent, getAthletesForEvent } = await import('@/lib/db')
        const [dists, athls] = await Promise.all([
          getDistancesForEvent(id),
          getAthletesForEvent(id),
        ])
        const { saveDistances, saveAthletes } = await import('@/lib/storage')
        saveDistances(id, dists)
        saveAthletes(id, athls)
        setDistances(dists)
        setAthletes(athls)
      } else {
        const { getDistances, getAthletes } = await import('@/lib/storage')
        setDistances(getDistances(id))
        setAthletes(getAthletes(id))
      }
    }
    load()
  }, [id, router])

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        import('@/lib/storage').then(({ getDistances, getAthletes }) => {
          setDistances(getDistances(id))
          setAthletes(getAthletes(id))
        })
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [id])

  if (!event) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400">กำลังโหลด...</p>
      </div>
    )
  }

  return <CaptureScreen event={event} distances={distances} athletes={athletes} />
}
