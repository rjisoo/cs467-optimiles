import { act, renderHook } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import useChatJourney from './useChatJourney'
import { mockAirportCatalog } from './test-airports'

const empty = { message: 'No cached seats match the selected cabins.', results: [] }
function draft() {
  return {
    message: 'Keep this note', origin: 'New York', destination: 'West coast',
    originCodes: ['JFK', 'LGA'], destinationCodes: ['SEA', 'LAX'],
    departureDate: '2026-12-01', adults: '2', cabins: ['Economy', 'Business'],
  }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((accept) => { resolve = accept })
  return { promise, resolve }
}

it.each([{ cabins: ['Economy', 'Business'] }, { cabins: [] }])(
  'retries captured airport lists and cabins=$cabins after the editable draft changes', async ({ cabins }) => {
  mockAirportCatalog()
  vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockResolvedValueOnce(Response.json(empty))
  const { result } = renderHook(useChatJourney)
  await act(async () => result.current.loadAirports())
  const original = { ...draft(), cabins: [...cabins] }
  act(() => result.current.setDraft(original))
  await act(async () => result.current.submit('form'))
  const failed = result.current.turns[0]
  expect(failed.status).toBe('failed')
  expect(failed.error).toContain('unavailable')
  expect(failed.request).toContain('JFK, LGA to SEA, LAX')
  expect(failed.request).toContain(cabins.length ? 'Compare Economy, Business.' : 'Compare all cabins.')
  if (failed.source !== 'form') throw new Error('Expected a form search')
  const criteria = {
    origin: ['JFK', 'LGA'], destination: ['SEA', 'LAX'], departure_date: '2026-12-01',
    passengers: 2, ...(cabins.length ? { cabins: ['economy', 'business'] } : {}),
  }
  expect(failed.payload).toEqual(criteria)
  expect(Object.isFrozen(failed.payload.origin)).toBe(true)
  expect(Object.isFrozen(failed.payload.destination)).toBe(true)
  if (failed.payload.cabins) expect(Object.isFrozen(failed.payload.cabins)).toBe(true)
  original.originCodes.pop()
  original.destinationCodes[0] = 'LHR'
  original.cabins.pop()
  const edited = { ...draft(), originCodes: ['ORD'], destinationCodes: ['HND'], cabins: ['First'] }
  act(() => result.current.setDraft(edited))
  await act(async () => result.current.retry(failed))
  const searches = vi.mocked(fetch).mock.calls.slice(1)
  expect(searches.map(([url]) => url)).toEqual(['/api/search', '/api/search'])
  expect(searches.map(([, init]) => JSON.parse(String(init?.body)))).toEqual([criteria, criteria])
  expect(searches[1][1]?.signal).not.toBe(searches[0][1]?.signal)
  expect(result.current.turns[0]).toMatchObject({ id: failed.id, status: 'success', response: empty })
  expect(result.current.draft).toEqual(edited)
})

it('retries a canceled multi-airport turn and ignores its late JSON during retry', async () => {
  mockAirportCatalog()
  const oldBody = deferred<typeof empty>()
  const response = Response.json(empty)
  vi.spyOn(response, 'json').mockReturnValueOnce(oldBody.promise)
  const retryResponse = deferred<Response>()
  vi.mocked(fetch).mockResolvedValueOnce(response).mockReturnValueOnce(retryResponse.promise)
  const { result } = renderHook(useChatJourney)
  await act(async () => result.current.loadAirports())
  act(() => result.current.setDraft({ ...draft(), cabins: [] }))
  await act(async () => result.current.submit('form'))
  const originalRequest = vi.mocked(fetch).mock.calls[1]
  act(() => result.current.cancel())
  const canceled = result.current.turns[0]
  expect(canceled.status).toBe('canceled')
  expect(originalRequest[1]?.signal?.aborted).toBe(true)
  act(() => result.current.setDraft({ ...draft(), originCodes: ['ORD'] }))
  act(() => result.current.retry(canceled))
  const retriedRequest = vi.mocked(fetch).mock.calls[2]
  expect([originalRequest[0], retriedRequest[0]]).toEqual(['/api/search', '/api/search'])
  expect(retriedRequest[1]?.body).toBe(originalRequest[1]?.body)
  expect(retriedRequest[1]?.signal?.aborted).toBe(false)
  expect(retriedRequest[1]?.signal).not.toBe(originalRequest[1]?.signal)
  await act(async () => oldBody.resolve(empty))
  expect(result.current.turns).toHaveLength(1)
  expect(result.current.turns[0]).toMatchObject({ id: canceled.id, status: 'pending' })
  expect(result.current.turns[0].response).toBeUndefined()
  await act(async () => retryResponse.resolve(Response.json(empty)))
  expect(result.current.turns[0]).toMatchObject({ id: canceled.id, status: 'success', response: empty })
  expect(result.current.draft.originCodes).toEqual(['ORD'])
})

it.each(['cancel', 'reset'] as const)('%s isolates stale multi-airport JSON from a replacement search', async (action) => {
  mockAirportCatalog()
  const oldBody = deferred<typeof empty>()
  const response = Response.json(empty)
  vi.spyOn(response, 'json').mockReturnValueOnce(oldBody.promise)
  const replacement = deferred<Response>()
  vi.mocked(fetch).mockResolvedValueOnce(response).mockReturnValueOnce(replacement.promise)
  const { result } = renderHook(useChatJourney)
  await act(async () => result.current.loadAirports())
  const catalog = result.current.airportCatalog
  act(() => result.current.setDraft({ ...draft(), cabins: [] }))
  await act(async () => result.current.submit('form'))
  const signal = vi.mocked(fetch).mock.calls[1][1]?.signal
  act(() => result.current[action]())
  expect(signal?.aborted).toBe(true)
  if (action === 'reset') {
    expect(result.current.turns).toEqual([])
    expect(result.current.draft).toEqual({
      message: '', origin: '', destination: '', originCodes: [], destinationCodes: [],
      departureDate: '', adults: '1', cabins: [],
    })
    expect(result.current.fieldErrors).toEqual({})
    expect(result.current.airportCatalog).toBe(catalog)
    expect(result.current.airportStatus).toBe('ready')
    await act(async () => result.current.loadAirports())
    expect(fetch).toHaveBeenCalledTimes(2)
  }
  const edited = { ...draft(), originCodes: ['ORD'], destinationCodes: ['LHR', 'HND'] }
  act(() => result.current.setDraft(edited))
  act(() => result.current.submit('form'))
  await act(async () => oldBody.resolve(empty))
  expect(result.current.turns.at(-1)?.status).toBe('pending')
  expect(result.current.turns.every((turn) => !turn.response)).toBe(true)
  await act(async () => replacement.resolve(Response.json(empty)))
  expect(result.current.turns.at(-1)).toMatchObject({ status: 'success', response: empty })
  expect(result.current.draft).toEqual(edited)
  expect(vi.mocked(fetch).mock.calls.map(([url]) => url)).toEqual([
    '/api/airports', '/api/search', '/api/search',
  ])
  expect(JSON.parse(String(vi.mocked(fetch).mock.calls[2][1]?.body))).toMatchObject({
    origin: 'ORD', destination: ['LHR', 'HND'],
  })
})
