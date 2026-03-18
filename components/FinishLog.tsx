import type { PendingRecord } from '@/types'
import { formatTime } from '@/lib/time'

interface Props {
  records: PendingRecord[]
  timezone: string
}

export default function FinishLog({ records, timezone }: Props) {
  if (records.length === 0) return null

  const recent = [...records].reverse().slice(0, 10)

  return (
    <div className="w-full">
      <p className="text-xs text-gray-400 mb-2 font-medium uppercase tracking-wider">Recent</p>
      <div className="divide-y divide-gray-100">
        {recent.map((r) => (
          <div key={r.local_id} className="flex justify-between py-2.5 text-sm">
            <span className="font-mono font-semibold">{r.bib_number}</span>
            <span className="text-gray-400 font-mono">{formatTime(r.finish_time, timezone)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
