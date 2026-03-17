'use client'
import { useState, useEffect } from 'react'
import { v4 as uuidv4 } from 'uuid'
import MicButton from './MicButton'
import ConfirmCapture from './ConfirmCapture'
import ManualBibInput from './ManualBibInput'
import FinishLog from './FinishLog'
import type { Event, PendingRecord } from '@/types'
import type { SpeechResult } from '@/lib/speech'
import { addPendingRecord, getPendingRecords } from '@/lib/storage'
import { syncPendingRecords } from '@/lib/sync'
import { Check, X } from 'lucide-react'
import { formatTime } from '@/lib/time'

interface Props {
  event: Event
}

export default function CaptureScreen({ event }: Props) {
  const [pending, setPending] = useState<SpeechResult & { capturedAt: string } | null>(null)
  const [records, setRecords] = useState<PendingRecord[]>([])
  const [error, setError] = useState<string | null>(null)
  const [duplicateWarning, setDuplicateWarning] = useState<{ bib: string; capturedAt: string; existingTime: string } | null>(null)

  useEffect(() => {
    setRecords(getPendingRecords(event.id))
  }, [event.id])

  // Sync when online
  useEffect(() => {
    function handleOnline() {
      syncPendingRecords(event.id, () => {})
    }
    window.addEventListener('online', handleOnline)
    if (navigator.onLine) handleOnline()
    return () => window.removeEventListener('online', handleOnline)
  }, [event.id])

  function saveRecord(bib: string, capturedAt: string, force = false) {
    const existingRecords = getPendingRecords(event.id)
    const duplicate = existingRecords.find((r) => r.bib_number === bib)

    if (duplicate && !force) {
      setDuplicateWarning({ bib, capturedAt, existingTime: duplicate.finish_time })
      return
    }

    if (duplicate && force) {
      // Remove the old record before inserting the new one
      const updated = existingRecords.filter((r) => r.bib_number !== bib)
      localStorage.setItem(`timing:pending:${event.id}`, JSON.stringify(updated))
    }

    const record: PendingRecord = {
      local_id: uuidv4(),
      event_id: event.id,
      bib_number: bib,
      finish_time: capturedAt,
      synced: false,
    }
    addPendingRecord(record)
    setRecords(getPendingRecords(event.id))
    setPending(null)
    setError(null)
    setDuplicateWarning(null)
  }

  function handleSpeechResult(result: SpeechResult) {
    setPending(result)
    setError(null)
    setDuplicateWarning(null)
  }

  function handleManualSubmit(bib: string, capturedAt: string) {
    saveRecord(bib, capturedAt)
  }

  function handleConfirm() {
    if (!pending?.bib) return
    saveRecord(pending.bib, pending.capturedAt)
  }

  return (
    <div className="flex flex-col items-center px-6 pt-8 pb-6 gap-6 min-h-screen">
      <div className="w-full text-center">
        <p className="text-xs text-gray-400 uppercase tracking-wider font-medium">ปล่อยตัว</p>
        <p className="text-2xl font-mono font-semibold mt-0.5">
          {formatTime(event.start_time, event.timezone)}
        </p>
      </div>

      <div className="flex-1 flex items-center justify-center">
        <MicButton
          onResult={handleSpeechResult}
          onError={(e) => setError(`ไมค์ผิดพลาด: ${e}`)}
          disabled={!!pending}
        />
      </div>

      {error && (
        <p className="text-red-500 text-sm text-center">{error}</p>
      )}

      {duplicateWarning && (
        <div className="w-full bg-yellow-50 border border-yellow-200 rounded-2xl p-4 text-sm text-yellow-800">
          <p className="mb-3">
            บิบ {duplicateWarning.bib} บันทึกไปแล้ว ({formatTime(duplicateWarning.existingTime, event.timezone)}) — เขียนทับด้วยเวลาใหม่?
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => saveRecord(duplicateWarning.bib, duplicateWarning.capturedAt, true)}
              className="flex-1 bg-yellow-700 text-white rounded-xl py-2.5 text-sm font-medium"
            >
              <Check size={14} strokeWidth={2.5} className="inline mr-1" />เขียนทับ
            </button>
            <button
              onClick={() => { setDuplicateWarning(null); setPending(null) }}
              className="flex-1 bg-yellow-100 text-yellow-800 rounded-xl py-2.5 text-sm font-medium"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      )}

      {pending && (
        <div className="w-full max-w-sm">
          <ConfirmCapture
            transcript={pending.transcript}
            bib={pending.bib}
            capturedAt={pending.capturedAt}
            timezone={event.timezone}
            onConfirm={handleConfirm}
            onDiscard={() => { setPending(null); setDuplicateWarning(null) }}
          />
        </div>
      )}

      <div className="w-full max-w-sm">
        <ManualBibInput onSubmit={handleManualSubmit} />
      </div>

      <div className="w-full max-w-sm">
        <FinishLog records={records} timezone={event.timezone} />
      </div>
    </div>
  )
}
