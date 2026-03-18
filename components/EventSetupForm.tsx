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
  const [password, setPassword] = useState('')
  const [distances, setDistances] = useState<DistanceRow[]>([
    { key: crypto.randomUUID(), name: '', time: '07:00' },
  ])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name || !date) return
    const trimmedPassword = password.trim()
    if (!trimmedPassword) { setPasswordError('Enter a password'); return }
    if (trimmedPassword.length < 4) { setPasswordError('Password must be at least 4 characters'); return }
    setLoading(true)
    setError(null)
    setPasswordError(null)
    try {
      const { createEventWithDistances } = await import('@/lib/db')
      const { saveEvent } = await import('@/lib/storage')
      const distancePayload = distances.map((row) => ({
        name: row.name,
        start_time: rowToStartTime(date, row.time),
      }))
      const event = await createEventWithDistances(name, 'Asia/Bangkok', trimmedPassword, distancePayload)
      saveEvent(event)
      onCreated(event)
    } catch (err) {
      setError('Failed to create event. Please try again.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Event Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. XYZ Marathon 2026"
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-black"
          required
        />
      </div>
      <div>
        <label htmlFor="event-date" className="block text-sm font-medium text-gray-700 mb-1">Date</label>
        <input
          id="event-date"
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
      <div>
        <label htmlFor="event-password" className="block text-sm font-medium text-gray-700 mb-1">Event Password</label>
        <input
          id="event-password"
          aria-label="Event Password"
          type="text"
          value={password}
          onChange={(e) => { setPassword(e.target.value); setPasswordError(null) }}
          placeholder="Share this with your team"
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-black"
        />
        {passwordError && <p className="text-red-500 text-sm mt-1">{passwordError}</p>}
      </div>
      {error && <p className="text-red-500 text-sm">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full bg-black text-white rounded-xl py-4 text-base font-medium disabled:opacity-50"
      >
        {loading ? 'Creating...' : 'Create Event'}
      </button>
    </form>
  )
}
