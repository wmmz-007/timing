'use client'
import { useState } from 'react'
import type { Event, EventDistance, Athlete, SubgroupPrizeOverride } from '@/types'

interface Props {
  event: Event
  distances: EventDistance[]
  athletes: Athlete[]
  overrides: SubgroupPrizeOverride[]
  disabled?: boolean
  onUpdated: (overrides: SubgroupPrizeOverride[]) => void
  onEventUpdated: (event: Event) => void
}

export default function PrizeConfig({ event, distances, athletes, overrides, disabled, onUpdated, onEventUpdated }: Props) {
  const [lockout, setLockout] = useState(event.overall_lockout)
  const [expanded, setExpanded] = useState(false)

  // Distinct (gender, age_group) combinations from athletes per distance
  function subgroupsForDistance(distId: string): { gender: string; age_group: string }[] {
    const seen = new Set<string>()
    const result: { gender: string; age_group: string }[] = []
    for (const a of athletes.filter((a) => a.distance_id === distId)) {
      const key = `${a.gender}::${a.age_group}`
      if (!seen.has(key)) { seen.add(key); result.push({ gender: a.gender, age_group: a.age_group }) }
    }
    return result.sort((a, b) => a.gender.localeCompare(b.gender) || a.age_group.localeCompare(b.age_group))
  }

  async function handleLockoutChange(value: boolean) {
    if (disabled) return
    setLockout(value)
    const { updateEventLockout, getEvent } = await import('@/lib/db')
    const { saveEvent } = await import('@/lib/storage')
    await updateEventLockout(event.id, value)
    const updated = await getEvent(event.id)
    if (updated) { saveEvent(updated); onEventUpdated(updated) }
  }

  async function handleDistanceTopN(distId: string, field: 'overall_top_n' | 'default_top_n', value: number) {
    if (disabled || isNaN(value) || value < 1) return
    const { updateDistance } = await import('@/lib/db')
    await updateDistance(distId, { [field]: value })
  }

  async function handleOverrideChange(distId: string, gender: string, ageGroup: string, value: string) {
    if (disabled) return
    const { upsertSubgroupOverride, deleteSubgroupOverride, getSubgroupOverrides } = await import('@/lib/db')
    if (value === '') {
      await deleteSubgroupOverride(distId, gender, ageGroup)
    } else {
      const n = parseInt(value, 10)
      if (isNaN(n) || n < 1) return
      await upsertSubgroupOverride(distId, gender, ageGroup, n)
    }
    const updated = await getSubgroupOverrides(event.id)
    onUpdated(updated)
  }

  function getOverride(distId: string, gender: string, ageGroup: string): number | undefined {
    return overrides.find((o) => o.distance_id === distId && o.gender === gender && o.age_group === ageGroup)?.top_n
  }

  return (
    <div className="space-y-5">
      {/* Overall lockout toggle */}
      <div className="flex items-center justify-between">
        <label className="text-sm text-gray-700">Overall winners excluded from division</label>
        <button
          type="button"
          onClick={() => handleLockoutChange(!lockout)}
          disabled={disabled}
          className={`w-11 h-6 rounded-full transition-colors ${lockout ? 'bg-black' : 'bg-gray-200'} disabled:opacity-40`}
        >
          <span className={`block w-4 h-4 bg-white rounded-full mx-1 transition-transform ${lockout ? 'translate-x-5' : ''}`} />
        </button>
      </div>

      {/* Per-distance top N */}
      {distances.map((dist) => (
        <div key={dist.id} className="space-y-2">
          <p className="text-sm font-medium">{dist.name}</p>
          <div className="flex gap-4 items-center">
            <div className="flex-1">
              <label className="text-xs text-gray-500">Overall top N (per gender)</label>
              <input
                type="number" min={1}
                defaultValue={dist.overall_top_n}
                onBlur={(e) => handleDistanceTopN(dist.id, 'overall_top_n', parseInt(e.target.value, 10))}
                disabled={disabled}
                className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-gray-500">Division default top N</label>
              <input
                type="number" min={1}
                defaultValue={dist.default_top_n}
                onBlur={(e) => handleDistanceTopN(dist.id, 'default_top_n', parseInt(e.target.value, 10))}
                disabled={disabled}
                className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>
          </div>
        </div>
      ))}

      {/* Subgroup overrides */}
      <div>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="text-sm text-gray-500 hover:text-gray-900"
        >
          {expanded ? 'Hide' : 'Show all'} subgroup
        </button>

        {expanded && (
          <div className="mt-3 space-y-2">
            {distances.flatMap((dist) =>
              subgroupsForDistance(dist.id).map(({ gender, age_group }) => (
                <div key={`${dist.id}::${gender}::${age_group}`} className="flex items-center gap-3">
                  <span className="text-xs text-gray-600 flex-1">
                    {dist.name} / {gender} / {age_group}
                  </span>
                  <input
                    type="number" min={1} placeholder={String(dist.default_top_n)}
                    defaultValue={getOverride(dist.id, gender, age_group) ?? ''}
                    onBlur={(e) => handleOverrideChange(dist.id, gender, age_group, e.target.value)}
                    disabled={disabled}
                    className="w-16 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-black"
                  />
                </div>
              ))
            )}
            {athletes.length === 0 && (
              <p className="text-xs text-gray-400">Import athletes first</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
