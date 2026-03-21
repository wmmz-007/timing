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
    ;(globalThis as any).SpeechRecognition = vi.fn(function () { return mockRec })
  })

  afterEach(() => {
    delete (globalThis as any).SpeechRecognition
  })

  function makeResultEvent(transcript: string, isFinal = false) {
    return {
      resultIndex: 0,
      results: [{ 0: { transcript, confidence: 1 }, length: 1, isFinal }],
    }
  }

  it('calls onInterim with transcript and parsed bib on interim result', () => {
    const onInterim = vi.fn()
    startSpeechRecognition('th-TH', onInterim, vi.fn())
    mockRec.onresult?.(makeResultEvent('235', false))
    expect(onInterim).toHaveBeenCalledWith('235', '235')
  })

  it('calls onInterim with null bib when transcript has no digits', () => {
    const onInterim = vi.fn()
    startSpeechRecognition('th-TH', onInterim, vi.fn())
    mockRec.onresult?.(makeResultEvent('สวัสดี', false))
    expect(onInterim).toHaveBeenCalledWith('สวัสดี', null)
  })

  it('calls onInterim on final result too (isFinal=true)', () => {
    const onInterim = vi.fn()
    startSpeechRecognition('th-TH', onInterim, vi.fn())
    mockRec.onresult?.(makeResultEvent('321', true))
    expect(onInterim).toHaveBeenCalledWith('321', '321')
  })

  it('does NOT call recognition.stop() when bib found (no mid-session stop)', () => {
    startSpeechRecognition('th-TH', vi.fn(), vi.fn())
    mockRec.onresult?.(makeResultEvent('235', true))
    expect(mockRec.stop).not.toHaveBeenCalled()
  })

  it('calls onError("") via onend unconditionally (restart trigger)', () => {
    const onError = vi.fn()
    startSpeechRecognition('th-TH', vi.fn(), onError)
    mockRec.onend?.()
    expect(onError).toHaveBeenCalledWith('')
  })

  it('calls onError("") via onend even after bib was detected (no resultFired guard)', () => {
    const onError = vi.fn()
    startSpeechRecognition('th-TH', vi.fn(), onError)
    mockRec.onresult?.(makeResultEvent('235', true))
    mockRec.onend?.()
    expect(onError).toHaveBeenCalledWith('')
  })

  it('calls onError with error string when recognition fails', () => {
    const onError = vi.fn()
    startSpeechRecognition('th-TH', vi.fn(), onError)
    mockRec.onerror?.({ error: 'no-speech' })
    expect(onError).toHaveBeenCalledWith('no-speech')
  })

  it('calls onError immediately when SpeechRecognition is not supported', () => {
    delete (globalThis as any).SpeechRecognition
    const onError = vi.fn()
    startSpeechRecognition('th-TH', vi.fn(), onError)
    expect(onError).toHaveBeenCalledWith('Web Speech API is not supported in this browser')
  })

  it('calls onError twice when onerror then onend fire (CaptureScreen myGen guard handles dedup)', () => {
    const onError = vi.fn()
    startSpeechRecognition('th-TH', vi.fn(), onError)
    mockRec.onerror?.({ error: 'no-speech' })
    mockRec.onend?.()
    expect(onError).toHaveBeenCalledTimes(2)
    expect(onError).toHaveBeenNthCalledWith(1, 'no-speech')
    expect(onError).toHaveBeenNthCalledWith(2, '')
  })

  it('sets lang and interimResults on the recognition instance', () => {
    startSpeechRecognition('th-TH', vi.fn(), vi.fn())
    expect(mockRec.lang).toBe('th-TH')
    expect(mockRec.interimResults).toBe(true)
  })

  it('calls recognition.start()', () => {
    startSpeechRecognition('th-TH', vi.fn(), vi.fn())
    expect(mockRec.start).toHaveBeenCalledOnce()
  })

  it('returned stop function calls recognition.stop()', () => {
    const stop = startSpeechRecognition('th-TH', vi.fn(), vi.fn())
    stop()
    expect(mockRec.stop).toHaveBeenCalledOnce()
  })
})
