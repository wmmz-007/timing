'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { Keyboard, FileDown, Table2 } from 'lucide-react'
import MicButton from './MicButton'
import ManualBibInput from './ManualBibInput'
import FinishLog from './FinishLog'
import CaptureToast, { type Toast } from './CaptureToast'
import type { Event, EventDistance, Athlete, PendingRecord, FinishRecord } from '@/types'
import { startSpeechRecognition } from '@/lib/speech'
import { addPendingRecord, getPendingRecords, removePendingRecord, removeRecordByBib } from '@/lib/storage'
import { syncPendingRecords } from '@/lib/sync'
import { generateCsv, generateChipComparisonCsv, downloadCsv } from '@/lib/export'
import { computeRanks } from '@/lib/ranking'

interface Props {
  event: Event
  distances: EventDistance[]
  athletes: Athlete[]
}

function pendingToFinishRecords(records: PendingRecord[]): FinishRecord[] {
  return records.map((r) => ({
    id: r.local_id,
    event_id: r.event_id,
    bib_number: r.bib_number,
    finish_time: r.finish_time,
    created_at: r.finish_time,
  }))
}

export default function CaptureScreen({ event, distances, athletes }: Props) {
  const [listening, setListening] = useState(false)
  const [interimTranscript, setInterimTranscript] = useState('')
  const [interimBib, setInterimBib] = useState<string | null>(null)
  const [manualEditActive, setManualEditActive] = useState(false)
  const [paused, setPaused] = useState(false)
  const [overwriteBib, setOverwriteBib] = useState<string | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [records, setRecords] = useState<PendingRecord[]>([])
  const [manualOpen, setManualOpen] = useState(false)

  const listeningRef = useRef(false)
  const pausedRef = useRef(false)
  const overwriteBibRef = useRef<string | null>(null)
  const stopRef = useRef<(() => void) | null>(null)
  const prewarmRef = useRef<{ stop: () => void } | null>(null)
  const sessionGenRef = useRef(0)
  const interimBibRef = useRef<string | null>(null)
  const manualEditActiveRef = useRef(false)
  const bibCapturedAtRef = useRef<string | null>(null)
  const toggleHandlerRef = useRef<() => void>(() => {})
  const handleConfirmRef = useRef<() => void>(() => {})
  /** Debounced push to Supabase after each local save (pending queue). */
  const syncDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { listeningRef.current = listening }, [listening])
  useEffect(() => { pausedRef.current = paused }, [paused])
  useEffect(() => { overwriteBibRef.current = overwriteBib }, [overwriteBib])
  useEffect(() => { manualEditActiveRef.current = manualEditActive }, [manualEditActive])

  useEffect(() => {
    setRecords(getPendingRecords(event.id))
  }, [event.id])

  const scheduleSyncToDatabase = useCallback(() => {
    const DEBOUNCE_MS = 1200
    if (syncDebounceRef.current) clearTimeout(syncDebounceRef.current)
    syncDebounceRef.current = setTimeout(() => {
      syncDebounceRef.current = null
      if (!navigator.onLine) return
      void syncPendingRecords(event.id, () => {})
    }, DEBOUNCE_MS)
  }, [event.id])

  useEffect(() => {
    function handleOnline() {
      void syncPendingRecords(event.id, () => {})
    }
    window.addEventListener('online', handleOnline)
    if (navigator.onLine) handleOnline()
    return () => window.removeEventListener('online', handleOnline)
  }, [event.id])

  useEffect(() => {
    return () => {
      if (syncDebounceRef.current) clearTimeout(syncDebounceRef.current)
    }
  }, [])

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

  function shouldRestartSpeech(error: string): boolean {
    return !['not-allowed', 'service-not-allowed', 'audio-capture', 'start-failed'].includes(error)
  }

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
        if (bib !== null && !manualEditActiveRef.current) {
          if (interimBibRef.current === null) {
            bibCapturedAtRef.current = new Date().toISOString()
          }
          interimBibRef.current = bib
          setInterimBib(bib)
        }
      },
      (error) => {
        if (sessionGenRef.current !== myGen) return
        if (listeningRef.current && shouldRestartSpeech(error)) {
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
    scheduleSyncToDatabase()
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
      setManualEditActive(false)
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
    setManualEditActive(false)

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

  function handleBackspaceCandidate() {
    if (pausedRef.current || !listeningRef.current) return
    const current = interimBibRef.current ?? interimBib ?? ''
    const next = current.slice(0, -1)
    interimBibRef.current = next.length > 0 ? next : null
    setInterimBib(interimBibRef.current)
    setInterimTranscript('')
    setManualEditActive(true)
  }

  function handleClearCandidate() {
    if (pausedRef.current || !listeningRef.current) return
    interimBibRef.current = null
    bibCapturedAtRef.current = null
    setInterimBib(null)
    setInterimTranscript('')
    setManualEditActive(true)
  }

  function handleSpeakAgain() {
    if (pausedRef.current || !listeningRef.current) return
    try { stopRef.current?.() } catch { /* ignore */ }
    stopRef.current = null
    ++sessionGenRef.current
    interimBibRef.current = null
    bibCapturedAtRef.current = null
    setInterimBib(null)
    setInterimTranscript('')
    setManualEditActive(false)
    startListeningSession()
  }

  toggleHandlerRef.current = handleToggle
  handleConfirmRef.current = handleConfirm

  function exportDateSlug() {
    const sorted = [...distances].sort(
      (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
    )
    return sorted[0]?.start_time.slice(0, 10) ?? new Date().toISOString().slice(0, 10)
  }

  function handleExportFullCsv() {
    const finishRecords = pendingToFinishRecords(records)
    const rankMap = computeRanks(finishRecords, athletes, distances, [], event.overall_lockout)
    const csv = generateCsv(finishRecords, event, athletes, distances, rankMap)
    downloadCsv(csv, `timing-${exportDateSlug()}.csv`)
  }

  function handleExportChipCsv() {
    const csv = generateChipComparisonCsv(pendingToFinishRecords(records), event)
    downloadCsv(csv, `timing-chip-compare-${exportDateSlug()}.csv`)
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

      <div className="flex flex-wrap items-center justify-center gap-2 w-full max-w-sm px-1">
        <button
          type="button"
          aria-label="Enter bib manually"
          onClick={() => setManualOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-full border border-gray-600 bg-gray-900 px-3 py-1.5 text-xs font-medium text-gray-200 hover:bg-gray-800"
        >
          <Keyboard size={14} strokeWidth={2} />
          Manual
        </button>
        <button
          type="button"
          aria-label="Download full results CSV"
          onClick={handleExportFullCsv}
          disabled={records.length === 0}
          className="inline-flex items-center gap-1.5 rounded-full border border-gray-600 bg-gray-900 px-3 py-1.5 text-xs font-medium text-gray-200 hover:bg-gray-800 disabled:opacity-40"
        >
          <FileDown size={14} strokeWidth={2} />
          CSV
        </button>
        <button
          type="button"
          aria-label="Download chip comparison CSV"
          onClick={handleExportChipCsv}
          disabled={records.length === 0}
          className="inline-flex items-center gap-1.5 rounded-full border border-gray-600 bg-gray-900 px-3 py-1.5 text-xs font-medium text-gray-200 hover:bg-gray-800 disabled:opacity-40"
        >
          <Table2 size={14} strokeWidth={2} />
          Chip
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-3">
        <MicButton
          listening={listening}
          onToggle={handleToggle}
        />

        {listening && !paused && (
          <div className="flex flex-col items-center gap-2">
            <div
              data-testid="bib-candidate-box"
              className="w-48 rounded-xl bg-gray-900 border border-gray-700 flex flex-col items-center justify-center px-3 py-4 gap-1"
            >
              <span className="text-xs text-gray-400 uppercase tracking-wider">BIB</span>
              <span className="text-4xl font-mono font-bold text-white text-center tracking-widest break-words max-w-full leading-tight">
                {interimBib ?? '—'}
              </span>
              <span className="text-xs text-gray-400 mt-1 text-center">
                {interimBib
                  ? 'กด Enter เพื่อบันทึกเลขบิบนี้'
                  : 'พูดเลขบิบ แล้วกด Enter เพื่อบันทึก'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="backspace bib"
                onClick={handleBackspaceCandidate}
                className="rounded-md border border-gray-700 bg-gray-900 px-2 py-1 text-xs text-gray-200 hover:bg-gray-800"
              >
                ⌫
              </button>
              <button
                type="button"
                aria-label="clear bib"
                onClick={handleClearCandidate}
                className="rounded-md border border-gray-700 bg-gray-900 px-2 py-1 text-xs text-gray-200 hover:bg-gray-800"
              >
                Clear
              </button>
              <button
                type="button"
                aria-label="speak again"
                onClick={handleSpeakAgain}
                className="rounded-md border border-gray-700 bg-gray-900 px-2 py-1 text-xs text-gray-200 hover:bg-gray-800"
              >
                พูดใหม่
              </button>
            </div>
            <button
              type="button"
              data-testid="big-enter-button"
              aria-label="Confirm and save bib"
              onClick={() => handleConfirm()}
              disabled={interimBib === null}
              className="md:hidden w-full max-w-[min(100%,20rem)] mt-2 rounded-2xl bg-emerald-600 px-4 py-4 text-lg font-semibold text-white shadow-lg active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100"
            >
              Enter — บันทึก
            </button>
          </div>
        )}
      </div>

      <div className="w-full max-w-sm">
        <ManualBibInput
          open={manualOpen}
          onOpenChange={setManualOpen}
          showDefaultTrigger={false}
          onSubmit={handleManualSubmit}
        />
      </div>

      <div className="w-full max-w-sm">
        <FinishLog records={records} timezone={event.timezone} />
      </div>
    </div>
  )
}
