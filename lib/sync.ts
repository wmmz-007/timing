import type { PendingRecord, FinishRecord, SyncConflict } from '@/types'
import { supabase } from './supabase'
import { getPendingRecords, markSynced, removeSynced } from './storage'

export interface ConflictResolution {
  winner: 'local' | 'existing'
  conflict: SyncConflict
}

export function resolveConflict(
  local: PendingRecord,
  existing: FinishRecord
): ConflictResolution {
  const localTime = new Date(local.finish_time).getTime()
  const existingTime = new Date(existing.finish_time).getTime()

  const winner = localTime <= existingTime ? 'local' : 'existing'
  const kept = winner === 'local' ? local.finish_time : existing.finish_time
  const discarded = winner === 'local' ? existing.finish_time : local.finish_time

  return {
    winner,
    conflict: {
      bib_number: local.bib_number,
      kept_finish_time: kept,
      discarded_finish_time: discarded,
      resolved_at: new Date().toISOString(),
    },
  }
}

export async function syncPendingRecords(
  eventId: string,
  onConflict: (conflict: SyncConflict) => void
): Promise<void> {
  const pending = getPendingRecords(eventId).filter((r) => !r.synced)
  if (pending.length === 0) return

  for (const record of pending) {
    // Check if bib already exists in Supabase
    const { data: existing } = await supabase
      .from('finish_records')
      .select('*')
      .eq('event_id', eventId)
      .eq('bib_number', record.bib_number)
      .maybeSingle()

    if (existing) {
      const resolution = resolveConflict(record, existing as FinishRecord)
      onConflict(resolution.conflict)

      if (resolution.winner === 'local') {
        // Update the existing record with the earlier time
        await supabase
          .from('finish_records')
          .update({ finish_time: record.finish_time })
          .eq('id', existing.id)
      }
      // If existing wins, do nothing — local record is discarded
      markSynced(eventId, record.local_id)
    } else {
      const { error } = await supabase.from('finish_records').insert({
        event_id: record.event_id,
        bib_number: record.bib_number,
        finish_time: record.finish_time,
      })
      if (!error) {
        markSynced(eventId, record.local_id)
      }
    }
  }

  removeSynced(eventId)
}
