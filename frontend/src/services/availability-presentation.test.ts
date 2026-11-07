import { describe, expect, it } from 'vitest'
import type { ChatResult } from './chat-response'
import { cabinOptions, getPageNumbers, groupSummaries, sortSummaries } from './availability-presentation'

function row(program: string, points: number, cabin: ChatResult['cabin'] = 'economy'): ChatResult {
  return { program, points_cost: points, cabin, airline: 'AA', departure_date: '2026-12-01',
    origin: 'JFK', destination: 'SEA', cash_fees_usd: null, cents_per_point: null, seats_available: null }
}

describe('returned award grouping', () => {
  it('combines all cabins for one date, program and route without losing each cabin offer', () => {
    const offers = cabinOptions.map(({ key }, index) => row('One program', 1000 * (index + 1), key))
    const groups = groupSummaries(offers)
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({ departure_date: '2026-12-01', program: 'One program', origin: 'JFK', destination: 'SEA' })
    for (const offer of offers) expect(groups[0].cabins[offer.cabin]).toBe(offer)
    expect(groups[0].key).toBe(JSON.stringify(['2026-12-01', 'One program', 'JFK', 'SEA']))
    expect(groupSummaries([])).toEqual([])
  })

  it('keeps dates, programs and both route endpoints distinct in first-seen order', () => {
    const original = row('Original', 1000)
    const offers = [original, { ...original, departure_date: '2026-12-02' },
      { ...original, program: 'Another' }, { ...original, origin: 'EWR' },
      { ...original, destination: 'SFO' }, { ...original, cabin: 'business' as const }]
    const groups = groupSummaries(offers)
    expect(groups).toHaveLength(5)
    expect(new Set(groups.map((group) => group.key)).size).toBe(5)
    expect(groups.map((group) => group.cabins.economy)).toEqual(offers.slice(0, 5))
    expect(groups[0].cabins.business).toBe(offers[5])
  })

  it('selects the lowest whole offer per cabin, breaks point ties by known fees, and keeps exact ties stable', () => {
    const higher = { ...row('Program', 2000), cash_fees_usd: 0, seats_available: 9 }
    const unknown = { ...row('Program', 1000), seats_available: 2 }
    const paid = { ...unknown, cash_fees_usd: 5.6, seats_available: 3 }
    const free = { ...paid, cash_fees_usd: 0, seats_available: 1, cents_per_point: 2 }
    const tied = { ...free, seats_available: 6 }
    const business = row('Program', 5000, 'business')
    const offers = [higher, unknown, paid, free, tied, business]
    const grouped = groupSummaries(offers)[0]
    expect(grouped.cabins.economy).toBe(free)
    expect(grouped.cabins.business).toBe(business)
    expect(offers[0]).toBe(higher)
    expect(groupSummaries([unknown, { ...unknown, seats_available: 4 }])[0].cabins.economy).toBe(unknown)
    expect(groupSummaries([paid, unknown, higher])[0].cabins.economy).toBe(paid)
  })

  it('retains unique IDs from every offer, including unselected duplicates, for trip expansion', () => {
    const original = row('Program', 1000)
    const offers = [
      { ...original, availability_id: 'first' },
      { ...original, availability_id: 'cheaper', points_cost: 500 },
      { ...original, availability_id: 'first', cabin: 'business' as const },
      { ...original, availability_id: 'higher', points_cost: 2000 },
      { ...original, availability_id: null }, { ...original, availability_id: '' }, original,
    ]
    expect(groupSummaries(offers)[0].availabilityIds).toEqual(['first', 'cheaper', 'higher'])
  })
})

describe('returned award sorting', () => {
  it('preserves known zero and sorts unreported cabin prices last in both directions', () => {
    const rows = groupSummaries([row('Business only', 1, 'business'), row('Low', 1000), row('Zero', 0),
      row('High', 4000), row('Low', 8000), row('Low', 3000, 'business')])
    expect(sortSummaries(rows, { field: 'points', cabin: 'economy', direction: 'asc' }).map((item) => item.program))
      .toEqual(['Zero', 'Low', 'High', 'Business only'])
    expect(sortSummaries(rows, { field: 'points', cabin: 'economy', direction: 'desc' }).map((item) => item.program))
      .toEqual(['High', 'Low', 'Zero', 'Business only'])
    expect(sortSummaries(rows, { field: 'points', cabin: 'business', direction: 'asc' }).map((item) => item.program))
      .toEqual(['Business only', 'Low', 'Zero', 'High'])
    expect(rows[0].program).toBe('Business only')
  })

  it('sorts actual program names and dates while retaining tied groups stably', () => {
    const rows = groupSummaries([row('Z program', 1), row('A program', 1), { ...row('A program', 1), origin: 'EWR' }])
    const byProgram = sortSummaries(rows, { field: 'program', direction: 'asc' })
    expect(byProgram).toEqual([rows[1], rows[2], rows[0]])
    expect(byProgram[0]).toBe(rows[1])
    expect(byProgram[1]).toBe(rows[2])
    const later = { ...rows[0], departure_date: '2026-12-02' }
    expect(sortSummaries([rows[0], later], { field: 'date', direction: 'desc' })).toEqual([later, rows[0]])
  })
})

describe('bounded page navigation', () => {
  it('shows boundaries and neighbors without expanding a large result set into every page', () => {
    expect(getPageNumbers(50, 100)).toEqual([1, 'ellipsis', 49, 50, 51, 'ellipsis', 100])
    expect(getPageNumbers(1, 100)).toEqual([1, 2, 'ellipsis', 100])
    expect(getPageNumbers(100, 100)).toEqual([1, 'ellipsis', 99, 100])
  })
  it('fills a single-page gap and handles empty, single-page, and out-of-range requests', () => {
    expect(getPageNumbers(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(getPageNumbers(1, 0)).toEqual([])
    expect(getPageNumbers(8, 1)).toEqual([1])
    expect(getPageNumbers(-2, 10)).toEqual([1, 2, 'ellipsis', 10])
    expect(getPageNumbers(99, 10)).toEqual([1, 'ellipsis', 9, 10])
  })
})
