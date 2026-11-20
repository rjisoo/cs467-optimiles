import type { ChatCabin, ChatResult, ValueRating } from './chat-response'
import type { FlightTrip } from './trip-details'

export const cabinOptions: { key: ChatCabin; label: string }[] = [
  { key: 'economy', label: 'Economy' },
  { key: 'premium_economy', label: 'Premium economy' },
  { key: 'business', label: 'Business' },
  { key: 'first', label: 'First' },
]

export type AvailabilitySummary = Pick<ChatResult, 'departure_date' | 'program' | 'origin' | 'destination'> & {
  key: string
  cabins: Partial<Record<ChatCabin, ChatResult>>
  availabilityIds: string[]
  offers: ChatResult[]
}

export function groupSummaries(results: ChatResult[]): AvailabilitySummary[] {
  const groups = new Map<string, AvailabilitySummary>()
  for (const result of results) {
    const { departure_date, program, origin, destination } = result
    const identity: (string | number | null)[] = [departure_date, program, origin, destination]
    if (result.source !== undefined || result.search_passengers !== undefined) identity.push(result.source ?? null, result.search_passengers ?? null)
    const key = JSON.stringify(identity)
    let group = groups.get(key)
    if (!group) {
      group = { key, departure_date, program, origin, destination, cabins: {}, availabilityIds: [], offers: [] }
      groups.set(key, group)
    }
    group.offers.push(result)
    const current = group.cabins[result.cabin]
    if (!current || result.points_cost < current.points_cost
      || (result.points_cost === current.points_cost
        && (result.cash_fees_usd ?? Infinity) < (current.cash_fees_usd ?? Infinity))) {
      group.cabins[result.cabin] = result
    }
    const id = result.availability_id
    if (id?.trim() && !group.availabilityIds.includes(id)) group.availabilityIds.push(id)
  }
  return [...groups.values()]
}

export type SummarySort = {
  field: 'date' | 'program' | 'points'
  cabin?: ChatCabin
  direction: 'asc' | 'desc'
}

function sortValue(row: AvailabilitySummary, sort: SummarySort): string | number | null {
  if (sort.field === 'date') return row.departure_date
  if (sort.field === 'program') return row.program
  return sort.cabin ? row.cabins[sort.cabin]?.points_cost ?? null : null
}

export function sortSummaries(rows: AvailabilitySummary[], sort: SummarySort) {
  return [...rows].sort((first, second) => {
    const firstValue = sortValue(first, sort)
    const secondValue = sortValue(second, sort)
    if (firstValue === null && secondValue !== null) return 1
    if (secondValue === null && firstValue !== null) return -1
    let difference = 0
    if (firstValue !== null && secondValue !== null) {
      difference = typeof firstValue === 'string' && typeof secondValue === 'string'
        ? firstValue.localeCompare(secondValue)
        : Number(firstValue) - Number(secondValue)
    }
    return difference * (sort.direction === 'asc' ? 1 : -1)
      || first.departure_date.localeCompare(second.departure_date)
  })
}

export function getPageNumbers(page: number, totalPages: number): (number | 'ellipsis')[] {
  const total = Number.isFinite(totalPages) ? Math.max(0, Math.floor(totalPages)) : 0
  if (!total) {
    return []
  }
  const current = Number.isFinite(page) ? Math.min(total, Math.max(1, Math.floor(page))) : 1
  const pages = [...new Set([1, current - 1, current, current + 1, total])]
    .filter((number) => number >= 1 && number <= total)
    .sort((first, second) => first - second)
  const result: (number | 'ellipsis')[] = []
  for (const [index, number] of pages.entries()) {
    const previous = pages[index - 1]
    if (index && number - previous === 2) {
      result.push(previous + 1)
    } else if (index && number - previous > 2) {
      result.push('ellipsis')
    }
    result.push(number)
  }
  return result
}

export type TripValue = {
  cpp: number; cashFare: number; fees: number; points: number; rating: ValueRating; cabin: ChatCabin
}
export type ValueEntry = {
  key: string; trip: FlightTrip; result: ChatResult; value: TripValue | null; groupKey: string; eligible: boolean
}
export type ValueGroup = {
  key: string; origin: string; destination: string; departure_date: string; cabin: ChatCabin; passengers: number | null
  entries: ValueEntry[]; bestKeys: Set<string>; bestValue: number | null; lowestPoints: number | null; lowestKeys: Set<string>
}
export type ValueComparison = { entries: ValueEntry[]; bestKeys: Set<string>; groups: ValueGroup[] }

// Convert decimal USD text to cents without rounding fractional cents or using float arithmetic.
function moneyCents(value: number | null | undefined): bigint | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null
  const match = String(value).match(/^(\d+)(?:\.(\d{1,2}))?$/)
  if (!match) return null
  const cents = BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0'))
  return cents <= BigInt(Number.MAX_SAFE_INTEGER) ? cents : null
}

function positivePoints(value: number | null): value is number {
  return value !== null && Number.isSafeInteger(value) && value > 0
}

export function verifiedTripFees(trip: FlightTrip): number | null {
  if (['qatar', 'turkish', 'singapore'].includes(trip.source)
    || trip.taxes_currency?.trim().toUpperCase() !== 'USD'
    || trip.taxes_minor === null || !Number.isSafeInteger(trip.taxes_minor) || trip.taxes_minor < 0
    || moneyCents(trip.cash_fees_usd) !== BigInt(trip.taxes_minor)) return null
  return trip.taxes_minor / 100
}

