'use client'
import { useEffect, useState } from 'react'
import { Share, PlusSquare } from 'lucide-react'

export default function InstallPrompt() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isIos, setIsIos] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }

    // Detect iOS
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)
    setIsIos(ios)

    // Detect standalone mode (already installed)
    const standalone = window.matchMedia('(display-mode: standalone)').matches
    setIsStandalone(standalone)

    // Android / Chrome install prompt
    function handler(e: Event) {
      e.preventDefault()
      setPrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  // Already installed or dismissed
  if (isStandalone || dismissed) return null

  // Android: native install prompt available
  if (prompt) {
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
          <button
            onClick={async () => {
              prompt.prompt()
              await prompt.userChoice
              setDismissed(true)
            }}
            className="px-4 py-2 bg-white text-black rounded-xl text-xs font-medium"
          >
            ติดตั้ง
          </button>
        </div>
      </div>
    )
  }

  // iOS: manual instruction
  if (isIos) {
    return (
      <div className="fixed bottom-6 left-4 right-4 bg-black text-white rounded-2xl p-4 shadow-xl z-50">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <p className="text-sm font-medium mb-1">ติดตั้งแอปบน iPhone</p>
            <p className="text-xs text-gray-400 leading-relaxed">
              กด <Share size={12} className="inline mx-0.5 -mt-0.5" /> แล้วเลือก{' '}
              <span className="text-white font-medium inline-flex items-center gap-0.5">
                <PlusSquare size={12} className="inline" /> เพิ่มในหน้าจอโฮม
              </span>
            </p>
          </div>
          <button onClick={() => setDismissed(true)} className="text-gray-500 text-xs pt-0.5">
            ✕
          </button>
        </div>
      </div>
    )
  }

  return null
}

declare global {
  interface BeforeInstallPromptEvent extends Event {
    prompt(): Promise<void>
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
  }
}
