import { expect, it, vi } from 'vitest'
import { captureSearchCriteria, searchAwards, validateSearchResponse } from './search-api'
import { validateChatResponse } from './chat-response'
import { testAirports } from '../test-airports'

const draft = {
  message: '', origin: ' jfk ', destination: ' sea ', departureDate: '2026-12-01', adults: '2',
  originCodes: [' jfk '], destinationCodes: [' sea '],
  cabins: ['Premium economy', 'First'],
}

it.each(['exact', 'custom'])('captures immutable normalized criteria with %s dates', (departureFlex) => {
  const editable = { ...draft, departureFlex, departureDateEnd: '2026-12-07', cabins: [...draft.cabins] }
  const criteria = captureSearchCriteria(editable, testAirports)
  editable.cabins.pop()
  editable.originCodes = ['LAX']
  editable.departureDateEnd = '2026-12-10'
  expect(criteria).toEqual({ origin: 'JFK', destination: 'SEA', departure_date: '2026-12-01',
    ...(departureFlex === 'custom' ? { departure_date_end: '2026-12-07' } : {}),
    passengers: 2, cabins: ['premium_economy', 'first'] })
  expect(Object.isFrozen(criteria)).toBe(true)
  expect(Object.isFrozen(criteria.cabins)).toBe(true)
})

it.each([
  ['1', '2027-05-11', '2027-05-13'], ['3', '2027-05-09', '2027-05-15'],
  ['7', '2027-05-05', '2027-05-19'], ['14', '2027-04-28', '2027-05-26'],
  ['28', '2027-04-14', '2027-06-09'], ['60', '2027-03-13', '2027-07-11'],
  ['180', '2026-11-13', '2027-11-08'],
])('captures the complete ±%s-day window without clamping', (departureFlex, start, end) => {
  expect(captureSearchCriteria({ ...draft, departureDate: '2027-05-12', departureFlex }, testAirports))
    .toMatchObject({ departure_date: start, departure_date_end: end })
})

it('keeps a same-day custom range compatible with the exact-date payload', () => {
  expect(captureSearchCriteria({ ...draft, departureFlex: 'custom', departureDateEnd: draft.departureDate }, testAirports))
    .not.toHaveProperty('departure_date_end')
})

it.each([
  ['2028-03-01', '2028-02-29', '2028-03-02'], ['2026-12-31', '2026-12-30', '2027-01-01'],
])('uses calendar days across leap/month/year boundaries at %s', (departureDate, start, end) => {
  const now = new Date(`${departureDate.slice(0, 4)}-01-01T12:00:00Z`)
  expect(captureSearchCriteria({ ...draft, departureDate, departureFlex: '1' }, testAirports, now))
    .toMatchObject({ departure_date: start, departure_date_end: end })
})

it.each(['2026-11-11', '2027-11-10'])('checks both preset endpoints against every origin at %s', (departureDate) => {
  expect(() => captureSearchCriteria({ ...draft, originCodes: ['JFK', 'HND'], departureDate, departureFlex: '1' },
    testAirports, new Date('2026-11-11T01:00:00Z'))).toThrow('Invalid search criteria')
})

it.each([
  { originCodes: ['New York'] }, { destinationCodes: ['JFK'] }, { departureDate: '2026-02-30' },
  { adults: '0' }, { cabins: ['Suite'] }, { cabins: ['Economy', 'Economy'] },
  { departureFlex: '2' }, { departureFlex: '180' },
  { departureFlex: 'custom', departureDateEnd: '' },
  { departureFlex: 'custom', departureDateEnd: '2027-02-30' },
  { departureFlex: 'custom', departureDateEnd: '2026-11-30' },
  { departureFlex: 'custom', departureDateEnd: '2027-11-12' },
])('rejects invalid request criteria %j', (changes) => {
  expect(() => captureSearchCriteria({ ...draft, ...changes }, testAirports)).toThrow('Invalid search criteria')
  expect(fetch).not.toHaveBeenCalled()
})

it('validates search and chat envelopes separately and preserves service messages', () => {
  for (const message of [null, '', 'No seats for this party.']) {
    expect(validateSearchResponse({ message, results: [] })).toEqual({ message, results: [] })
  }
  expect(() => validateSearchResponse({ reply: 'Chat only', results: [] })).toThrow()
  expect(() => validateChatResponse({ message: 'Search only', results: [] })).toThrow()
})

it.each([null, [], {}, { message: 7, results: [] }, { message: null, results: null },
  { message: null, results: [{ cabin: 'suite' }] }])('rejects malformed search responses %j', (payload) => {
  expect(() => validateSearchResponse(payload)).toThrow()
})

it.each([
  [400, 'rejected these criteria'], [429, 'Too many requests'], [503, 'service is unavailable'],
  [404, 'HTTP 404'], [null, 'Check your connection'],
])('reports search failure %s safely', async (status, message) => {
  if (status === null) vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Failed to fetch'))
  else vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status }))
  await expect(searchAwards(captureSearchCriteria(draft, testAirports), new AbortController().signal)).rejects.toThrow(message)
})

it.each(['not JSON', JSON.stringify({ reply: 'Wrong envelope', results: [] })])('reports invalid wire response %s', async (body) => {
  vi.mocked(fetch).mockResolvedValueOnce(new Response(body))
  await expect(searchAwards(captureSearchCriteria(draft, testAirports), new AbortController().signal)).rejects.toThrow('invalid response')
})
