'use client'
import { useEffect, useState } from 'react'

export default function InstallPrompt() {
  const [prompt, setPrompt] = useState<Event | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    function handler(e: Event) {
      e.preventDefault()
      setPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  if (!prompt || dismissed) return null

  async function handleInstall() {
    const deferredPrompt = prompt as BeforeInstallPromptEvent
    deferredPrompt.prompt()
    await deferredPrompt.userChoice
    setDismissed(true)
  }

  return (
    <div className="fixed bottom-6 left-4 right-4 bg-black text-white rounded-2xl p-4 flex items-center justify-between shadow-xl z-50">
      <div>
        <p className="text-sm font-medium">ติดตั้งแอป</p>
        <p className="text-xs text-gray-400 mt-0.5">เพิ่มไปยังหน้าจอหลัก</p>
      </div>
      <div className="flex gap-2">
        <button onClick={() => setDismissed(true)} className="px-3 py-2 text-xs text-gray-400">
          ไว้ก่อน
        </button>
        <button onClick={handleInstall} className="px-4 py-2 bg-white text-black rounded-xl text-xs font-medium">
          ติดตั้ง
        </button>
      </div>
    </div>
  )
}

// Extend Window type for TypeScript
declare global {
  interface BeforeInstallPromptEvent extends Event {
    prompt(): Promise<void>
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
  }
}
