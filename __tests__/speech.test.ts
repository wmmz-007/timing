import { describe, it, expect } from 'vitest'
import { parseTranscriptToBib } from '@/lib/speech'

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
