import type { TripDraft } from '../components/TripEntry'
import type { SearchResponse } from './availability-api'
import { searchFixture } from './availability-fixtures'

export type TripCriteria = Omit<TripDraft, 'message'> & { endDate?: string }

export const demoRequest = 'Find award flights from New York to Seattle, October 31–November 6. Help me compare value, journey time and points.'
export const demoCriteria = {
  origin: 'JFK',
  destination: 'SEA',
  departureDate: '2026-10-31',
  endDate: '2026-11-06',
  adults: '1',
  cabins: ['Economy'],
} satisfies TripCriteria

export const createTripDraft = (): TripDraft => ({
  message: '',
  origin: '',
  destination: '',
  departureDate: '',
  adults: '1',
  cabins: [],
})

export function supportsDemo(criteria: TripCriteria): boolean {
  const endDate = criteria.endDate ?? criteria.departureDate
  return criteria.origin.trim().toUpperCase() === demoCriteria.origin
    && criteria.destination.trim().toUpperCase() === demoCriteria.destination
    && criteria.departureDate >= demoCriteria.departureDate
    && criteria.departureDate <= demoCriteria.endDate
    && endDate >= criteria.departureDate
    && endDate <= demoCriteria.endDate
}

export function getMockResults(criteria: TripCriteria): SearchResponse {
  const endDate = criteria.endDate ?? criteria.departureDate
  const results = searchFixture.results.filter((row) => {
    return row.date >= criteria.departureDate && row.date <= endDate
  })

  return structuredClone({
    criteria: {
      origin_airport: criteria.origin.trim().toUpperCase(),
      destination_airport: criteria.destination.trim().toUpperCase(),
      start_date: criteria.departureDate,
      end_date: endDate,
    },
    results,
  })
}

export async function searchMock(
  criteria: TripCriteria,
  signal: AbortSignal,
  fail = false,
): Promise<SearchResponse> {
  if (!supportsDemo(criteria)) {
    throw new Error('Unsupported demo criteria')
  }

  await new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer)
      reject(new DOMException('Canceled', 'AbortError'))
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort)
      resolve()
    }, 1500)

    if (signal.aborted) {
      abort()
    } else {
      signal.addEventListener('abort', abort, { once: true })
    }
  })

  if (fail) {
    throw new Error('Scripted mock failure')
  }

  return getMockResults(criteria)
}
