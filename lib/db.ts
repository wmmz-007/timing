import { supabase } from './supabase'
import type { Event, FinishRecord, EventDistance, Athlete, SubgroupPrizeOverride } from '@/types'

// ---- Events ----

export async function createEventWithDistances(
  name: string,
  timezone: string,
  distances: { name: string; start_time: string; overall_top_n?: number; default_top_n?: number }[]
): Promise<Event> {
  const { data, error } = await supabase.rpc('create_event_with_distances', {
    p_name: name,
    p_timezone: timezone,
    p_distances: JSON.stringify(distances),
  })
  if (error) throw error
  return data as Event
}

export async function getEvent(id: string): Promise<Event | null> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data as Event | null
}

export async function updateEventLockout(id: string, overallLockout: boolean): Promise<void> {
  const { error } = await supabase
    .from('events')
    .update({ overall_lockout: overallLockout })
    .eq('id', id)
  if (error) throw error
}

export async function getEvents(): Promise<Event[]> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Event[]
}

export async function updateEventName(id: string, name: string): Promise<void> {
  const { error } = await supabase
    .from('events')
    .update({ name })
    .eq('id', id)
  if (error) throw error
}

export async function deleteEvent(id: string): Promise<void> {
  // Must delete athletes first — athletes.distance_id → event_distances is ON DELETE RESTRICT
  const { error: err1 } = await supabase.from('athletes').delete().eq('event_id', id)
  if (err1) throw err1
  const { error: err2 } = await supabase.from('events').delete().eq('id', id)
  if (err2) throw err2
}

export async function getEventStats(id: string): Promise<{ recordCount: number; athleteCount: number }> {
  const [recordRes, athleteRes] = await Promise.all([
    supabase.from('finish_records').select('*', { count: 'exact', head: true }).eq('event_id', id),
    supabase.from('athletes').select('*', { count: 'exact', head: true }).eq('event_id', id),
  ])
  if (recordRes.error) throw recordRes.error
  if (athleteRes.error) throw athleteRes.error
  return { recordCount: recordRes.count ?? 0, athleteCount: athleteRes.count ?? 0 }
}

// ---- Distances ----

export async function getDistancesForEvent(eventId: string): Promise<EventDistance[]> {
  const { data, error } = await supabase
    .from('event_distances')
    .select('*')
    .eq('event_id', eventId)
    .order('start_time', { ascending: true })
  if (error) throw error
  return (data ?? []) as EventDistance[]
}

export async function updateDistance(
  id: string,
  patch: Partial<Pick<EventDistance, 'name' | 'start_time' | 'overall_top_n' | 'default_top_n'>>
): Promise<void> {
  const { error } = await supabase.from('event_distances').update(patch).eq('id', id)
  if (error) throw error
}

export async function addDistance(
  eventId: string,
  name: string,
  startTime: string
): Promise<EventDistance> {
  const { data, error } = await supabase
    .from('event_distances')
    .insert({ event_id: eventId, name, start_time: startTime })
    .select()
    .single()
  if (error) throw error
  return data as EventDistance
}

export async function deleteDistanceAndAthletes(distanceId: string): Promise<void> {
  // Delete athletes first (FK is RESTRICT, not CASCADE)
  const { error: err1 } = await supabase
    .from('athletes')
    .delete()
    .eq('distance_id', distanceId)
  if (err1) throw err1
  const { error: err2 } = await supabase
    .from('event_distances')
    .delete()
    .eq('id', distanceId)
  if (err2) throw err2
}

export async function deleteDistance(id: string): Promise<void> {
  // Plain delete — throws if athletes reference this distance (ON DELETE RESTRICT)
  const { error } = await supabase.from('event_distances').delete().eq('id', id)
  if (error) throw error
}

// ---- Athletes ----

export async function getAthletesForEvent(eventId: string): Promise<Athlete[]> {
  const { data, error } = await supabase
    .from('athletes')
    .select('*')
    .eq('event_id', eventId)
  if (error) throw error
  return (data ?? []) as Athlete[]
}

export async function upsertAthletes(eventId: string, athletes: Omit<Athlete, 'id'>[]): Promise<void> {
  // Delete all existing athletes for event, then insert new batch
  const { error: delErr } = await supabase.from('athletes').delete().eq('event_id', eventId)
  if (delErr) throw delErr
  if (athletes.length === 0) return
  const { error: insErr } = await supabase.from('athletes').insert(athletes)
  if (insErr) throw insErr
}

// ---- Subgroup prize overrides ----

export async function getSubgroupOverrides(eventId: string): Promise<SubgroupPrizeOverride[]> {
  // First get distance IDs for this event
  const { data: distData, error: distErr } = await supabase
    .from('event_distances')
    .select('id')
    .eq('event_id', eventId)
  if (distErr) throw distErr
  const distanceIds = (distData ?? []).map((d: { id: string }) => d.id)
  if (distanceIds.length === 0) return []

  const { data, error } = await supabase
    .from('subgroup_prize_overrides')
    .select('*')
    .in('distance_id', distanceIds)
  if (error) throw error
  return (data ?? []) as SubgroupPrizeOverride[]
}

export async function upsertSubgroupOverride(
  distanceId: string,
  gender: string,
  ageGroup: string,
  topN: number
): Promise<void> {
  const { error } = await supabase
    .from('subgroup_prize_overrides')
    .upsert({ distance_id: distanceId, gender, age_group: ageGroup, top_n: topN })
  if (error) throw error
}

export async function deleteSubgroupOverride(
  distanceId: string,
  gender: string,
  ageGroup: string
): Promise<void> {
  const { error } = await supabase
    .from('subgroup_prize_overrides')
    .delete()
    .eq('distance_id', distanceId)
    .eq('gender', gender)
    .eq('age_group', ageGroup)
  if (error) throw error
}

// ---- Finish records (unchanged) ----

export async function createFinishRecord(
  input: Omit<FinishRecord, 'id' | 'created_at'>
): Promise<FinishRecord> {
  const { data, error } = await supabase
    .from('finish_records')
    .insert(input)
    .select()
    .single()
  if (error) throw error
  return data as FinishRecord
}

export async function getFinishRecords(eventId: string): Promise<FinishRecord[]> {
  const { data, error } = await supabase
    .from('finish_records')
    .select('*')
    .eq('event_id', eventId)
    .order('finish_time', { ascending: true })
  if (error) throw error
  return (data ?? []) as FinishRecord[]
}