function matchesTrip(result: ChatResult, trip: FlightTrip): boolean {
  return !!result.source && result.source === trip.source && !!result.availability_id
    && result.availability_id === trip.availability_id && result.cabin === trip.cabin
    && /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?$/.test(trip.departs_at_local)
    && result.departure_date === trip.departs_at_local.slice(0, 10)
    && (!trip.segments[0]?.origin_airport || trip.segments[0].origin_airport === result.origin)
    && (!trip.segments.at(-1)?.destination_airport || trip.segments.at(-1)?.destination_airport === result.destination)
}

export function getTripValue(result: ChatResult, trip: FlightTrip): TripValue | null {
  const fare = moneyCents(result.cash_fare_usd)
  const fees = verifiedTripFees(trip)
  if (!matchesTrip(result, trip) || trip.is_mixed_cabin !== false || !positivePoints(trip.points)
    || fare === null || fare <= 0n || fees === null) return null
  const numerator = (fare - BigInt(trip.taxes_minor!)) * 100n
  const points = BigInt(trip.points)
  const magnitude = numerator < 0n ? -numerator : numerator
  const rounded = (magnitude * 2n + points) / (points * 2n)
  if (rounded > BigInt(Number.MAX_SAFE_INTEGER)) return null
  const cpp = Number(numerator < 0n ? -rounded : rounded) / 100
  const rating: ValueRating = cpp >= 2.5 ? 'exceptional' : cpp >= 1.7 ? 'great'
    : cpp >= 1.3 ? 'good' : cpp >= 1 ? 'fair' : 'bad'
  return { cpp, cashFare: result.cash_fare_usd!, fees, points: trip.points, rating, cabin: result.cabin }
}

export function tripValueKey(trip: FlightTrip): string {
  return JSON.stringify([trip.source, trip.availability_id, trip.trip_id, trip.cabin])
}

function parentIdentity(result: ChatResult): string {
  return JSON.stringify([result.source, result.availability_id, result.origin, result.destination,
    result.departure_date, result.cabin, result.search_passengers, result.cash_fare_usd, result.points_cost])
}

function tripEvidence(trip: FlightTrip): string {
  return JSON.stringify([trip.points, trip.cash_fees_usd, trip.taxes_minor, trip.taxes_currency,
    trip.reported_seats, trip.is_mixed_cabin, trip.departs_at_local, trip.arrives_at_local,
    trip.segments.map((segment) => [segment.origin_airport, segment.destination_airport,
      segment.departs_at_local, segment.arrives_at_local])])
}

export function compareLoadedTrips(results: ChatResult[], trips: FlightTrip[], parentResults = results): ValueComparison {
  const unique = new Map<string, FlightTrip>()
  const conflicts = new Set<string>()
  for (const trip of trips) {
    const key = tripValueKey(trip)
    const previous = unique.get(key)
    if (previous && tripEvidence(previous) !== tripEvidence(trip)) conflicts.add(key)
    else unique.set(key, trip)
  }
  const groups = new Map<string, ValueGroup>()
  const entries: ValueEntry[] = []
  for (const [key, trip] of unique) {
    const parents = results.filter((row) => row.availability_id === trip.availability_id && row.cabin === trip.cabin)
    const result = parents[0]
    if (!result) continue
    // Filters change comparison coverage, not the integrity of the captured offer.
    const allParents = parentResults.filter((row) => row.availability_id === trip.availability_id && row.cabin === trip.cabin)
    const conflicting = conflicts.has(key)
      || [...parents, ...allParents].some((row) => parentIdentity(row) !== parentIdentity(result))
    const value = conflicting ? null : getTripValue(result, trip)
    const passengers = result.search_passengers != null && Number.isSafeInteger(result.search_passengers)
      && result.search_passengers >= 1 && result.search_passengers <= 9 ? result.search_passengers : null
    const groupKey = JSON.stringify([result.origin, result.destination, result.departure_date, result.cabin, passengers])
    const eligible = !!value && value.cpp > 0 && passengers !== null && trip.is_mixed_cabin === false
      && trip.reported_seats !== null && Number.isSafeInteger(trip.reported_seats) && trip.reported_seats >= passengers
    const entry: ValueEntry = { key, trip, result, value, groupKey, eligible }
    entries.push(entry)
    let group = groups.get(groupKey)
    if (!group) {
      const { origin, destination, departure_date, cabin } = result
      group = { key: groupKey, origin, destination, departure_date, cabin, passengers, entries: [],
        bestKeys: new Set(), bestValue: null, lowestPoints: null, lowestKeys: new Set() }
      groups.set(groupKey, group)
    }
    group.entries.push(entry)
    if (!conflicting && matchesTrip(result, trip) && positivePoints(trip.points)) {
      if (group.lowestPoints === null || trip.points < group.lowestPoints) {
        group.lowestPoints = trip.points
        group.lowestKeys.clear()
      }
      if (trip.points === group.lowestPoints) group.lowestKeys.add(key)
    }
  }
  const bestKeys = new Set<string>()
  for (const group of groups.values()) {
    const eligible = group.entries.filter((entry) => entry.eligible)
    if (eligible.length < 2 || new Set(eligible.map((entry) => entry.value!.cashFare)).size !== 1) continue
    group.bestValue = Math.max(...eligible.map((entry) => entry.value!.cpp))
    for (const entry of eligible) if (entry.value!.cpp === group.bestValue) {
      group.bestKeys.add(entry.key)
      bestKeys.add(entry.key)
    }
  }
  return { entries, bestKeys, groups: [...groups.values()] }
}

export function getSummaryValue(result: ChatResult, comparison: ValueComparison): TripValue | null {
  const matched = comparison.entries.filter((entry) => parentIdentity(entry.result) === parentIdentity(result)
    && entry.trip.points === result.points_cost)
  const value = matched[0]?.value
  if (!value || matched.some((entry) => !entry.value || JSON.stringify(entry.value) !== JSON.stringify(value))) return null
  return value
}
