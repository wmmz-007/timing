import type { Event, PendingRecord, EventDistance, Athlete } from '@/types'

function pendingKey(eventId: string): string {
  return `timing:pending:${eventId}`
}

function eventKey(eventId: string): string {
  return `timing:event:${eventId}`
}

export function getPendingRecords(eventId: string): PendingRecord[] {
  const raw = localStorage.getItem(pendingKey(eventId))
  if (!raw) return []
  try {
    return JSON.parse(raw) as PendingRecord[]
  } catch {
    return []
  }
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

export function removePendingRecord(eventId: string, localId: string): void {
  const records = getPendingRecords(eventId).filter((r) => r.local_id !== localId)
  setPendingRecords(eventId, records)
}

export function removeRecordByBib(eventId: string, bib: string): void {
  const records = getPendingRecords(eventId).filter((r) => r.bib_number !== bib)
  setPendingRecords(eventId, records)
}

export function saveEvent(event: Event): void {
  localStorage.setItem(eventKey(event.id), JSON.stringify(event))
}

export function getEventById(eventId: string): Event | null {
  const raw = localStorage.getItem(eventKey(eventId))
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    delete parsed['start_time']   // strip legacy field
    return parsed as unknown as Event
  } catch {
    return null
  }
}

// ---- Distances cache ----
function distancesKey(eventId: string): string {
  return `timing:distances:${eventId}`
}

export function saveDistances(eventId: string, distances: EventDistance[]): void {
  localStorage.setItem(distancesKey(eventId), JSON.stringify(distances))
}

export function getDistances(eventId: string): EventDistance[] {
  const raw = localStorage.getItem(distancesKey(eventId))
  if (!raw) return []
  try { return JSON.parse(raw) as EventDistance[] } catch { return [] }
}

// ---- Athletes cache ----
function athletesKey(eventId: string): string {
  return `timing:athletes:${eventId}`
}

export function saveAthletes(eventId: string, athletes: Athlete[]): void {
  localStorage.setItem(athletesKey(eventId), JSON.stringify(athletes))
}

export function getAthletes(eventId: string): Athlete[] {
  const raw = localStorage.getItem(athletesKey(eventId))
  if (!raw) return []
  try { return JSON.parse(raw) as Athlete[] } catch { return [] }
}

export function clearEventCache(eventId: string): void {
  localStorage.removeItem(pendingKey(eventId))
  localStorage.removeItem(eventKey(eventId))
  localStorage.removeItem(distancesKey(eventId))
  localStorage.removeItem(athletesKey(eventId))
}
