import { AlertTriangle } from 'lucide-react'
import type { SyncConflict } from '@/types'
import { formatTime } from '@/lib/time'

interface Props {
  conflicts: SyncConflict[]
  timezone: string
}

export default function ConflictsPanel({ conflicts, timezone }: Props) {
  if (conflicts.length === 0) return null

  return (
    <div className="w-full bg-yellow-50 border border-yellow-200 rounded-2xl p-4">
      <p className="text-xs font-semibold text-yellow-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
        <AlertTriangle size={13} strokeWidth={2} /> Sync Conflicts ({conflicts.length})
      </p>
      <div className="space-y-2">
        {conflicts.map((c, i) => (
          <div key={i} className="text-xs text-yellow-800">
            <span className="font-mono font-bold">Bib {c.bib_number}</span>
            {' '}— Kept: {formatTime(c.kept_finish_time, timezone)}
            {', '}Discarded: {formatTime(c.discarded_finish_time, timezone)}
          </div>
        ))}
      </div>
    </div>
  )
}
