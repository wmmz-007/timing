import Link from 'next/link'
import { Mic, ChevronLeft } from 'lucide-react'

interface Props {
  params: Promise<{ id: string }>
}

export default async function EventHubPage({ params }: Props) {
  const { id } = await params

  return (
    <main className="relative min-h-screen flex flex-col items-center justify-center px-6">
      <Link href="/events" aria-label="back" className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-700">
        <ChevronLeft size={20} />
      </Link>
      <div className="w-full max-w-sm space-y-4">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Event Control</h1>
        </div>

        <Link
          href={`/event/${id}/capture`}
          className="flex items-center justify-between w-full bg-black text-white rounded-2xl px-6 py-5"
        >
          <div>
            <p className="text-base font-medium">Race Timing Record</p>
          </div>
          <Mic size={22} strokeWidth={1.75} />
        </Link>

      </div>
    </main>
  )
}
