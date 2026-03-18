'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Timer } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (sessionStorage.getItem('authed') === '1') {
      router.replace('/events')
    }
  }, [router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = password.trim()
    if (!trimmed) { setError('Enter password'); return }
    setLoading(true)
    setError(null)
    try {
      const { getEventByPassword } = await import('@/lib/db')
      const event = await getEventByPassword(trimmed)
      if (!event) {
        setError('Incorrect password')
        setPassword('')
        return
      }
      sessionStorage.setItem('authed', '1')
      router.push(`/event/${event.id}`)
    } catch {
      setError('Something went wrong. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="flex flex-col items-center gap-2 mb-8">
        <Timer size={48} />
        <h1 className="text-3xl font-bold">Timing</h1>
      </div>
      <form onSubmit={handleSubmit} className="w-full max-w-xs flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="password" className="text-sm font-medium">Event Password</label>
          <input
            id="password"
            aria-label="Event Password"
            type="password"
            value={password}
            onChange={e => { setPassword(e.target.value); setError(null) }}
            className="border rounded-xl px-4 py-3 text-base"
            autoFocus
            autoComplete="current-password"
          />
        </div>
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="bg-black text-white rounded-xl py-4 text-base font-medium disabled:opacity-50"
        >
          {loading ? 'Checking...' : 'Enter'}
        </button>
      </form>
    </main>
  )
}
