'use client'
import { useState } from 'react'

interface Props {
  onSubmit: (bib: string, capturedAt: string) => void
}

export default function ManualBibInput({ onSubmit }: Props) {
  const [bib, setBib] = useState('')
  const [open, setOpen] = useState(false)

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
    setOpen(false)
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-sm text-gray-400 underline underline-offset-2"
      >
        กรอกบิบเอง
      </button>
    )
  }

  const keys = [['1','2','3'],['4','5','6'],['7','8','9'],['','0','⌫']]

  return (
    <div className="w-full bg-gray-50 border border-gray-200 rounded-2xl p-4">
      <div className="text-center mb-3">
        <span className="text-3xl font-bold tracking-widest font-mono min-h-[2rem] block">
          {bib || <span className="text-gray-300">—</span>}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 mb-3">
        {keys.flat().map((k, i) => (
          <button
            key={i}
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
      <div className="flex gap-2">
        <button onClick={() => { setBib(''); setOpen(false) }} className="flex-1 py-3 rounded-xl bg-gray-200 text-gray-700 font-medium">
          ยกเลิก
        </button>
        <button onClick={handleSubmit} disabled={!bib} className="flex-1 py-3 rounded-xl bg-black text-white font-medium disabled:opacity-40">
          บันทึก
        </button>
      </div>
    </div>
  )
}
