'use client'
import { useState } from 'react'
import { Mic } from 'lucide-react'
import { startSpeechRecognition, type SpeechResult } from '@/lib/speech'

interface Props {
  onResult: (result: SpeechResult) => void
  onError: (msg: string) => void
  disabled?: boolean
}

export default function MicButton({ onResult, onError, disabled }: Props) {
  const [listening, setListening] = useState(false)

  function handlePress() {
    if (disabled || listening) return
    setListening(true)
    const stop = startSpeechRecognition(
      'th-TH',
      (result) => {
        setListening(false)
        onResult(result)
      },
      (err) => {
        setListening(false)
        onError(err)
      }
    )
    // Auto-stop after 4 seconds as safety measure
    setTimeout(() => { stop(); setListening(false) }, 4000)
  }

  return (
    <button
      onPointerDown={handlePress}
      disabled={disabled}
      className={`
        w-48 h-48 rounded-full flex flex-col items-center justify-center
        text-white font-medium text-sm select-none
        transition-all duration-150
        ${listening
          ? 'bg-red-500 scale-95 shadow-inner'
          : 'bg-black shadow-lg active:scale-95'
        }
        disabled:opacity-40
      `}
    >
      <Mic size={40} strokeWidth={1.5} className="mb-2" />
      <span>{listening ? 'กำลังฟัง...' : 'กดพูดเลขบิบ'}</span>
    </button>
  )
}
