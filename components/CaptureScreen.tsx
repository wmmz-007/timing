'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { v4 as uuidv4 } from 'uuid'
import MicButton from './MicButton'
import ManualBibInput from './ManualBibInput'
import FinishLog from './FinishLog'
import CaptureToast, { type Toast } from './CaptureToast'
import type { Event, EventDistance, Athlete, PendingRecord } from '@/types'
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
  const [interimTranscript, setInterimTranscript] = useState('')
  const [interimBib, setInterimBib] = useState<string | null>(null)
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
  const interimBibRef = useRef<string | null>(null)
  const bibCapturedAtRef = useRef<string | null>(null)
  const toggleHandlerRef = useRef<() => void>(() => {})
  const handleConfirmRef = useRef<() => void>(() => {})

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
    function handleKeyDown(e: KeyboardEvent) {
      if (e.repeat) return
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return
      if (e.code === 'Space') {
        e.preventDefault()
        toggleHandlerRef.current()
      } else if (e.code === 'Enter') {
        e.preventDefault()
        handleConfirmRef.current()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    startPrewarm()
    const timer = setTimeout(() => {
      try { prewarmRef.current?.stop() } catch { /* ignore */ }
    }, 500)
    return () => {
      clearTimeout(timer)
      try { prewarmRef.current?.stop() } catch { /* ignore */ }
      prewarmRef.current = null
    }
  }, [])

  function startListeningSession() {
    const myGen = ++sessionGenRef.current
    stopRef.current = startSpeechRecognition(
      'th-TH',
      (transcript, bib) => {
        if (sessionGenRef.current !== myGen) return
        setInterimTranscript(transcript)
        if (bib !== null) {
          if (interimBibRef.current === null) {
            bibCapturedAtRef.current = new Date().toISOString()
          }
          interimBibRef.current = bib
          setInterimBib(bib)
        }
      },
      (error) => {
        if (sessionGenRef.current !== myGen) return
        if (listeningRef.current) {
          if (interimBibRef.current === null) setInterimTranscript('')
          startListeningSession()
        } else {
          setListening(false)
          listeningRef.current = false
          setInterimTranscript('')
        }
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

  function handleConfirmResult(bib: string, capturedAt: string) {
    const existing = getPendingRecords(event.id).find((r) => r.bib_number === bib)
    const isOverwrite = overwriteBibRef.current === bib

    if (existing && !isOverwrite) {
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
      const localId = saveRecord(bib, capturedAt, !!existing || isOverwrite)
      setOverwriteBib(null)
      overwriteBibRef.current = null
      setToasts((prev) => [...prev, {
        toastId: uuidv4(),
        type: 'saved',
        bib,
        finishTime: capturedAt,
        localId,
      }])
    }
  }

  function handleToggle() {
    if (listeningRef.current) {
      listeningRef.current = false
      ++sessionGenRef.current
      setListening(false)
      setInterimTranscript('')
      interimBibRef.current = null
      bibCapturedAtRef.current = null
      setInterimBib(null)
      try { stopRef.current?.() } catch { /* already ended */ }
      stopRef.current = null
    } else {
      if (pausedRef.current) return
      try { prewarmRef.current?.stop() } catch { /* already ended */ }
      prewarmRef.current = null
      setListening(true)
      listeningRef.current = true
      startListeningSession()
    }
  }

  function handleConfirm() {
    if (pausedRef.current) return
    if (interimBib === null) return
    const bib = interimBib
    const capturedAt = bibCapturedAtRef.current ?? new Date().toISOString()
    const existing = getPendingRecords(event.id).find((r) => r.bib_number === bib)
    const isDuplicateCase = !!existing && overwriteBibRef.current !== bib

    try { stopRef.current?.() } catch { /* ignore */ }
    stopRef.current = null
    interimBibRef.current = null
    bibCapturedAtRef.current = null
    setInterimBib(null)
    setInterimTranscript('')

    if (!isDuplicateCase) {
      ++sessionGenRef.current
    }

    handleConfirmResult(bib, capturedAt)

    if (isDuplicateCase) {
      listeningRef.current = false
      setListening(false)
      return
    }

    if (listeningRef.current && !pausedRef.current) {
      try { prewarmRef.current?.stop() } catch { /* ignore */ }
      prewarmRef.current = null
      startListeningSession()
    }
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
  }

  function handleSkip(toastId: string) {
    setPaused(false)
    pausedRef.current = false
    setOverwriteBib(null)
    overwriteBibRef.current = null
    setToasts((prev) => prev.filter((t) => t.toastId !== toastId))
    if (!listeningRef.current) {
      setListening(true)
      listeningRef.current = true
      try { prewarmRef.current?.stop() } catch { /* ignore */ }
      prewarmRef.current = null
      startListeningSession()
    }
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
      const wasPaused = pausedRef.current
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
      if (wasPaused && !listeningRef.current) {
        setListening(true)
        listeningRef.current = true
        try { prewarmRef.current?.stop() } catch { /* ignore */ }
        prewarmRef.current = null
        startListeningSession()
      }
    }
  }

  toggleHandlerRef.current = handleToggle
  handleConfirmRef.current = handleConfirm

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

      <div className="flex-1 flex flex-col items-center justify-center gap-3">
        <MicButton
          listening={listening}
          onToggle={handleToggle}
        />

        <div className={`w-48 h-12 rounded-xl bg-gray-900 border border-gray-700 flex items-center justify-center px-3 transition-opacity duration-150 ${listening && interimTranscript ? 'opacity-100' : 'opacity-0'}`}>
          <span className="text-white text-xl font-mono font-semibold tracking-widest">
            {interimTranscript}
          </span>
        </div>

        {listening && !paused && (
          <div
            data-testid="bib-candidate-box"
            className="w-48 rounded-xl bg-gray-900 border border-gray-700 flex flex-col items-center justify-center px-3 py-4 gap-1"
          >
            <span className="text-xs text-gray-400 uppercase tracking-wider">BIB</span>
            <span className="text-4xl font-mono font-bold text-white">
              {interimBib ?? '—'}
            </span>
            <span className="text-xs text-gray-400 mt-1 text-center">
              {interimBib
                ? 'กด Enter เพื่อบันทึกเลขบิบนี้'
                : 'พูดเลขบิบ แล้วกด Enter เพื่อบันทึก'}
            </span>
          </div>
        )}
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
