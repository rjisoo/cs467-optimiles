import { expect, it, vi } from 'vitest'
import { captureSearchCriteria, searchAwards, validateSearchResponse } from './search-api'
import { validateChatResponse } from './chat-response'

const draft = {
  message: '', origin: ' jfk ', destination: ' sea ', departureDate: '2026-12-01', adults: '2',
  cabins: ['Premium economy', 'First'],
}

it('captures validated, normalized criteria independently of mutable form fields', () => {
  const editable = { ...draft, cabins: [...draft.cabins] }
  const criteria = captureSearchCriteria(editable)
  editable.cabins.pop()
  editable.origin = 'LAX'
  expect(criteria).toEqual({ origin: 'JFK', destination: 'SEA', departure_date: '2026-12-01',
    passengers: 2, cabins: ['premium_economy', 'first'] })
  expect(Object.isFrozen(criteria)).toBe(true)
  expect(Object.isFrozen(criteria.cabins)).toBe(true)
})

it.each([
  { origin: 'New York' }, { destination: 'JFK' }, { departureDate: '2026-02-30' },
  { adults: '0' }, { cabins: [] }, { cabins: ['Suite'] }, { cabins: ['Economy', 'Economy'] },
])('rejects invalid request criteria %j', (changes) => {
  expect(() => captureSearchCriteria({ ...draft, ...changes })).toThrow('Invalid search criteria')
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
  await expect(searchAwards(captureSearchCriteria(draft), new AbortController().signal)).rejects.toThrow(message)
})

it.each(['not JSON', JSON.stringify({ reply: 'Wrong envelope', results: [] })])('reports invalid wire response %s', async (body) => {
  vi.mocked(fetch).mockResolvedValueOnce(new Response(body))
  await expect(searchAwards(captureSearchCriteria(draft), new AbortController().signal)).rejects.toThrow('invalid response')
})
