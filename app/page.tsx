'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Timer } from 'lucide-react'
import EventSetupForm from '@/components/EventSetupForm'
import type { Event } from '@/types'

export default function HomePage() {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)

  function handleCreated(event: Event) {
    router.push(`/event/${event.id}`)
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center">
          <Timer className="mx-auto text-gray-900" size={48} strokeWidth={1.5} />
          <h1 className="mt-4 text-3xl font-semibold tracking-tight">Timing</h1>
          <p className="mt-2 text-gray-500 text-sm">บันทึกเวลานักวิ่ง</p>
        </div>

        {!showForm ? (
          <button
            onClick={() => setShowForm(true)}
            className="w-full bg-black text-white rounded-xl py-4 text-base font-medium"
          >
            + สร้างงานใหม่
          </button>
        ) : (
          <div>
            <button
              onClick={() => setShowForm(false)}
              className="mb-4 text-sm text-gray-400"
            >
              ‹ ยกเลิก
            </button>
            <EventSetupForm onCreated={handleCreated} />
          </div>
        )}
      </div>
    </main>
  )
}
