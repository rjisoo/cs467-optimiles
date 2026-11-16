import { act, fireEvent, render, renderHook, screen, within } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import App from './App'
import useChatJourney from './useChatJourney'

const draft = { message: 'Keep this note', origin: 'JFK', destination: 'SEA', departureDate: '2026-12-01',
  adults: '2', cabins: ['Economy', 'Business'] }
const empty = { message: 'No cached seats match the selected cabins.', results: [] }
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail })
  return { promise, resolve, reject }
}
function submitForm() {
  fireEvent.change(screen.getByRole('textbox', { name: 'From' }), { target: { value: draft.origin } })
  fireEvent.change(screen.getByRole('textbox', { name: 'To' }), { target: { value: draft.destination } })
  fireEvent.change(screen.getByLabelText('Departure date'), { target: { value: draft.departureDate } })
  fireEvent.change(screen.getByRole('combobox', { name: 'Adults' }), { target: { value: draft.adults } })
  draft.cabins.forEach((cabin) => fireEvent.click(screen.getByRole('checkbox', { name: cabin })))
  fireEvent.click(screen.getByRole('button', { name: 'Search awards' }))
}

it.each(['cancel', 'reset'] as const)('%s rejects stale form JSON while a replacement is pending', async (action) => {
  const body = deferred<typeof empty>()
  const response = Response.json(empty)
  vi.spyOn(response, 'json').mockReturnValueOnce(body.promise)
  const replacement = deferred<Response>()
  vi.mocked(fetch).mockResolvedValueOnce(response).mockReturnValueOnce(replacement.promise)
  const { result } = renderHook(useChatJourney)
  act(() => result.current.setDraft(draft))
  await act(async () => result.current.submit('form'))
  const signal = vi.mocked(fetch).mock.calls[0][1]?.signal
  act(() => result.current[action]())
  expect(signal?.aborted).toBe(true)
  if (action === 'reset') {
    expect(result.current.turns).toEqual([])
    expect(result.current.draft).toMatchObject({ origin: '', cabins: [] })
  }
  act(() => result.current.setDraft({ ...draft, destination: 'LHR' }))
  act(() => result.current.submit('form'))
  await act(async () => body.resolve(empty))
  expect(result.current.turns.at(-1)?.status).toBe('pending')
  expect(result.current.turns.every((turn) => !turn.response)).toBe(true)
  await act(async () => replacement.resolve(Response.json(empty)))
  expect(result.current.turns.at(-1)?.status).toBe('success')
  expect(result.current.draft.destination).toBe('LHR')
})

it('recovers a failed form search into shared results and aborts trip expansion on New trip', async () => {
  const trips = deferred<Response>()
  vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockResolvedValueOnce(Response.json({ message: null, results: [{
      availability_id: 'award-1', airline: 'AA', cabin: 'economy', cash_fees_usd: 0, cents_per_point: null,
      departure_date: draft.departureDate, origin: draft.origin, destination: draft.destination,
      points_cost: 12500, program: 'American AAdvantage', seats_available: 2,
    }] })).mockReturnValueOnce(trips.promise)
  render(<App />)
  submitForm()
  const retry = await screen.findByRole('button', { name: 'Retry' })
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
  fireEvent.click(retry)
  const row = await screen.findByRole('row', { name: /American AAdvantage/ })
  expect(row).toHaveTextContent('$0.00 USD fees')
  expect(screen.getByRole('region', { name: 'Current trip' })).toHaveTextContent('Economy + Business')
  fireEvent.click(within(row).getByRole('button', { name: 'View trips' }))
  expect(vi.mocked(fetch).mock.calls.map(([url]) => url)).toEqual([
    '/api/search', '/api/search', '/api/availability/award-1/trips',
  ])
  const tripSignal = vi.mocked(fetch).mock.calls[2][1]?.signal
  fireEvent.click(screen.getByRole('button', { name: 'New trip' }))
  expect(tripSignal?.aborted).toBe(true)
  await act(async () => trips.resolve(Response.json({ availability_id: 'award-1', trips: [], booking_links: [] })))
  expect(screen.queryByRole('region', { name: 'Award search results' })).not.toBeInTheDocument()
})
