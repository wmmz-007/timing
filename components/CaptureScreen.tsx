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

  const listeningRef = useRef(false)
  const pausedRef = useRef(false)
  const overwriteBibRef = useRef<string | null>(null)
  const stopRef = useRef<(() => void) | null>(null)
  const prewarmRef = useRef<{ stop: () => void } | null>(null)
  const sessionGenRef = useRef(0)

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

  function startPrewarm() {
    const SpeechRecognition =
      ((window as unknown) as { SpeechRecognition?: any; webkitSpeechRecognition?: any })
        .SpeechRecognition ||
      ((window as unknown) as { webkitSpeechRecognition?: any }).webkitSpeechRecognition
    if (!SpeechRecognition) return
    try {
      const prewarm = new SpeechRecognition()
      prewarm.lang = 'th-TH'
      prewarm.interimResults = true
      prewarmRef.current = prewarm
      prewarm.onerror = () => { if (prewarmRef.current === prewarm) prewarmRef.current = null }
      prewarm.onend   = () => { if (prewarmRef.current === prewarm) prewarmRef.current = null }
      prewarm.start()
    } catch { /* browser may not support */ }
  }

  useEffect(() => {
    startPrewarm()
    // Abort mount pre-warm after 500ms to force browser subsystem init without holding mic open
    const timer = setTimeout(() => {
      try { prewarmRef.current?.stop() } catch { /* ignore */ }
    }, 500)
    return () => {
      clearTimeout(timer)
      try { prewarmRef.current?.stop() } catch { /* ignore */ }
      prewarmRef.current = null
    }
  }, [])

  function startListeningSession(capturedAt: string, myGen: number, onErrorExtra?: () => void) {
    stopRef.current = startSpeechRecognition(
      'th-TH',
      capturedAt,
      (result) => {
        if (sessionGenRef.current !== myGen) return
        setListening(false)
        listeningRef.current = false
        handleResult(result)
      },
      (error) => {
        if (sessionGenRef.current !== myGen) return
        // If session ended with no bib (error === '') and user is still holding → restart
        if (error === '' && listeningRef.current) {
          startListeningSession(capturedAt, myGen, onErrorExtra)
          return
        }
        setListening(false)
        listeningRef.current = false
        onErrorExtra?.()
      }
    )
  }

  function refreshRecords() {
    setRecords(getPendingRecords(event.id))
  }

  function saveRecord(bib: string, capturedAt: string, force = false): string {
    if (force) removeRecordByBib(event.id, bib)
    const localId = uuidv4()
    addPendingRecord({ local_id: localId, event_id: event.id, bib_number: bib, finish_time: capturedAt, synced: false })
    refreshRecords()
    startPrewarm()
    return localId
  }

  function handleResult(result: SpeechResult) {
    if (!result.bib) return
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
    }
  }

  function handlePressStart() {
    if (listeningRef.current) return
    if (pausedRef.current) return
    // Stop pre-warm so it doesn't conflict with the real recognition session
    try { prewarmRef.current?.stop() } catch { /* already ended */ }
    prewarmRef.current = null
    const capturedAt = new Date().toISOString()
    const myGen = ++sessionGenRef.current
    setListening(true)
    listeningRef.current = true
    startListeningSession(capturedAt, myGen)
  }

  function handlePressEnd() {
    if (!listeningRef.current) return
    setListening(false)
    listeningRef.current = false
    try { stopRef.current?.() } catch { /* already ended */ }
    stopRef.current = null
  }

  function handleUndo(localId: string) {
    removePendingRecord(event.id, localId)
    refreshRecords()
    setToasts((prev) => prev.filter((t) => t.type !== 'saved' || t.localId !== localId))
  }

  const handleDismiss = useCallback((toastId: string) => {
    setToasts((prev) => prev.filter((t) => t.toastId !== toastId))
  }, [])

  function handleOverwrite(bib: string) {
    setOverwriteBib(bib)
    overwriteBibRef.current = bib
    setPaused(false)
    pausedRef.current = false
    setToasts((prev) => prev.filter((t) => !(t.type === 'duplicate' && t.bib === bib)))
    // Stop pre-warm so it doesn't conflict with the real recognition session
    try { prewarmRef.current?.stop() } catch { /* already ended */ }
    prewarmRef.current = null
    // Overwrite path: capture timestamp now since there is no pointer-down event from MicButton.
    // The original duplicate time is discarded intentionally — the operator is re-recording the bib.
    const capturedAt = new Date().toISOString()
    const myGen = ++sessionGenRef.current
    setListening(true)
    listeningRef.current = true
    startListeningSession(capturedAt, myGen, () => {
      setOverwriteBib(null)
      overwriteBibRef.current = null
    })
  }

  function handleSkip(toastId: string) {
    setPaused(false)
    pausedRef.current = false
    setOverwriteBib(null)
    overwriteBibRef.current = null
    setToasts((prev) => prev.filter((t) => t.toastId !== toastId))
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
      setPaused(false)
      pausedRef.current = false
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
          <p className="text-xs text-gray-400 uppercase tracking-wider font-medium">Start</p>
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
        <MicButton
          listening={listening}
          onPressStart={handlePressStart}
          onPressEnd={handlePressEnd}
        />
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
