export interface Event {
  id: string
  name: string
  timezone: string
  overall_lockout: boolean
  created_at: string
  password: string
}

export interface EventDistance {
  id: string
  event_id: string
  name: string
  start_time: string    // ISO 8601 timestamptz
  overall_top_n: number
  default_top_n: number
}

export interface Athlete {
  id: string
  event_id: string
  bib_number: string
  name: string
  distance_id: string
  gender: string
  age_group: string
}

export interface SubgroupPrizeOverride {
  id: string
  distance_id: string
  gender: string
  age_group: string
  top_n: number
}

export interface FinishRecord {
  id: string
  event_id: string
  bib_number: string
  finish_time: string
  created_at: string
}

// A record not yet synced to Supabase, kept in Local Storage
export interface PendingRecord {
  local_id: string
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
