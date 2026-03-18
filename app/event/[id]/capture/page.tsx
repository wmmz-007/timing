'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import CaptureScreen from '@/components/CaptureScreen'
import type { Event, EventDistance, Athlete } from '@/types'

export default function CapturePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [event, setEvent] = useState<Event | null>(null)
  const [distances, setDistances] = useState<EventDistance[]>([])
  const [athletes, setAthletes] = useState<Athlete[]>([])

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { getEventById } = await import('@/lib/storage')
      const local = getEventById(id)
      if (local) {
        if (cancelled) return
        setEvent(local)
      } else {
        const { getEvent } = await import('@/lib/db')
        const remote = await getEvent(id)
        if (cancelled) return
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
        if (cancelled) return
        setDistances(dists)
        setAthletes(athls)
      } else {
        const { getDistances, getAthletes } = await import('@/lib/storage')
        if (cancelled) return
        setDistances(getDistances(id))
        setAthletes(getAthletes(id))
      }
    }
    load()
    return () => { cancelled = true }
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
        <p className="text-gray-400">Loading...</p>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen">
      <Link href={`/event/${id}`} aria-label="back" className="absolute top-4 right-4 z-10 p-2 text-gray-400 hover:text-gray-700">
        <ChevronLeft size={20} />
      </Link>
      <CaptureScreen event={event} distances={distances} athletes={athletes} />
    </div>
  )
}
