'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { v4 as uuidv4 } from 'uuid'
import MicButton from './MicButton'
import ManualBibInput from './ManualBibInput'
import FinishLog from './FinishLog'
import CaptureToast, { type Toast } from './CaptureToast'
import type { Event, EventDistance, Athlete, PendingRecord } from '@/types'
import type { SpeechResult } from '@/lib/speech'
import { startSpeechRecognition } from '@/lib/speech'
import { addPendingRecord, getPendingRecords, removePendingRecord, removeRecordByBib } from '@/lib/storage'
import { syncPendingRecords } from '@/lib/sync'
import { formatTime } from '@/lib/time'

interface Props {
  event: Event
  distances: EventDistance[]
  athletes: Athlete[]
}

export default function CaptureScreen({ event, distances, athletes: _athletes }: Props) {
  const [listening, setListening] = useState(false)
  const [paused, setPaused] = useState(false)
  const [overwriteBib, setOverwriteBib] = useState<string | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [records, setRecords] = useState<PendingRecord[]>([])

  // Refs mirror state for async loop closures (avoid stale captures)
  const listeningRef = useRef(false)
  const pausedRef = useRef(false)
  const overwriteBibRef = useRef<string | null>(null)
  const stopRef = useRef<(() => void) | null>(null)

  useEffect(() => { listeningRef.current = listening }, [listening])
  useEffect(() => { pausedRef.current = paused }, [paused])
  useEffect(() => { overwriteBibRef.current = overwriteBib }, [overwriteBib])

  useEffect(() => {
    setRecords(getPendingRecords(event.id))
  }, [event.id])

  useEffect(() => {
    function handleOnline() { syncPendingRecords(event.id, () => {}) }
    window.addEventListener('online', handleOnline)
    if (navigator.onLine) handleOnline()
    return () => window.removeEventListener('online', handleOnline)
  }, [event.id])

  function refreshRecords() {
    setRecords(getPendingRecords(event.id))
  }

  function saveRecord(bib: string, capturedAt: string, force = false): string {
    if (force) {
      removeRecordByBib(event.id, bib)
    }
    const localId = uuidv4()
    addPendingRecord({ local_id: localId, event_id: event.id, bib_number: bib, finish_time: capturedAt, synced: false })
    refreshRecords()
    return localId
  }

  // handleResult uses refs for overwriteBib so async loop closures always read current value
  function handleResult(result: SpeechResult, isOneShot = false) {
    if (!result.bib) return // garbled — loop restarts naturally

    const existing = getPendingRecords(event.id).find((r) => r.bib_number === result.bib)
    const isOverwrite = overwriteBibRef.current === result.bib

    if (existing && !isOverwrite) {
      setPaused(true)
      pausedRef.current = true
      setToasts((prev) => [...prev, {
        toastId: uuidv4(),
        type: 'duplicate',
        bib: result.bib!,
        newTime: result.capturedAt,
        existingTime: existing.finish_time,
      }])
    } else {
      const localId = saveRecord(result.bib, result.capturedAt, !!existing)
      setOverwriteBib(null)
      overwriteBibRef.current = null
      setToasts((prev) => [...prev, {
        toastId: uuidv4(),
        type: 'saved',
        bib: result.bib!,
        finishTime: result.capturedAt,
        localId,
      }])
      if (isOneShot) {
        setListening(false)
        listeningRef.current = false
      }
    }
  }

  async function runLoop() {
    while (listeningRef.current && !pausedRef.current) {
      await new Promise<void>((resolve) => {
        stopRef.current = startSpeechRecognition(
          'th-TH',
          (result) => { handleResult(result); resolve() },
          (_error: string) => resolve() // on error: restart loop
        )
      })
    }
  }

  function handleToggle() {
    if (!listening) {
      setListening(true)
      listeningRef.current = true
      runLoop()
    } else {
      setListening(false)
      listeningRef.current = false
      try { stopRef.current?.() } catch { /* already ended */ }
    }
  }

  function handleUndo(localId: string) {
    removePendingRecord(event.id, localId)
    refreshRecords()
    setToasts((prev) => prev.filter((t) => t.type !== 'saved' || t.localId !== localId))
  }

  const handleDismiss = useCallback((toastId: string) => {
    setToasts((prev) => prev.filter((t) => t.toastId !== toastId))
    // Does NOT touch paused — only duplicate-toast handlers clear paused
  }, [])

  function handleOverwrite(bib: string) {
    setOverwriteBib(bib)
    overwriteBibRef.current = bib
    setPaused(false)
    pausedRef.current = false
    setToasts((prev) => prev.filter((t) => !(t.type === 'duplicate' && t.bib === bib)))

    if (listeningRef.current) {
      runLoop() // continuous mode: loop picks up overwriteBibRef.current on next result
    } else {
      // Manual-only mode: one-shot recognition session
      setListening(true)
      listeningRef.current = true
      startSpeechRecognition(
        'th-TH',
        (result) => handleResult(result, true),
        (_error: string) => {
          setListening(false)
          listeningRef.current = false
          setOverwriteBib(null)
          overwriteBibRef.current = null
        }
      )
    }
  }

  function handleSkip(toastId: string) {
    setPaused(false)
    pausedRef.current = false
    setOverwriteBib(null)
    overwriteBibRef.current = null
    setToasts((prev) => prev.filter((t) => t.toastId !== toastId))
    if (listeningRef.current) runLoop()
  }

  function handleManualSubmit(bib: string, capturedAt: string) {
    const existing = getPendingRecords(event.id).find((r) => r.bib_number === bib)
    if (existing) {
      setPaused(true)
      pausedRef.current = true
      setToasts((prev) => [...prev, {
        toastId: uuidv4(),
        type: 'duplicate',
        bib,
        newTime: capturedAt,
        existingTime: existing.finish_time,
      }])
    } else {
      const localId = saveRecord(bib, capturedAt)
      setToasts((prev) => [...prev, {
        toastId: uuidv4(),
        type: 'saved',
        bib,
        finishTime: capturedAt,
        localId,
      }])
    }
  }

  return (
    <div className="flex flex-col items-center px-6 pt-8 pb-6 gap-6 min-h-screen">
      <CaptureToast
        toasts={toasts}
        timezone={event.timezone}
        onUndo={handleUndo}
        onOverwrite={handleOverwrite}
        onSkip={handleSkip}
        onDismiss={handleDismiss}
      />

      {distances.length === 0 ? null : distances.length === 1 ? (
        <div className="w-full text-center">
          <p className="text-xs text-gray-400 uppercase tracking-wider font-medium">ปล่อยตัว</p>
          <p className="text-2xl font-mono font-semibold mt-0.5">
            {formatTime(distances[0].start_time, event.timezone)}
          </p>
        </div>
      ) : (
        <div className="w-full text-center">
          <div className="space-y-0.5">
            {distances.map((d) => (
              <p key={d.id} className="text-sm font-mono">
                <span className="text-gray-400">{d.name}</span>{' '}
                <span className="font-semibold">{formatTime(d.start_time, event.timezone)}</span>
              </p>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 flex items-center justify-center">
        <MicButton listening={listening} onToggle={handleToggle} />
      </div>

      <div className="w-full max-w-sm">
        <ManualBibInput onSubmit={handleManualSubmit} />
      </div>

      <div className="w-full max-w-sm">
        <FinishLog records={records} timezone={event.timezone} />
      </div>
    </div>
  )
}
