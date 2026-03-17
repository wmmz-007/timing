import type { Event, PendingRecord } from '@/types'

function pendingKey(eventId: string): string {
  return `timing:pending:${eventId}`
}

function eventKey(eventId: string): string {
  return `timing:event:${eventId}`
}

export function getPendingRecords(eventId: string): PendingRecord[] {
  const raw = localStorage.getItem(pendingKey(eventId))
  if (!raw) return []
  return JSON.parse(raw) as PendingRecord[]
}

function setPendingRecords(eventId: string, records: PendingRecord[]): void {
  localStorage.setItem(pendingKey(eventId), JSON.stringify(records))
}

export function addPendingRecord(record: PendingRecord): void {
  const records = getPendingRecords(record.event_id)
  records.push(record)
  setPendingRecords(record.event_id, records)
}

export function markSynced(eventId: string, localId: string): void {
  const records = getPendingRecords(eventId)
  const updated = records.map((r) =>
    r.local_id === localId ? { ...r, synced: true } : r
  )
  setPendingRecords(eventId, updated)
}

export function removeSynced(eventId: string): void {
  const records = getPendingRecords(eventId).filter((r) => !r.synced)
  setPendingRecords(eventId, records)
}

export function saveEvent(event: Event): void {
  localStorage.setItem(eventKey(event.id), JSON.stringify(event))
}

export function getEventById(eventId: string): Event | null {
  const raw = localStorage.getItem(eventKey(eventId))
  if (!raw) return null
  return JSON.parse(raw) as Event
}
