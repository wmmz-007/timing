import { formatTime } from '@/lib/time'

interface Props {
  transcript: string
  bib: string | null
  capturedAt: string
  timezone: string
  onConfirm: () => void
  onDiscard: () => void
}

export default function ConfirmCapture({ transcript, bib, capturedAt, timezone, onConfirm, onDiscard }: Props) {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5 w-full">
      <p className="text-xs text-gray-400 mb-3">ได้ยิน: "{transcript}"</p>

      {bib ? (
        <div className="flex items-baseline gap-3 mb-5">
          <span className="text-4xl font-bold tracking-tight">{bib}</span>
          <span className="text-gray-400 text-lg">→</span>
          <span className="text-2xl font-mono text-gray-700">
            {formatTime(capturedAt, timezone)}
          </span>
        </div>
      ) : (
        <p className="text-red-500 mb-5 text-sm">ไม่พบเลขบิบ — กรอกเองด้านล่าง</p>
      )}

      <div className="flex gap-3">
        {bib && (
          <button
            onClick={onConfirm}
            className="flex-1 bg-black text-white rounded-xl py-3.5 font-medium"
          >
            ✓ บันทึก
          </button>
        )}
        <button
          onClick={onDiscard}
          className="flex-1 bg-gray-200 text-gray-700 rounded-xl py-3.5 font-medium"
        >
          ✗ ยกเลิก
        </button>
      </div>
    </div>
  )
}
