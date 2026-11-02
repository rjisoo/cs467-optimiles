import { act, renderHook } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { getMockResults, demoCriteria, searchMock } from './services/mock-search'
import useMockJourney from './useMockJourney'

vi.mock('./services/mock-search', async (importOriginal) => ({
  ...await importOriginal<typeof import('./services/mock-search')>(), searchMock: vi.fn(),
}))
const fetchMock = vi.fn<typeof fetch>()
beforeEach(() => {
  fetchMock.mockReset().mockResolvedValue(new Response('unused, non-JSON reply'))
  vi.stubGlobal('fetch', fetchMock)
  vi.mocked(searchMock).mockImplementation(async (criteria) => getMockResults(criteria))
})

function journey(message = 'abd') {
  const hook = renderHook(() => useMockJourney(true))
  act(() => hook.result.current.setDraft((draft) => ({ ...draft, message })))
  return hook
}

it('rejects blank messages and sends only the actual text once', async () => {
  const { result } = journey(' \n ')
  act(() => result.current.submit('chat'))
  expect(fetchMock).not.toHaveBeenCalled()
  const message = '  abd "quoted"\n안녕  '
  act(() => result.current.setDraft((draft) => ({ ...draft, message })))
  await act(async () => {
    result.current.submit('chat')
    result.current.submit('chat')
  })
  expect(fetchMock).toHaveBeenCalledExactlyOnceWith('/api/chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }), signal: expect.any(AbortSignal),
  })
  expect(result.current.turns.at(-1)).toMatchObject({
    status: 'success', results: getMockResults(demoCriteria),
  })
})

it.each([
  [400, /rejected this message/],
  [429, /Too many requests/],
  [503, /service is unavailable/],
  [404, /HTTP 404/],
  [null, /Check your connection/],
])('reports %s failure and clears the error when retrying', async (status, message) => {
  if (status === null) fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
  else fetchMock.mockResolvedValueOnce(new Response(null, { status }))
  const { result } = journey()
  await act(async () => result.current.submit('chat'))
  const failed = result.current.turns[1]
  expect(failed.status).toBe('failed')
  expect(failed.error).toMatch(message)
  expect(result.current.draft.message).toBe('abd')
  act(() => result.current.setDraft((draft) => ({ ...draft, message: 'Keep this edit' })))
  await act(async () => result.current.retry(failed))
  expect(fetchMock.mock.calls[1][1]?.body).toBe(JSON.stringify({ message: 'abd' }))
  expect(result.current.turns[1]).toMatchObject({ status: 'success', error: undefined })
  expect(result.current.draft.message).toBe('Keep this edit')
})

it.each(['cancel', 'reset', 'unmount'] as const)('%s aborts the HTTP request', async (action) => {
  let reject!: (error: Error) => void
  fetchMock.mockReturnValueOnce(new Promise((_resolve, fail) => { reject = fail }))
  const { result, unmount } = journey()
  act(() => result.current.submit('chat'))
  const signal = fetchMock.mock.calls[0][1]?.signal
  act(() => action === 'unmount' ? unmount() : result.current[action]())
  expect(signal?.aborted).toBe(true)
  await act(async () => reject(new DOMException('Canceled', 'AbortError')))
  if (action === 'cancel') expect(result.current.turns[1].status).toBe('canceled')
  if (action === 'reset') expect(result.current.turns).toHaveLength(0)
})

it('keeps form submissions local', async () => {
  const { result } = journey()
  await act(async () => result.current.submit('form'))
  expect(fetchMock).not.toHaveBeenCalled()
  expect(result.current.turns[1].status).toBe('success')
})
