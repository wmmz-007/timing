'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import CaptureScreen from '@/components/CaptureScreen'
import type { Event } from '@/types'

export default function CapturePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [event, setEvent] = useState<Event | null>(null)

  useEffect(() => {
    async function load() {
      const { getEventById } = await import('@/lib/storage')
      const local = getEventById(id)
      if (local) { setEvent(local); return }
      const { getEvent } = await import('@/lib/db')
      const remote = await getEvent(id)
      if (remote) {
        const { saveEvent } = await import('@/lib/storage')
        saveEvent(remote)
        setEvent(remote)
      } else {
        router.push('/')
      }
    }
    load()
  }, [id, router])

  if (!event) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400">กำลังโหลด...</p>
      </div>
    )
  }

  return <CaptureScreen event={event} />
}
