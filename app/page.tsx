'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Timer } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (sessionStorage.getItem('authed') === '1') {
      router.replace('/events')
    }
  }, [router])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!pin) { setError('Enter PIN'); return }
    const correct = process.env.NEXT_PUBLIC_APP_PIN
    if (!correct || pin !== correct) {
      setError('Incorrect PIN')
      setPin('')
      return
    }
    sessionStorage.setItem('authed', '1')
    router.push('/events')
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="flex flex-col items-center gap-2 mb-8">
        <Timer size={48} />
        <h1 className="text-3xl font-bold">Timing</h1>
      </div>
      <form onSubmit={handleSubmit} className="w-full max-w-xs flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="pin" className="text-sm font-medium">PIN</label>
          <input
            id="pin"
            aria-label="PIN"
            type="password"
            value={pin}
            onChange={e => { setPin(e.target.value); setError(null) }}
            className="border rounded-xl px-4 py-3 text-base"
            autoFocus
            autoComplete="current-password"
          />
        </div>
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <button
          type="submit"
          className="bg-black text-white rounded-xl py-4 text-base font-medium"
        >
          Enter
        </button>
      </form>
    </main>
  )
}
