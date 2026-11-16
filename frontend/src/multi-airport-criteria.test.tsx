import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import CurrentTrip from './components/CurrentTrip'
import type { TripDraft } from './components/TripEntry'
import { resolveTripAirports, tripDepartureBounds, validateTripFields } from './lib/trip-validation'
import { captureSearchCriteria } from './services/search-api'
import type { ChatResult } from './services/chat-response'
import { testAirports } from './test-airports'

const airports = [...testAirports, {
  code: 'HNL', name: 'Daniel K. Inouye International Airport', city: 'Honolulu',
  country: 'US', timeZone: 'Pacific/Honolulu',
}]
const draft: TripDraft = {
  message: '', origin: 'Filter text', destination: 'Another filter',
  originCodes: [' jfk ', 'lga'], destinationCodes: ['lhr', ' HND '],
  departureDate: '2026-12-01', adults: '2', cabins: ['Premium economy', 'First'],
}

it('captures explicit selections independently of query text and later mutations', () => {
  const editable = { ...draft, originCodes: [...draft.originCodes], destinationCodes: [...draft.destinationCodes], cabins: [...draft.cabins] }
  const criteria = captureSearchCriteria(editable, airports)
  expect(criteria).toEqual({ origin: ['JFK', 'LGA'], destination: ['LHR', 'HND'],
    departure_date: '2026-12-01', passengers: 2, cabins: ['premium_economy', 'first'] })
  editable.originCodes.pop()
  editable.destinationCodes[0] = 'SEA'
  editable.cabins.length = 0
  expect(criteria.origin).toEqual(['JFK', 'LGA'])
  expect(criteria.destination).toEqual(['LHR', 'HND'])
  expect(criteria.cabins).toEqual(['premium_economy', 'first'])
  expect(Object.isFrozen(criteria.origin)).toBe(true)
  expect(Object.isFrozen(criteria.destination)).toBe(true)
  expect(Object.isFrozen(criteria)).toBe(true)
  expect(fetch).not.toHaveBeenCalled()
})

it('serializes singleton selections as strings, including alongside multiple airports', () => {
  const single = { ...draft, originCodes: ['JFK'], destinationCodes: ['SEA'] }
  expect(captureSearchCriteria(single, airports)).toMatchObject({ origin: 'JFK', destination: 'SEA' })
  const mixed = { ...draft, destinationCodes: ['SEA'] }
  expect(captureSearchCriteria(mixed, airports)).toMatchObject({ origin: ['JFK', 'LGA'], destination: 'SEA' })
})

it.each(['origin', 'destination'] as const)('requires explicit %s selections even when a valid code is typed', (field) => {
  const empty = { ...draft, [field]: 'JFK', [`${field}Codes`]: [] }
  expect(resolveTripAirports(empty, field, airports)).toEqual([])
  expect(validateTripFields(empty, airports)).toHaveProperty(field)
  expect(() => captureSearchCriteria(empty, airports)).toThrow('Invalid search criteria')
})

it.each(['origin', 'destination'] as const)('rejects invalid %s selection sets', (field) => {
  for (const codes of [['JFK', ' jfk '], ['QQQ'], ['NYC'], ['New York'], ['LǴA'],
    ['JFK', 'LGA', 'SEA', 'LAX', 'ORD', 'LHR', 'HND']]) {
    const invalid = { ...draft, [`${field}Codes`]: codes }
    expect(validateTripFields(invalid, airports)).toHaveProperty(field)
    expect(() => captureSearchCriteria(invalid, airports)).toThrow('Invalid search criteria')
  }
  expect(validateTripFields(draft)).toMatchObject({
    origin: 'Load the airport list before searching.', destination: 'Load the airport list before searching.',
  })
})

it('allows six selections on either endpoint and rejects overlap anywhere', () => {
  const codes = ['JFK', 'LGA', 'SEA', 'LAX', 'ORD', 'HNL']
  expect(validateTripFields({ ...draft, originCodes: codes }, airports)).toEqual({})
  expect(validateTripFields({ ...draft, originCodes: ['LHR'], destinationCodes: codes }, airports)).toEqual({})
  expect(validateTripFields({ ...draft, destinationCodes: ['LHR', ' lga '] }, airports)).toHaveProperty('destination')
})

it.each([['HNL', 'HND'], ['HND', 'HNL']])('intersects all origin calendar horizons in either order: %j', (...originCodes) => {
  const now = new Date('2028-03-01T00:30:00Z')
  const request = { ...draft, originCodes, destinationCodes: ['SEA'] }
  expect(tripDepartureBounds(request, airports, now)).toEqual({ min: '2028-03-01', max: '2029-02-28' })
  for (const departureDate of ['2028-02-29', '2029-03-01']) {
    expect(validateTripFields({ ...request, departureDate }, airports, now)).toHaveProperty('departureDate')
    expect(() => captureSearchCriteria({ ...request, departureDate }, airports, now)).toThrow('Invalid search criteria')
  }
  for (const departureDate of ['2028-03-01', '2029-02-28']) {
    expect(validateTripFields({ ...request, departureDate }, airports, now)).toEqual({})
    expect(captureSearchCriteria({ ...request, departureDate }, airports, now).origin).toEqual(originCodes)
  }
})

it('does not invent date bounds without selected origins or usable timezone data', () => {
  expect(tripDepartureBounds({ ...draft, originCodes: [] }, airports)).toBeUndefined()
  const unavailable = airports.map((airport) => ({ ...airport, timeZone: 'Invalid/Timezone' }))
  expect(tripDepartureBounds(draft, unavailable)).toContain('timezone must be confirmed')
  expect(validateTripFields(draft, unavailable)).toHaveProperty('departureDate')
})

it.each([false, true])('keeps all requested airports and cabins visible with partial results=%s', (withResult) => {
  const result: ChatResult = { origin: 'JFK', destination: 'LHR', departure_date: '2026-12-01',
    program: 'United', airline: 'UA', cabin: 'first', points_cost: 80000,
    cash_fees_usd: null, cents_per_point: null, seats_available: null }
  render(<CurrentTrip results={withResult ? [result] : []} criteria={captureSearchCriteria(draft, airports)} />)
  const summary = screen.getByRole('region', { name: 'Current trip' })
  expect(summary).toHaveTextContent('New York · JFK / LGA')
  expect(summary).toHaveTextContent('LHR / HND')
  expect(summary).toHaveTextContent('Premium economy + First')
  expect(summary).toHaveTextContent('2 adults')
  expect(summary).toHaveTextContent('Tue, Dec 1')
})
