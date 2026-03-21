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

export function startSpeechRecognition(
  lang: string,
  onInterim: (transcript: string, bib: string | null) => void,
  onError: (error: string) => void,
): () => void {
  const SpeechRecognition =
    ((window as unknown) as { SpeechRecognition?: any; webkitSpeechRecognition?: any })
      .SpeechRecognition ||
    ((window as unknown) as { webkitSpeechRecognition?: any }).webkitSpeechRecognition

  if (!SpeechRecognition) {
    onError('Web Speech API is not supported in this browser')
    return () => {}
  }

  const recognition = new SpeechRecognition()
  recognition.lang = lang
  recognition.interimResults = true
  recognition.maxAlternatives = 1

  recognition.onresult = (event: any) => {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript
      const bib = parseTranscriptToBib(transcript)
      onInterim(transcript, bib)
    }
  }

  recognition.onerror = (event: any) => {
    onError(event.error)
  }

  recognition.onend = () => {
    onError('')
  }

  recognition.start()
  return () => recognition.stop()
}
