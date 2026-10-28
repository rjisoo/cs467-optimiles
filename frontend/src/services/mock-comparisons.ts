import type { Cabin, Trip } from './availability-api'
import { tripsFixtures } from './availability-fixtures'

export type MockComparison = {
  availability_id: string
  trip_id: string
  cabin: Cabin | null
  points: number | null
  taxes_minor: number | null
  taxes_currency: string | null
  cash_price_minor: number | null
  cash_currency: string | null
}

export type MockHighlight = {
  kind: 'value' | 'points'
  label: string
  metric: number | null
  entries: MockComparison[]
}

// Assumed USD fares for one passenger, independent of award points or program.
// Keys identify cabin and every segment's route, flight and local timestamps.
const cashFares: Record<string, number> = {
  'economy|JFK|SEA|UA123|2026-10-31T06:00:00|2026-10-31T09:10:00': 26900,
  'economy|JFK|SEA|UA124|2026-10-31T07:00:00|2026-10-31T10:10:00': 27900,
  'economy|JFK|SEA|UA125|2026-10-31T08:00:00|2026-10-31T11:10:00': 29900,
  'economy|JFK|SEA|UA126|2026-10-31T09:00:00|2026-10-31T12:10:00': 31900,
  'economy|JFK|SEA|UA127|2026-10-31T10:00:00|2026-10-31T13:10:00': 33900,
  'economy|JFK|SEA|UA128|2026-10-31T11:00:00|2026-10-31T14:10:00': 40560,
  'economy|JFK|SEA|UA129|2026-10-31T12:00:00|2026-10-31T15:10:00': 42560,
  'economy|JFK|SEA|UA130|2026-10-31T13:00:00|2026-10-31T16:10:00': 34900,
  'economy|JFK|SEA|UA131|2026-10-31T14:00:00|2026-10-31T17:10:00': 32900,
  'economy|JFK|SEA|UA132|2026-10-31T15:00:00|2026-10-31T18:10:00': 36900,
  'economy|JFK|SEA|UA133|2026-10-31T16:00:00|2026-10-31T19:10:00': 37900,
  'economy|JFK|SEA|UA134|2026-10-31T17:00:00|2026-10-31T20:10:00': 38900,
  'premium|JFK|SEA|UA123|2026-10-31T09:00:00|2026-10-31T12:10:00': 69900,
  'business|JFK|SEA|UA123|2026-10-31T09:00:00|2026-10-31T12:10:00': 139900,
  'economy|JFK|SEA|UA123|2026-10-31T09:00:00|2026-10-31T12:10:00': 31900,
  'first|JFK|SEA|UA123|2026-10-31T09:00:00|2026-10-31T12:10:00': 189900,
  'economy|JFK|SEA|UA123|2026-11-01T09:00:00|2026-11-01T12:10:00': 28900,
  'business|JFK|SEA|UA123|2026-11-01T09:00:00|2026-11-01T12:10:00': 129900,
  'economy|JFK|SEA|UA123|2026-11-02T09:00:00|2026-11-02T12:10:00': 40560,
  'economy|JFK|SEA|UA123|2026-11-03T09:00:00|2026-11-03T12:10:00': 35900,
  'economy|JFK|SEA|UA123|2026-11-04T09:00:00|2026-11-04T12:10:00': 48560,
}

function itineraryKey(trip: Trip): string | null {
  if (trip.cabin === null || trip.segments.length === 0) {
    return null
  }

  const segments = trip.segments.flatMap((segment) => [
    segment.origin_airport,
    segment.destination_airport,
    segment.flight_number,
    segment.departs_at_local,
    segment.arrives_at_local,
  ])
  if (segments.some((value) => value === null)) {
    return null
  }

  return [trip.cabin, ...segments].join('|')
}

export function createMockComparison(trip: Trip): MockComparison {
  const key = itineraryKey(trip)
  const cashPrice = key === null ? null : cashFares[key] ?? null

  return {
    availability_id: trip.availability_id,
    trip_id: trip.trip_id,
    cabin: trip.cabin,
    points: trip.points,
    taxes_minor: trip.taxes_minor,
    taxes_currency: trip.taxes_currency,
    cash_price_minor: cashPrice,
    cash_currency: cashPrice === null ? null : 'USD',
  }
}

// Extra display-only snapshots; these are separate from the API response.
export const mockComparisons: MockComparison[] = Object.values(tripsFixtures)
  .flatMap((response) => response.trips.map(createMockComparison))

export function calculateMockCpp(sample: MockComparison): number | null {
  if (!sample.availability_id || !sample.trip_id || sample.cabin === null) {
    return null
  }
  if (sample.cash_currency !== 'USD' || sample.taxes_currency !== 'USD') {
    return null
  }

  const { points, cash_price_minor, taxes_minor } = sample
  if (points === null || cash_price_minor === null || taxes_minor === null) {
    return null
  }
  if (!Number.isFinite(points) || !Number.isFinite(cash_price_minor) || !Number.isFinite(taxes_minor)) {
    return null
  }
  if (points <= 0 || cash_price_minor < 0 || taxes_minor < 0) {
    return null
  }

  return (cash_price_minor - taxes_minor) / points
}

function compareIdentity(first: MockComparison, second: MockComparison): number {
  return first.availability_id.localeCompare(second.availability_id)
    || first.trip_id.localeCompare(second.trip_id)
}

export function representativeComparison(
  samples: MockComparison[],
  cabin: Cabin,
): MockComparison | undefined {
  const candidates = samples.filter((sample) => {
    return sample.cabin === cabin && sample.points !== null && sample.points !== 0
  })

  return candidates.sort((first, second) => {
    const pointsDifference = first.points! - second.points!
    if (pointsDifference !== 0) {
      return pointsDifference
    }

    const firstCpp = calculateMockCpp(first)
    const secondCpp = calculateMockCpp(second)
    if (firstCpp !== secondCpp) {
      if (firstCpp === null) {
        return 1
      }
      if (secondCpp === null) {
        return -1
      }
      return secondCpp - firstCpp
    }

    return first.trip_id.localeCompare(second.trip_id)
      || compareIdentity(first, second)
  })[0]
}

function highlight(
  kind: MockHighlight['kind'],
  label: string,
  samples: MockComparison[],
  getMetric: (sample: MockComparison) => number | null,
): MockHighlight {
  let metric: number | null = null
  const entries: MockComparison[] = []

  for (const sample of [...samples].sort(compareIdentity)) {
    const value = getMetric(sample)
    if (value === null || !Number.isFinite(value)) {
      continue
    }

    const improvesMetric = metric === null || (kind === 'value' ? value > metric : value < metric)
    if (improvesMetric) {
      metric = value
      entries.length = 0
    }
    if (value === metric) {
      entries.push(sample)
    }
  }

  return { kind, label, metric, entries }
}

export function getMockHighlights(samples: MockComparison[]): MockHighlight[] {
  const visible = samples.filter((sample) => sample.points !== null && sample.points > 0)
  return [
    highlight('value', 'Best value', visible, calculateMockCpp),
    highlight('points', 'Lowest points', visible, (sample) => sample.points),
  ]
}
