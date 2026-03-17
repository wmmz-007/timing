'use client'
import { useEffect } from 'react'
import { RotateCcw } from 'lucide-react'
import { formatTime } from '@/lib/time'

export type Toast =
  | { toastId: string; type: 'saved'; bib: string; finishTime: string; localId: string }
  | { toastId: string; type: 'duplicate'; bib: string; newTime: string; existingTime: string }

interface Props {
  toasts: Toast[]
  timezone: string
  onUndo: (localId: string) => void
  onOverwrite: (bib: string) => void
  onSkip: (toastId: string) => void
  onDismiss: (toastId: string) => void
}

function SavedToast({ toast, timezone, onUndo, onDismiss }: {
  toast: Extract<Toast, { type: 'saved' }>
  timezone: string
  onUndo: (localId: string) => void
  onDismiss: (toastId: string) => void
}) {
  useEffect(() => {
    const t = setTimeout(() => onDismiss(toast.toastId), 2000)
    return () => clearTimeout(t)
  }, [toast.toastId, onDismiss])

  return (
    <div className="flex items-center justify-between bg-gray-900 text-white rounded-2xl px-4 py-3 shadow-lg">
      <span className="text-sm font-medium">
        บิบ {toast.bib} — {formatTime(toast.finishTime, timezone)}
      </span>
      <button
        onClick={() => onUndo(toast.localId)}
        className="flex items-center gap-1 text-xs text-gray-400 ml-4"
      >
        <RotateCcw size={12} /> ย้อนกลับ
      </button>
    </div>
  )
}

function DuplicateToast({ toast, timezone, onOverwrite, onSkip }: {
  toast: Extract<Toast, { type: 'duplicate' }>
  timezone: string
  onOverwrite: (bib: string) => void
  onSkip: (toastId: string) => void
}) {
  return (
    <div className="bg-yellow-50 border border-yellow-200 rounded-2xl px-4 py-3 shadow-lg">
      <p className="text-sm font-medium text-yellow-800 mb-2">
        {toast.bib} ซ้ำ — บันทึกไปแล้ว {formatTime(toast.existingTime, timezone)}
      </p>
      <div className="flex gap-2">
        <button
          onClick={() => onOverwrite(toast.bib)}
          className="flex-1 py-2 rounded-xl bg-yellow-700 text-white text-xs font-medium"
        >
          อ่านใหม่
        </button>
        <button
          onClick={() => onSkip(toast.toastId)}
          className="flex-1 py-2 rounded-xl bg-yellow-100 text-yellow-800 text-xs font-medium"
        >
          ข้าม
        </button>
      </div>
    </div>
  )
}

export default function CaptureToast({ toasts, timezone, onUndo, onOverwrite, onSkip, onDismiss }: Props) {
  if (toasts.length === 0) return null
  return (
    <div className="fixed top-4 left-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) =>
        t.type === 'saved'
          ? <SavedToast key={t.toastId} toast={t} timezone={timezone} onUndo={onUndo} onDismiss={onDismiss} />
          : <DuplicateToast key={t.toastId} toast={t} timezone={timezone} onOverwrite={onOverwrite} onSkip={onSkip} />
      )}
    </div>
  )
}
