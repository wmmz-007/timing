import { supabase } from './supabase'
import type { Event, FinishRecord } from '@/types'

export async function createEvent(
  input: Omit<Event, 'id'>
): Promise<Event> {
  const { data, error } = await supabase
    .from('events')
    .insert(input)
    .select()
    .single()
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
