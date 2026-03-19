'use client'
import { Mic } from 'lucide-react'

interface Props {
  listening: boolean
  onPressStart: () => void
  onPressEnd: () => void
  disabled?: boolean
}

export default function MicButton({ listening, onPressStart, onPressEnd, disabled }: Props) {
  return (
    <button
      onPointerDown={() => { if (!disabled) onPressStart() }}
      onPointerUp={() => { if (!disabled) onPressEnd() }}
      onPointerLeave={() => { if (!disabled) onPressEnd() }}
      onPointerCancel={() => { if (!disabled) onPressEnd() }}
      disabled={disabled}
      className={`
        w-48 h-48 rounded-full flex flex-col items-center justify-center
        text-white font-medium text-sm select-none
        transition-all duration-150
        ${listening
          ? 'bg-red-500 scale-95 shadow-inner animate-pulse'
          : 'bg-black shadow-lg active:scale-95'
        }
        disabled:opacity-40
      `}
    >
      <Mic size={40} strokeWidth={1.5} className="mb-2" />
      <span>{listening ? 'Listening...' : 'Hold to Record Bib'}</span>
    </button>
  )
}
