export interface Event {
  id: string
  name: string
  start_time: string    // ISO 8601 timestamptz, e.g. "2026-03-16T07:00:00+07:00"
  timezone: string      // IANA timezone, e.g. "Asia/Bangkok"
}

export interface FinishRecord {
  id: string
  event_id: string
  bib_number: string    // string to preserve leading zeros
  finish_time: string   // ISO 8601 timestamptz
  created_at: string
}

// A record not yet synced to Supabase, kept in Local Storage
export interface PendingRecord {
  local_id: string      // uuid generated client-side
  event_id: string
  bib_number: string
  finish_time: string
  synced: boolean
}

export interface SyncConflict {
  bib_number: string
  kept_finish_time: string
  discarded_finish_time: string
  resolved_at: string
}
