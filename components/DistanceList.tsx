'use client'
import { Plus, X } from 'lucide-react'

export interface DistanceRow {
  key: string      // client-side stable ID (crypto.randomUUID())
  name: string
  time: string     // HH:MM
}

interface Props {
  rows: DistanceRow[]
  date: string     // YYYY-MM-DD, used to build ISO start_time on submit
  onChange: (rows: DistanceRow[]) => void
}

export default function DistanceList({ rows, date, onChange }: Props) {
  function update(key: string, field: keyof DistanceRow, value: string) {
    onChange(rows.map((r) => r.key === key ? { ...r, [field]: value } : r))
  }

  function addRow() {
    onChange([...rows, { key: crypto.randomUUID(), name: '', time: '07:00' }])
  }

  function removeRow(key: string) {
    if (rows.length <= 1) return
    onChange(rows.filter((r) => r.key !== key))
  }

  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.key} className="flex gap-2 items-center">
          <input
            type="text"
            value={row.name}
            onChange={(e) => update(row.key, 'name', e.target.value)}
            placeholder="เช่น 10K"
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black"
            required
          />
          <input
            type="time"
            value={row.time}
            onChange={(e) => update(row.key, 'time', e.target.value)}
            className="w-28 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black"
            required
          />
          <button
            type="button"
            onClick={() => removeRow(row.key)}
            disabled={rows.length <= 1}
            className="p-1.5 text-gray-400 hover:text-gray-700 disabled:opacity-30"
            aria-label="remove distance"
          >
            <X size={16} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addRow}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mt-1"
      >
        <Plus size={14} /> เพิ่มระยะ
      </button>
    </div>
  )
}

/** Convert a DistanceRow + date string → ISO 8601 start_time (Asia/Bangkok = UTC+7) */
export function rowToStartTime(date: string, time: string): string {
  return new Date(`${date}T${time}:00+07:00`).toISOString()
}
