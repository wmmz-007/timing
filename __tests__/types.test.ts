import { describe, it, expectTypeOf } from 'vitest'
import type { Event, EventDistance, Athlete, SubgroupPrizeOverride } from '@/types'

describe('EventDistance type', () => {
  it('has required fields', () => {
    expectTypeOf<EventDistance>().toHaveProperty('id')
    expectTypeOf<EventDistance>().toHaveProperty('event_id')
    expectTypeOf<EventDistance>().toHaveProperty('name')
    expectTypeOf<EventDistance>().toHaveProperty('start_time')
    expectTypeOf<EventDistance>().toHaveProperty('overall_top_n')
    expectTypeOf<EventDistance>().toHaveProperty('default_top_n')
  })
})

describe('Athlete type', () => {
  it('has required fields', () => {
    expectTypeOf<Athlete>().toHaveProperty('id')
    expectTypeOf<Athlete>().toHaveProperty('event_id')
    expectTypeOf<Athlete>().toHaveProperty('bib_number')
    expectTypeOf<Athlete>().toHaveProperty('name')
    expectTypeOf<Athlete>().toHaveProperty('distance_id')
    expectTypeOf<Athlete>().toHaveProperty('gender')
    expectTypeOf<Athlete>().toHaveProperty('age_group')
  })
})

describe('SubgroupPrizeOverride type', () => {
  it('has required fields', () => {
    expectTypeOf<SubgroupPrizeOverride>().toHaveProperty('id')
    expectTypeOf<SubgroupPrizeOverride>().toHaveProperty('distance_id')
    expectTypeOf<SubgroupPrizeOverride>().toHaveProperty('gender')
    expectTypeOf<SubgroupPrizeOverride>().toHaveProperty('age_group')
    expectTypeOf<SubgroupPrizeOverride>().toHaveProperty('top_n')
  })
})

describe('Event type', () => {
  it('has overall_lockout', () => {
    expectTypeOf<Event>().toHaveProperty('overall_lockout')
  })
})
