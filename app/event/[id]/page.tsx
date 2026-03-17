import Link from 'next/link'

interface Props {
  params: Promise<{ id: string }>
}

export default async function EventHubPage({ params }: Props) {
  const { id } = await params

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-4">
        <div className="mb-8 text-center">
          <span className="text-4xl">🏃</span>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">ควบคุมงาน</h1>
        </div>

        <Link
          href={`/event/${id}/capture`}
          className="flex items-center justify-between w-full bg-black text-white rounded-2xl px-6 py-5"
        >
          <div>
            <p className="text-base font-medium">บันทึกเวลา</p>
            <p className="text-xs text-gray-400 mt-0.5">Race Capture</p>
          </div>
          <span className="text-2xl">🎤</span>
        </Link>

        <Link
          href={`/event/${id}/results`}
          className="flex items-center justify-between w-full bg-gray-50 text-gray-900 rounded-2xl px-6 py-5 border border-gray-100"
        >
          <div>
            <p className="text-base font-medium">ผลการแข่งขัน</p>
            <p className="text-xs text-gray-400 mt-0.5">Live Results</p>
          </div>
          <span className="text-2xl">📊</span>
        </Link>

        <Link
          href={`/event/${id}/export`}
          className="flex items-center justify-between w-full bg-gray-50 text-gray-900 rounded-2xl px-6 py-5 border border-gray-100"
        >
          <div>
            <p className="text-base font-medium">ส่งออก CSV</p>
            <p className="text-xs text-gray-400 mt-0.5">Export</p>
          </div>
          <span className="text-2xl">⬇️</span>
        </Link>
      </div>
    </main>
  )
}
