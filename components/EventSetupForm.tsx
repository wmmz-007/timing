'use client'
import { useState } from 'react'
import type { Event } from '@/types'
import DistanceList, { type DistanceRow, rowToStartTime } from './DistanceList'

interface Props {
  onCreated: (event: Event) => void
}

export default function EventSetupForm({ onCreated }: Props) {
  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [distances, setDistances] = useState<DistanceRow[]>([
    { key: crypto.randomUUID(), name: '', time: '07:00' },
  ])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name || !date) return
    setLoading(true)
    setError(null)

    try {
      const { createEventWithDistances } = await import('@/lib/db')
      const { saveEvent } = await import('@/lib/storage')

      const distancePayload = distances.map((row) => ({
        name: row.name,
        start_time: rowToStartTime(date, row.time),
      }))

      const event = await createEventWithDistances(name, 'Asia/Bangkok', distancePayload)
      saveEvent(event)
      onCreated(event)
    } catch (err) {
      setError('ไม่สามารถสร้างงานได้ กรุณาลองใหม่')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">ชื่องาน</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="เช่น งานวิ่ง XYZ 2026"
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-black"
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">วันที่</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-black"
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">ระยะและเวลาปล่อยตัว</label>
        <DistanceList rows={distances} date={date} onChange={setDistances} />
      </div>
      {error && <p className="text-red-500 text-sm">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full bg-black text-white rounded-xl py-4 text-base font-medium disabled:opacity-50"
      >
        {loading ? 'กำลังสร้าง...' : 'สร้างงาน'}
      </button>
    </form>
  )
}
