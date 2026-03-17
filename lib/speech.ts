const THAI_DIGITS: Record<string, string> = {
  'ศูนย์': '0',
  'หนึ่ง': '1',
  'สอง':  '2',
  'สาม':  '3',
  'สี่':   '4',
  'ห้า':   '5',
  'หก':   '6',
  'เจ็ด':  '7',
  'แปด':  '8',
  'เก้า':  '9',
}

const PREFIX_WORDS = ['บิบ', 'หมายเลข']

export function parseTranscriptToBib(transcript: string): string | null {
  let text = transcript.trim()
  for (const prefix of PREFIX_WORDS) {
    if (text.startsWith(prefix)) {
      text = text.slice(prefix.length).trim()
      break
    }
  }
  const arabicMatch = text.replace(/\s/g, '').match(/^\d+$/)
  if (arabicMatch) return arabicMatch[0]
  let result = ''
  let remaining = text.replace(/\s/g, '')
  while (remaining.length > 0) {
    let matched = false
    for (const [word, digit] of Object.entries(THAI_DIGITS)) {
      if (remaining.startsWith(word)) {
        result += digit
        remaining = remaining.slice(word.length)
        matched = true
        break
      }
    }
    if (!matched) break
  }
  if (result.length > 0) return result
  return null
}

export interface SpeechResult {
  transcript: string
  bib: string | null
  capturedAt: string
}

export function startSpeechRecognition(
  lang: string,
  onResult: (result: SpeechResult) => void,
  onError: (error: string) => void
): () => void {
  const SpeechRecognition =
    (window as typeof window & { SpeechRecognition?: typeof window.SpeechRecognition; webkitSpeechRecognition?: typeof window.SpeechRecognition })
      .SpeechRecognition ||
    (window as typeof window & { webkitSpeechRecognition?: typeof window.SpeechRecognition }).webkitSpeechRecognition

  if (!SpeechRecognition) {
    onError('Web Speech API is not supported in this browser')
    return () => {}
  }
  const recognition = new SpeechRecognition()
  recognition.lang = lang
  recognition.interimResults = false
  recognition.maxAlternatives = 1
  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript
    const capturedAt = new Date().toISOString()
    const bib = parseTranscriptToBib(transcript)
    onResult({ transcript, bib, capturedAt })
  }
  recognition.onerror = (event) => { onError(event.error) }
  recognition.start()
  return () => recognition.stop()
}
