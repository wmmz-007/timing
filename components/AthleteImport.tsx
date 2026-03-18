'use client'
import { useState, useRef } from 'react'
import Papa from 'papaparse'
import { Upload, Download } from 'lucide-react'
import type { Athlete, EventDistance } from '@/types'

interface ColumnMap {
  bib_number: string
  distance: string
  name: string
  gender: string
  age_group: string
}

interface Props {
  eventId: string
  distances: EventDistance[]
  disabled?: boolean
  onImported: (athletes: Athlete[]) => void
}

function escapeCsv(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export default function AthleteImport({ eventId, distances, disabled, onImported }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [preview, setPreview] = useState<Record<string, string>[]>([])
  const [allRows, setAllRows] = useState<Record<string, string>[]>([])
  const [colMap, setColMap] = useState<ColumnMap>({ bib_number: '', distance: '', name: '', gender: '', age_group: '' })
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const hasPlaceholder = distances.some((d) => d.name === 'ทั้งหมด')
  const distNameById = new Map(distances.map((d) => [d.name.toLowerCase(), d.id]))
  const noDistances = distances.length === 0

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null); setSummary(null)
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        if (!result.data.length) { setError('File has no data'); return }
        const cols = result.meta.fields ?? []
        setHeaders(cols)
        setAllRows(result.data)
        setPreview(result.data.slice(0, 5))
        // Auto-map columns by common Thai/English names
        const guess = (keywords: string[]) =>
          cols.find((c) => keywords.some((k) => c.toLowerCase().includes(k))) ?? ''
        setColMap({
          bib_number: guess(['bib', 'เลข', 'หมายเลข']),
          distance: guess(['distance', 'category', 'ระยะ', 'ประเภท']),
          name: guess(['name', 'ชื่อ']),
          gender: guess(['gender', 'group', 'เพศ']),
          age_group: guess(['age', 'subgroup', 'อายุ', 'รุ่น']),
        })
      },
      error: () => setError('Could not read file'),
    })
    e.target.value = ''
  }

  function unmatchedDistances(): string[] {
    if (!colMap.distance) return []
    const seen = new Set(allRows.map((r) => (r[colMap.distance] ?? '').toLowerCase()))
    return [...seen].filter((v) => v && !distNameById.has(v))
  }

  async function handleImport() {
    if (!colMap.bib_number || !colMap.distance) return
    setLoading(true)
    try {
      const { upsertAthletes, getAthletesForEvent } = await import('@/lib/db')
      const { saveAthletes } = await import('@/lib/storage')
      const athletes: Omit<Athlete, 'id'>[] = []
      let skipped = 0
      for (const row of allRows) {
        const bib = row[colMap.bib_number]?.trim()
        const distName = row[colMap.distance]?.trim().toLowerCase()
        if (!bib || !distName) { skipped++; continue }
        const distId = distNameById.get(distName)
        if (!distId) { skipped++; continue }
        athletes.push({
          event_id: eventId,
          bib_number: bib,
          name: colMap.name ? (row[colMap.name]?.trim() ?? '') : '',
          distance_id: distId,
          gender: colMap.gender ? (row[colMap.gender]?.trim() ?? '') : '',
          age_group: colMap.age_group ? (row[colMap.age_group]?.trim() ?? '') : '',
        })
      }
      // Deduplicate: last row wins
      const dedupMap = new Map<string, Omit<Athlete, 'id'>>()
      for (const a of athletes) dedupMap.set(a.bib_number, a)
      const unique = [...dedupMap.values()]
      await upsertAthletes(eventId, unique)
      const updated = await getAthletesForEvent(eventId)
      saveAthletes(eventId, updated)
      onImported(updated)
      setSummary(`Imported ${unique.length} athletes, skipped ${allRows.length - unique.length} rows`)
      setHeaders([]); setPreview([]); setAllRows([])
    } catch (err) {
      setError('Import failed. Please try again.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  function downloadTemplate() {
    const header = 'bib_number,name,distance,gender,age_group'
    const rows = distances.map((d) => `1,Example Athlete,${escapeCsv(d.name)},,`)
    const csv = [header, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'athlete-template.csv'
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 100)
  }

  const canImport = !!colMap.bib_number && !!colMap.distance && !hasPlaceholder && !noDistances
  const unmatched = unmatchedDistances()

  return (
    <div className="space-y-4">
      {hasPlaceholder && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Name all distances before importing athletes
        </p>
      )}

      {noDistances && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Add distances before importing athletes
        </p>
      )}

      <input ref={inputRef} type="file" accept=".csv" onChange={handleFile} className="hidden" />
      {/* Button row */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={downloadTemplate}
          className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700"
        >
          <Download size={15} /> Download Template
        </button>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || hasPlaceholder || noDistances}
          className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 disabled:opacity-40"
        >
          <Upload size={15} /> Select CSV File
        </button>
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}
      {summary && <p className="text-green-700 text-sm">{summary}</p>}

      {headers.length > 0 && (
        <div className="space-y-3">
          {/* Column mapping */}
          {(['bib_number', 'distance', 'name', 'gender', 'age_group'] as (keyof ColumnMap)[]).map((field) => (
            <div key={field} className="flex items-center gap-3">
              <span className="w-24 text-xs text-gray-500 shrink-0">
                {field === 'bib_number' ? 'Bib *' : field === 'distance' ? 'Distance *' : field === 'name' ? 'Name' : field === 'gender' ? 'Gender' : 'Age Group'}
              </span>
              <select
                value={colMap[field]}
                onChange={(e) => setColMap((prev) => ({ ...prev, [field]: e.target.value }))}
                disabled={disabled}
                className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-black"
              >
                <option value="">— ignore —</option>
                {headers.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
          ))}

          {/* Unmatched distances warning */}
          {unmatched.length > 0 && (
            <p className="text-xs text-amber-700">
              Unmatched distances: {unmatched.join(', ')} — these rows will be skipped
            </p>
          )}

          {/* Preview table */}
          <div className="overflow-x-auto">
            <table className="text-xs w-full border-collapse">
              <thead>
                <tr>{headers.map((h) => <th key={h} className="px-2 py-1 text-left text-gray-400 border-b border-gray-100">{h}</th>)}</tr>
              </thead>
              <tbody>
                {preview.map((row, i) => (
                  <tr key={i} className={unmatched.includes((row[colMap.distance] ?? '').toLowerCase()) ? 'bg-amber-50' : ''}>
                    {headers.map((h) => <td key={h} className="px-2 py-1 border-b border-gray-50">{row[h]}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            type="button"
            onClick={handleImport}
            disabled={!canImport || loading || !!disabled}
            className="w-full bg-black text-white rounded-xl py-3 text-sm font-medium disabled:opacity-40"
          >
            {loading ? 'Importing...' : 'Confirm Import'}
          </button>
        </div>
      )}
    </div>
  )
}
