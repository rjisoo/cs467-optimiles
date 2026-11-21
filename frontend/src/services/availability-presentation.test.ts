import { describe, expect, it } from 'vitest'
import type { ChatResult } from './chat-response'
import { cabinOptions, compareDisplayedValues, compareLoadedTrips, getPageNumbers, getSummaryValue, getTripValue, groupSummaries,
  sortSummaries, tripValueKey, verifiedTripFees } from './availability-presentation'
import type { FlightTrip } from './trip-details'

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

const valuedResult: ChatResult = { ...row('United MileagePlus', 15000), availability_id: 'record-1', source: 'united',
  search_passengers: 2, cash_fare_usd: 245.6 }
const loadedTrip: FlightTrip = {
  trip_id: 'trip-1', availability_id: 'record-1', source: 'united', cabin: 'economy', points: 15000,
  cash_fees_usd: 5.6, taxes_minor: 560, taxes_currency: 'USD', reported_seats: 2, is_mixed_cabin: false,
  departs_at_local: '2026-12-01T06:00:00', arrives_at_local: '2026-12-01T09:10:00', duration_minutes: 370,
  stops: 0, carriers: ['UA'], carrier_names: ['United Airlines'], provider_updated_at: null, flight_numbers: ['UA123'],
  segments: [{ flight_number: 'UA123', carrier: 'UA', carrier_name: 'United Airlines', origin_airport: 'JFK',
    destination_airport: 'SEA', departs_at_local: null, arrives_at_local: null }],
}
const another = (overrides: Partial<FlightTrip> = {}): FlightTrip => ({ ...loadedTrip, trip_id: 'trip-2', points: 16000, ...overrides })

describe('estimated loaded-trip redemption value', () => {
  it('uses exact-trip fees rather than summary minima, retains known zero, and rounds decimal ties half up', () => {
    expect(getTripValue({ ...valuedResult, cash_fees_usd: 0 }, loadedTrip)).toMatchObject({ cpp: 1.6, fees: 5.6, rating: 'good' })
    expect(getTripValue({ ...valuedResult, cash_fare_usd: 1200 }, { ...loadedTrip, points: 60000,
      taxes_minor: 60000, cash_fees_usd: 600 })).toMatchObject({ cpp: 1, rating: 'fair' })
    expect(getTripValue({ ...valuedResult, cash_fare_usd: 1.005 }, loadedTrip)).toBeNull()
    expect(getTripValue({ ...valuedResult, cash_fare_usd: 100.5 }, { ...loadedTrip, points: 10000,
      taxes_minor: 0, cash_fees_usd: 0 })).toMatchObject({ cpp: 1.01, fees: 0, rating: 'fair' })
    expect(getTripValue({ ...valuedResult, cash_fare_usd: 5 }, { ...loadedTrip, points: 40 })).toMatchObject({ cpp: -1.5, rating: 'bad' })
    expect(getTripValue(valuedResult, { ...loadedTrip, cash_fees_usd: null }))
      .toMatchObject({ cpp: 1.6, fees: 5.6, feeBasis: 'trip' })
  })

  it.each([
    { taxes_currency: null }, { taxes_currency: '' }, { taxes_currency: 'CAD' },
    { taxes_minor: null }, { taxes_minor: 560.5 }, { taxes_minor: Number.MAX_SAFE_INTEGER + 1 },
    { cash_fees_usd: 0 }, { source: 'qatar' }, { source: 'turkish' }, { source: 'singapore' },
  ])('shows a before-fees estimate for unknown or inconsistent fees: %j', (overrides) => {
    const trip = { ...loadedTrip, ...overrides }
    expect(verifiedTripFees(trip)).toBeNull()
    expect(getTripValue({ ...valuedResult, source: trip.source }, trip))
      .toMatchObject({ cpp: 1.64, fees: null, feeBasis: 'before_fees', rating: 'good' })
  })

  it.each([
    { points: 0 }, { points: 1.5 }, { points: Number.MAX_SAFE_INTEGER + 1 }, { is_mixed_cabin: true },
    { source: 'delta' }, { availability_id: 'another' }, { cabin: 'business' },
    { departs_at_local: '2026-12-02T06:00:00' }, { departs_at_local: '2026-12-01T99:00:00' },
    { segments: [{ ...loadedTrip.segments[0], destination_airport: 'SFO' }] },
  ])('does not attach a fare to incompatible trip evidence: %j', (overrides) => {
    expect(getTripValue(valuedResult, { ...loadedTrip, ...overrides })).toBeNull()
  })

  it('does not infer a source or fare and accepts normalized explicit USD currency', () => {
    expect(getTripValue({ ...valuedResult, source: null }, loadedTrip)).toBeNull()
    expect(getTripValue({ ...valuedResult, cash_fare_usd: null }, loadedTrip)).toBeNull()
    expect(getTripValue(valuedResult, { ...loadedTrip, taxes_currency: ' usd ' })?.cpp).toBe(1.6)
  })

  it('inherits only a matching summary currency and keeps the trip fee amount', () => {
    const parent = { ...valuedResult, taxes_currency: 'USD', cash_fees_usd: 100 }
    const trip = { ...loadedTrip, taxes_currency: null, cash_fees_usd: null }
    expect(getTripValue(parent, trip)).toMatchObject({ cpp: 1.6, fees: 5.6, feeBasis: 'summary_currency' })
    expect(getTripValue(parent, { ...trip, taxes_minor: 0 }))
      .toMatchObject({ cpp: 1.64, fees: 0, feeBasis: 'summary_currency' })
    expect(getTripValue(parent, { ...trip, availability_id: 'different' })).toBeNull()
    for (const overrides of [{ taxes_currency: 'CAD' }, { taxes_minor: null }, { taxes_minor: 560.5 },
      { cash_fees_usd: 0 }, { source: 'qatar' }]) {
      expect(getTripValue({ ...parent, source: overrides.source ?? trip.source }, { ...trip, ...overrides }))
        .toMatchObject({ fees: null, feeBasis: 'before_fees' })
    }
    expect(getTripValue({ ...parent, taxes_currency: 'CAD' }, trip))
      .toMatchObject({ fees: null, feeBasis: 'before_fees' })
  })

  it('displays estimates with unknown cabin evidence', () => {
    expect(getTripValue(valuedResult, { ...loadedTrip, is_mixed_cabin: null }))
      .toMatchObject({ cpp: 1.6, cabinVerified: false })
  })
})

