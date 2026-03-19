import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { parseTranscriptToBib, startSpeechRecognition } from '@/lib/speech'

describe('parseTranscriptToBib', () => {
  it('parses Arabic digit string directly', () => {
    expect(parseTranscriptToBib('235')).toBe('235')
  })

  it('parses Thai word-per-digit', () => {
    expect(parseTranscriptToBib('สองสามห้า')).toBe('235')
  })

  it('parses Thai digits with spaces', () => {
    expect(parseTranscriptToBib('สอง สาม ห้า')).toBe('235')
  })

  it('strips prefix "บิบ" before parsing', () => {
    expect(parseTranscriptToBib('บิบ 235')).toBe('235')
  })

  it('strips prefix "หมายเลข" before parsing', () => {
    expect(parseTranscriptToBib('หมายเลข สองสามห้า')).toBe('235')
  })

  it('preserves leading zeros', () => {
    expect(parseTranscriptToBib('ศูนย์เก้าเก้า')).toBe('099')
  })

  it('returns null when no digits found', () => {
    expect(parseTranscriptToBib('สวัสดี')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(parseTranscriptToBib('')).toBeNull()
  })

  it('handles all 10 Thai digit words', () => {
    expect(parseTranscriptToBib('ศูนย์หนึ่งสองสามสี่ห้าหกเจ็ดแปดเก้า')).toBe('0123456789')
  })
})

describe('startSpeechRecognition', () => {
  let mockRec: {
    lang: string
    interimResults: boolean
    maxAlternatives: number
    onresult: ((e: any) => void) | null
    onerror: ((e: any) => void) | null
    onend: (() => void) | null
    start: ReturnType<typeof vi.fn>
    stop: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    mockRec = {
      lang: '',
      interimResults: false,
      maxAlternatives: 1,
      onresult: null,
      onerror: null,
      onend: null,
      start: vi.fn(),
      stop: vi.fn(),
    }
    ;(globalThis as any).SpeechRecognition = vi.fn(function() { return mockRec })
  })

  afterEach(() => {
    delete (globalThis as any).SpeechRecognition
  })

  function makeResultEvent(transcript: string, isFinal = true) {
    return {
      resultIndex: 0,
      results: [{ 0: { transcript, confidence: 1 }, length: 1, isFinal }],
    }
  }

  it('passes capturedAt param through to SpeechResult', () => {
    const onResult = vi.fn()
    startSpeechRecognition('th-TH', '2026-01-01T10:00:00.000Z', onResult, vi.fn())
    mockRec.onresult?.(makeResultEvent('235'))
    expect(onResult).toHaveBeenCalledWith(
      expect.objectContaining({ capturedAt: '2026-01-01T10:00:00.000Z' })
    )
  })

  it('fires onResult on final result with valid bib', () => {
    const onResult = vi.fn()
    startSpeechRecognition('th-TH', '2026-01-01T10:00:00.000Z', onResult, vi.fn())
    mockRec.onresult?.(makeResultEvent('235'))
    expect(onResult).toHaveBeenCalledOnce()
    expect(onResult).toHaveBeenCalledWith({
      transcript: '235',
      bib: '235',
      capturedAt: '2026-01-01T10:00:00.000Z',
    })
  })

  it('calls recognition.stop() immediately when bib found', () => {
    startSpeechRecognition('th-TH', '2026-01-01T10:00:00.000Z', vi.fn(), vi.fn())
    mockRec.onresult?.(makeResultEvent('235'))
    expect(mockRec.stop).toHaveBeenCalledOnce()
  })

  it('does not call onResult when transcript has no bib', () => {
    const onResult = vi.fn()
    startSpeechRecognition('th-TH', '2026-01-01T10:00:00.000Z', onResult, vi.fn())
    mockRec.onresult?.(makeResultEvent('สวัสดี'))
    expect(onResult).not.toHaveBeenCalled()
  })

  it('calls onError("") via onend when session ends without bib (loop restart)', () => {
    const onError = vi.fn()
    startSpeechRecognition('th-TH', '2026-01-01T10:00:00.000Z', vi.fn(), onError)
    mockRec.onend?.()
    expect(onError).toHaveBeenCalledWith('')
  })

  it('does NOT call onError via onend after successful bib capture (resultFired guard)', () => {
    const onError = vi.fn()
    startSpeechRecognition('th-TH', '2026-01-01T10:00:00.000Z', vi.fn(), onError)
    mockRec.onresult?.(makeResultEvent('235'))  // resultFired = true
    mockRec.onend?.()                           // fires after stop()
    expect(onError).not.toHaveBeenCalled()
  })

  it('calls onError with error string when recognition fails', () => {
    const onError = vi.fn()
    startSpeechRecognition('th-TH', '2026-01-01T10:00:00.000Z', vi.fn(), onError)
    mockRec.onerror?.({ error: 'no-speech' })
    expect(onError).toHaveBeenCalledWith('no-speech')
  })

  it('calls onError immediately when SpeechRecognition is not supported', () => {
    delete (globalThis as any).SpeechRecognition
    const onError = vi.fn()
    startSpeechRecognition('th-TH', '2026-01-01T10:00:00.000Z', vi.fn(), onError)
    expect(onError).toHaveBeenCalledWith('Web Speech API is not supported in this browser')
  })

  it('calls onError only once when onerror fires then onend fires', () => {
    const onError = vi.fn()
    startSpeechRecognition('th-TH', '2026-01-01T10:00:00.000Z', vi.fn(), onError)
    mockRec.onerror?.({ error: 'no-speech' })
    mockRec.onend?.()
    expect(onError).toHaveBeenCalledOnce()
    expect(onError).toHaveBeenCalledWith('no-speech')
  })

  it('does NOT fire onResult on interim (non-final) result — display only', () => {
    const onResult = vi.fn()
    startSpeechRecognition('th-TH', '2026-01-01T10:00:00.000Z', onResult, vi.fn())
    mockRec.onresult?.(makeResultEvent('235', false))  // isFinal: false
    expect(onResult).not.toHaveBeenCalled()
  })

  it('calls onInterim for interim result but does not save bib', () => {
    const onResult = vi.fn()
    const onInterim = vi.fn()
    startSpeechRecognition('th-TH', '2026-01-01T10:00:00.000Z', onResult, vi.fn(), onInterim)
    mockRec.onresult?.(makeResultEvent('235', false))  // isFinal: false
    expect(onInterim).toHaveBeenCalledWith('235')
    expect(onResult).not.toHaveBeenCalled()
  })
})
