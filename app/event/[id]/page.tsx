import Link from 'next/link'
import { Mic, BarChart2, Download, Settings } from 'lucide-react'

interface Props {
  params: Promise<{ id: string }>
}

export default async function EventHubPage({ params }: Props) {
  const { id } = await params

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-4">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">ควบคุมงาน</h1>
        </div>

        <Link
          href={`/event/${id}/capture`}
          className="flex items-center justify-between w-full bg-black text-white rounded-2xl px-6 py-5"
        >
          <div>
            <p className="text-base font-medium">บันทึกเวลา</p>
            <p className="text-xs text-gray-400 mt-0.5">Race Capture</p>
          </div>
          <Mic size={22} strokeWidth={1.75} />
        </Link>

        <Link
          href={`/event/${id}/results`}
          className="flex items-center justify-between w-full bg-gray-50 text-gray-900 rounded-2xl px-6 py-5 border border-gray-100"
        >
          <div>
            <p className="text-base font-medium">ผลการแข่งขัน</p>
            <p className="text-xs text-gray-400 mt-0.5">Live Results</p>
          </div>
          <BarChart2 size={22} strokeWidth={1.75} className="text-gray-500" />
        </Link>

        <Link
          href={`/event/${id}/export`}
          className="flex items-center justify-between w-full bg-gray-50 text-gray-900 rounded-2xl px-6 py-5 border border-gray-100"
        >
          <div>
            <p className="text-base font-medium">ส่งออก CSV</p>
            <p className="text-xs text-gray-400 mt-0.5">Export</p>
          </div>
          <Download size={22} strokeWidth={1.75} className="text-gray-500" />
        </Link>

        <Link
          href={`/event/${id}/settings`}
          className="flex items-center justify-between w-full bg-gray-50 text-gray-900 rounded-2xl px-6 py-5 border border-gray-100"
        >
          <div>
            <p className="text-base font-medium">ตั้งค่า</p>
            <p className="text-xs text-gray-400 mt-0.5">Settings</p>
          </div>
          <Settings size={22} strokeWidth={1.75} className="text-gray-500" />
        </Link>
      </div>
    </main>
  )
}