describe('loaded comparison scope', () => {
  it('includes displayed summary estimates before loading and lets a higher incomplete trip win later', () => {
    const offers = [valuedResult, { ...valuedResult, availability_id: 'hidden', points_cost: 20000, cash_fare_usd: 1000 }]
    let comparison = compareLoadedTrips(offers, [])
    expect(compareDisplayedValues(offers, comparison)).toEqual({ bestValue: 1.64,
      bestKeys: new Set(), bestSummaries: new Set([valuedResult]) })
    const winner = another({ points: 10000, taxes_minor: null, reported_seats: null, is_mixed_cabin: null })
    comparison = compareLoadedTrips(offers, [loadedTrip, winner])
    expect(compareDisplayedValues(offers, comparison)).toEqual({ bestValue: 2.46,
      bestKeys: new Set([tripValueKey(winner)]), bestSummaries: new Set() })
  })

  it('shares summary and trip ties using the rounded displayed CPP, including zero', () => {
    const tied = another({ points: 15001 })
    const comparison = compareLoadedTrips([valuedResult], [loadedTrip, tied])
    expect(compareDisplayedValues([valuedResult], comparison)).toEqual({ bestValue: 1.6,
      bestKeys: new Set([tripValueKey(loadedTrip), tripValueKey(tied)]), bestSummaries: new Set([valuedResult]) })
    const zero = { ...loadedTrip, taxes_minor: 24560, cash_fees_usd: 245.6 }
    expect(compareDisplayedValues([valuedResult], compareLoadedTrips([valuedResult], [zero])).bestValue).toBe(0)
    const unavailable = { ...valuedResult, cash_fare_usd: null }
    expect(compareDisplayedValues([unavailable], compareLoadedTrips([unavailable], [loadedTrip])).bestValue).toBeNull()
  })

  it('keeps all original offers, while grouping different sources or passenger counts separately', () => {
    const offers = [valuedResult, { ...valuedResult, points_cost: 16000 }]
    expect(groupSummaries(offers)[0].offers).toEqual(offers)
    expect(groupSummaries([...offers, { ...valuedResult, search_passengers: 3 }, { ...valuedResult, source: 'delta' }])).toHaveLength(3)
  })

  it('deduplicates identical trips, includes all best ties and updates winners when later trips load', () => {
    const tied = another({ points: 15000 })
    let comparison = compareLoadedTrips([valuedResult, { ...valuedResult }], [loadedTrip, loadedTrip])
    expect(comparison.entries).toHaveLength(1)
    expect(comparison.bestKeys).toEqual(new Set([tripValueKey(loadedTrip)]))
    comparison = compareLoadedTrips([valuedResult], [loadedTrip, tied, another({ trip_id: 'third' })])
    expect(comparison.bestKeys).toEqual(new Set([tripValueKey(loadedTrip), tripValueKey(tied)]))
    const better = another({ trip_id: 'better', points: 12000 })
    expect(compareLoadedTrips([valuedResult], [loadedTrip, tied, better]).bestKeys).toEqual(new Set([tripValueKey(better)]))
    expect(getSummaryValue(valuedResult, comparison)?.cpp).toBe(1.6)
  })

  it('ranks displayed estimates despite missing fees, seats, cabin confirmation or passenger context', () => {
    for (const overrides of [{ taxes_minor: null }, { reported_seats: 1 }, { reported_seats: null },
      { reported_seats: 2.5 }, { is_mixed_cabin: null }]) {
      const winner = another({ points: 12000, ...overrides })
      const comparison = compareLoadedTrips([valuedResult], [loadedTrip, winner])
      expect(comparison.bestKeys).toEqual(new Set([tripValueKey(winner)]))
      expect(comparison.groups[0].entries).toHaveLength(2)
    }
    expect(compareLoadedTrips([{ ...valuedResult, search_passengers: undefined }], [loadedTrip, another()]).bestKeys.size).toBe(1)
    expect(compareLoadedTrips([{ ...valuedResult, cash_fare_usd: 1 }], [loadedTrip, another()]).bestKeys)
      .toEqual(new Set([tripValueKey(loadedTrip), tripValueKey(another())]))
    expect(compareLoadedTrips([valuedResult], [another({ is_mixed_cabin: true })]).bestKeys.size).toBe(0)
  })

  it('invalidates conflicting duplicate trips and parent quotations until replaced', () => {
    const conflict = { ...loadedTrip, taxes_minor: 1000, cash_fees_usd: 10 }
    let comparison = compareLoadedTrips([valuedResult], [loadedTrip, conflict, another()])
    expect(comparison.entries[0].value).toBeNull()
    expect(comparison.bestKeys).toEqual(new Set([tripValueKey(another())]))
    expect(getSummaryValue(valuedResult, comparison)).toMatchObject({ feeBasis: 'before_fees', pointsBasis: 'summary' })
    comparison = compareLoadedTrips([valuedResult, { ...valuedResult, cash_fare_usd: 400 }], [loadedTrip, another()])
    expect(comparison.entries.every((entry) => entry.value === null)).toBe(true)
    expect(compareLoadedTrips([valuedResult], [conflict, another()]).bestKeys.size).toBe(1)
  })

  it('rejects conflicting booking sources and preserves separate genuine program offers', () => {
    const conflictingSource = { ...valuedResult, source: 'delta' }
    expect(compareLoadedTrips([valuedResult, conflictingSource], [loadedTrip, another()])
      .entries.every((entry) => entry.value === null)).toBe(true)
    const separateSource = { ...conflictingSource, availability_id: 'delta-record' }
    const separateTrip = another({ source: 'delta', availability_id: 'delta-record' })
    expect(compareLoadedTrips([valuedResult, separateSource], [loadedTrip, separateTrip]).entries).toHaveLength(2)
    expect(compareLoadedTrips([valuedResult, separateSource], [loadedTrip, separateTrip]).bestKeys.size).toBe(1)
    expect(compareLoadedTrips([valuedResult, { ...separateSource, cash_fare_usd: 400 }],
      [loadedTrip, separateTrip]).bestKeys).toEqual(new Set([tripValueKey(separateTrip)]))
  })

  it.each([{ departure_date: '2026-12-02' }, { program: 'Another label', cash_fare_usd: 400 }])(
    'does not erase conflicting parent evidence when a filter hides it: %j', (overrides) => {
      const conflict = { ...valuedResult, ...overrides }
      const otherResult = { ...valuedResult, availability_id: 'another-record', points_cost: 16000 }
      const otherTrip = another({ availability_id: 'another-record' })
      const allResults = [valuedResult, conflict, otherResult]
      const comparison = compareLoadedTrips([valuedResult, otherResult], [loadedTrip, otherTrip], allResults)
      expect(comparison.entries.find((entry) => entry.key === tripValueKey(loadedTrip))?.value).toBeNull()
      expect(comparison.entries.find((entry) => entry.key === tripValueKey(otherTrip))?.value?.cpp).toBe(1.5)
      expect(comparison.bestKeys).toEqual(new Set([tripValueKey(otherTrip)]))
      expect(comparison.groups[0].lowestKeys).toEqual(new Set([tripValueKey(otherTrip)]))
      expect(compareLoadedTrips([otherResult], [loadedTrip, otherTrip], allResults).entries).toHaveLength(1)
      expect(compareLoadedTrips([valuedResult, otherResult], [loadedTrip, otherTrip]).bestKeys.size).toBe(1)
    },
  )

  it('does not combine dates, routes, cabins or party sizes; filters use only supplied offers', () => {
    for (const overrides of [{ departure_date: '2026-12-02' }, { origin: 'EWR' }, { cabin: 'business' as const }, { search_passengers: 3 }]) {
      const second = { ...valuedResult, ...overrides, availability_id: 'second' }
      const trip = another({ availability_id: 'second', cabin: second.cabin,
        departs_at_local: `${second.departure_date}T06:00:00`, reported_seats: 4,
        segments: [{ ...loadedTrip.segments[0], origin_airport: second.origin }] })
      const comparison = compareLoadedTrips([valuedResult, second], [loadedTrip, trip])
      expect(comparison.groups).toHaveLength(2)
      expect(comparison.bestKeys.size).toBe(2)
      expect(compareLoadedTrips([valuedResult], [loadedTrip, trip]).entries).toHaveLength(1)
    }
  })

  it('uses a summary estimate before load or when trip fees differ', () => {
    expect(getSummaryValue(valuedResult, compareLoadedTrips([valuedResult], [])))
      .toMatchObject({ cpp: 1.64, fees: null, feeBasis: 'before_fees', pointsBasis: 'summary' })
    const comparison = compareLoadedTrips([valuedResult], [loadedTrip,
      another({ points: 15000, taxes_minor: 1560, cash_fees_usd: 15.6 })])
    expect(getSummaryValue(valuedResult, comparison)).toMatchObject({ cpp: 1.64, fees: null, pointsBasis: 'summary' })
    expect(getSummaryValue({ ...valuedResult, points_cost: 14000 }, comparison)).toMatchObject({ cpp: 1.75, pointsBasis: 'summary' })
    expect(getSummaryValue({ ...valuedResult, cash_fare_usd: null }, comparison)).toBeNull()
    expect(getSummaryValue({ ...valuedResult, points_cost: 0 }, comparison)).toBeNull()
  })

  it('retains only legitimate minimum-point keys, including fee-unknown ties but excluding identity conflicts', () => {
    const tied = another({ points: 15000, cash_fees_usd: null })
    const mismatch = another({ trip_id: 'wrong-route', points: 15000,
      segments: [{ ...loadedTrip.segments[0], destination_airport: 'SFO' }] })
    const conflict = another({ trip_id: 'conflict', points: 15000 })
    const changed = { ...conflict, taxes_minor: 1000, cash_fees_usd: 10 }
    const group = compareLoadedTrips([valuedResult], [loadedTrip, loadedTrip, tied, mismatch, conflict, changed]).groups[0]
    expect(group.entries).toHaveLength(4)
    expect(group.lowestPoints).toBe(15000)
    expect(group.lowestKeys).toEqual(new Set([tripValueKey(loadedTrip), tripValueKey(tied)]))
    const lower = another({ trip_id: 'lower', points: 10000 })
    expect(compareLoadedTrips([valuedResult], [loadedTrip, lower]).groups[0].lowestKeys).toEqual(new Set([tripValueKey(lower)]))
    expect(compareLoadedTrips([valuedResult], [conflict, changed]).groups[0].lowestKeys.size).toBe(0)
  })
})
