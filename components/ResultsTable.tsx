import type { FinishRecord, Event } from '@/types'
import { calcNetTime, formatTime, formatNetTime } from '@/lib/time'

interface Props {
  records: FinishRecord[]
  event: Event
}

export default function ResultsTable({ records, event }: Props) {
  const sorted = [...records].sort((a, b) =>
    calcNetTime(event.start_time, a.finish_time) -
    calcNetTime(event.start_time, b.finish_time)
  )

  if (sorted.length === 0) {
    return <p className="text-gray-400 text-center text-sm py-8">ยังไม่มีผล</p>
  }

  return (
    <div className="w-full">
      <div className="grid grid-cols-3 text-xs text-gray-400 font-medium uppercase tracking-wider pb-2 border-b border-gray-100">
        <span>#</span>
        <span>บิบ</span>
        <span className="text-right">เวลาสุทธิ</span>
      </div>
      {sorted.map((r, i) => (
        <div key={r.id} className="grid grid-cols-3 py-3 border-b border-gray-50 text-sm">
          <span className="text-gray-400 font-medium">{i + 1}</span>
          <span className="font-mono font-semibold">{r.bib_number}</span>
          <span className="font-mono text-right">
            {formatNetTime(calcNetTime(event.start_time, r.finish_time))}
          </span>
        </div>
      ))}
    </div>
  )
}
