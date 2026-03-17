import type { FinishRecord, Athlete, EventDistance, SubgroupPrizeOverride } from '@/types'
import { calcNetTime } from './time'

export type RankEntry = { overallRank: number | null; divisionRank: number | null }
export type RankMap = Map<string, RankEntry>

export function computeRanks(
  records: FinishRecord[],
  athletes: Athlete[],
  distances: EventDistance[],
  overrides: SubgroupPrizeOverride[],
  overallLockout: boolean
): RankMap {
  const map = new Map<string, RankEntry>()
  const athleteByBib = new Map(athletes.map((a) => [a.bib_number, a]))
  const distanceById = new Map(distances.map((d) => [d.id, d]))

  // Resolve net time for each record that has a registered athlete
  type Enriched = {
    record: FinishRecord
    athlete: Athlete
    distance: EventDistance
    netMs: number
  }

  const enriched: Enriched[] = []
  for (const record of records) {
    const athlete = athleteByBib.get(record.bib_number)
    if (!athlete) continue
    const distance = distanceById.get(athlete.distance_id)
    if (!distance) continue
    enriched.push({
      record,
      athlete,
      distance,
      netMs: calcNetTime(distance.start_time, record.finish_time),
    })
  }

  // Sort comparator: net time ASC, then created_at ASC as tiebreaker for stable ordering
  function compare(a: Enriched, b: Enriched): number {
    if (a.netMs !== b.netMs) return a.netMs - b.netMs
    return new Date(a.record.created_at).getTime() - new Date(b.record.created_at).getTime()
  }

  // Tie detection: only by net time (created_at is a display tiebreaker, not a rank differentiator)
  function isTied(a: Enriched, b: Enriched): boolean {
    return a.netMs === b.netMs
  }

  // Standard competition ranking (ties share rank, next rank skips)
  function assignRanks(sorted: Enriched[], topN: number): Map<string, number> {
    const result = new Map<string, number>()
    let rank = 1
    for (let i = 0; i < sorted.length; i++) {
      if (rank > topN) break
      const bib = sorted[i].record.bib_number
      // Check for tie with previous (by net time only)
      if (i > 0 && isTied(sorted[i], sorted[i - 1])) {
        result.set(bib, result.get(sorted[i - 1].record.bib_number)!)
      } else {
        result.set(bib, rank)
      }
      rank = i + 2  // next rank = position + 1 (1-indexed)
    }
    return result
  }

  // Initialize all registered bibs with null ranks
  for (const e of enriched) {
    map.set(e.record.bib_number, { overallRank: null, divisionRank: null })
  }

  // Step 1: overall ranks per (distance.id, gender)
  const overallWinners = new Set<string>()
  const groupKeys = [...new Set(enriched.map((e) => `${e.distance.id}::${e.athlete.gender}`))]
  for (const key of groupKeys) {
    const [distId, gender] = key.split('::')
    const group = enriched.filter((e) => e.distance.id === distId && e.athlete.gender === gender)
    group.sort(compare)
    const dist = distanceById.get(distId)!
    const ranked = assignRanks(group, dist.overall_top_n)
    for (const [bib, r] of ranked) {
      map.get(bib)!.overallRank = r
      // Lockout: only exclude athletes ranked strictly within the top (overall_top_n - 1) positions
      // so that the last overall prize position is not locked out of division prizes
      if (r < dist.overall_top_n) {
        overallWinners.add(bib)
      }
    }
  }

  // Step 2: division ranks per (distance.id, gender, age_group)
  const divGroupKeys = [...new Set(
    enriched.map((e) => `${e.distance.id}::${e.athlete.gender}::${e.athlete.age_group}`)
  )]
  for (const key of divGroupKeys) {
    const [distId, gender, ageGroup] = key.split('::')
    let pool = enriched.filter(
      (e) => e.distance.id === distId && e.athlete.gender === gender && e.athlete.age_group === ageGroup
    )
    if (overallLockout) {
      pool = pool.filter((e) => !overallWinners.has(e.record.bib_number))
    }
    pool.sort(compare)

    const dist = distanceById.get(distId)!
    const override = overrides.find(
      (o) => o.distance_id === distId && o.gender === gender && o.age_group === ageGroup
    )
    const topN = override ? override.top_n : dist.default_top_n
    const ranked = assignRanks(pool, topN)
    for (const [bib, r] of ranked) {
      map.get(bib)!.divisionRank = r
    }
  }

  return map
}
