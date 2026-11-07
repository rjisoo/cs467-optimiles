import { act, renderHook } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import useChatJourney from './useChatJourney'

it('sends the actual text verbatim and stores the returned reply', async () => {
  const response = { reply: 'What date would you like to travel?', results: [] }
  vi.mocked(fetch).mockResolvedValueOnce(Response.json(response))
  const message = '  abd "quoted"\n안녕  '
  const { result } = renderHook(useChatJourney)
  act(() => result.current.setDraft((draft) => ({ ...draft, message })))
  await act(async () => result.current.submit('chat'))
  expect(fetch).toHaveBeenCalledExactlyOnceWith('/api/chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }), signal: expect.any(AbortSignal),
  })
  expect(result.current.turns[0]).toMatchObject({ status: 'success', response })
})

it.each([
  [400, /rejected this message/], [429, /Too many requests/],
  [503, /service is unavailable/], [404, /HTTP 404/], [null, /Check your connection/],
])('reports %s request failures and retains the submitted draft', async (status, message) => {
  if (status === null) vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Failed to fetch'))
  else vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status }))
  const { result } = renderHook(useChatJourney)
  act(() => result.current.setDraft((draft) => ({ ...draft, message: 'Search' })))
  await act(async () => result.current.submit('chat'))
  expect(result.current.turns[0]).toMatchObject({ status: 'failed', error: expect.stringMatching(message) })
  expect(result.current.draft.message).toBe('Search')
})

it.each(['not JSON', JSON.stringify({ reply: 'Incomplete response' })])('reports invalid response %s without fallback results', async (body) => {
  vi.mocked(fetch).mockResolvedValueOnce(new Response(body))
  const { result } = renderHook(useChatJourney)
  act(() => result.current.setDraft((draft) => ({ ...draft, message: 'Search' })))
  await act(async () => result.current.submit('chat'))
  expect(result.current.turns[0]).toMatchObject({ status: 'failed', error: expect.stringContaining('invalid response') })
  expect(result.current.turns[0].response).toBeUndefined()
})

it('sends each exact form date through chat without the old route/date restriction', async () => {
  vi.mocked(fetch).mockImplementation(async () => Response.json({ reply: 'Searching requested date', results: [] }))
  const { result } = renderHook(useChatJourney)
  act(() => result.current.setDraft({
    message: 'Keep my unsent message', origin: ' lax ', destination: ' jfk ',
    departureDate: '2026-12-01', adults: '2', cabins: ['Economy', 'Business'],
  }))
  await act(async () => result.current.submit('form'))
  expect(vi.mocked(fetch).mock.calls[0][1]?.body).toBe(JSON.stringify({
    message: 'LAX to JFK, 2026-12-01, one way, 2 adults. Compare Economy, Business.',
  }))
  act(() => result.current.setDraft((draft) => ({ ...draft, departureDate: '2026-12-02' })))
  await act(async () => result.current.submit('form'))
  expect(vi.mocked(fetch).mock.calls[1][1]?.body).toBe(JSON.stringify({
    message: 'LAX to JFK, 2026-12-02, one way, 2 adults. Compare Economy, Business.',
  }))
  expect(result.current.turns.map((turn) => turn.status)).toEqual(['success', 'success'])
  expect(result.current.draft.message).toBe('Keep my unsent message')
})
