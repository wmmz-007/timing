'use client'
import { useState } from 'react'
import { X } from 'lucide-react'

interface Props {
  onSubmit: (bib: string, capturedAt: string) => void
  /** Controlled open state */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** When false and closed, render nothing (use external trigger only) */
  showDefaultTrigger?: boolean
}

export default function ManualBibInput({
  onSubmit,
  open: openProp,
  onOpenChange,
  showDefaultTrigger = true,
}: Props) {
  const [internalOpen, setInternalOpen] = useState(false)
  const controlled = openProp !== undefined
  const open = controlled ? openProp : internalOpen

  function setOpen(next: boolean) {
    if (controlled) onOpenChange?.(next)
    else setInternalOpen(next)
  }

  const [bib, setBib] = useState('')

  function handleKey(digit: string) {
    setBib((prev) => prev + digit)
  }

  function handleBackspace() {
    setBib((prev) => prev.slice(0, -1))
  }

  function handleSubmit() {
    if (!bib) return
    onSubmit(bib, new Date().toISOString())
    setBib('')
  }

  if (!open) {
    if (!showDefaultTrigger) return null
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm text-gray-400 underline underline-offset-2"
      >
        Enter Bib Manually
      </button>
    )
  }

  const keys = [['1','2','3'],['4','5','6'],['7','8','9'],['','0','⌫']]

  return (
    <div className="w-full bg-gray-50 border border-gray-200 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-3xl font-bold tracking-widest font-mono min-h-[2rem]">
          {bib || <span className="text-gray-300">—</span>}
        </span>
        <button
          type="button"
          onClick={() => { setBib(''); setOpen(false) }}
          aria-label="close"
          className="text-gray-400 p-1"
        >
          <X size={18} />
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2 mb-3">
        {keys.flat().map((k, i) => (
          <button
            key={i}
            type="button"
            onClick={() => k === '⌫' ? handleBackspace() : k ? handleKey(k) : undefined}
            className={`py-4 rounded-xl text-xl font-medium ${
              k === '⌫' ? 'bg-gray-200 text-gray-700' :
              k ? 'bg-white border border-gray-200 active:bg-gray-100' :
              'invisible'
            }`}
          >
            {k}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={handleSubmit}
        disabled={!bib}
        className="w-full py-3 rounded-xl bg-black text-white font-medium disabled:opacity-40"
      >
        Save
      </button>
    </div>
  )
}
