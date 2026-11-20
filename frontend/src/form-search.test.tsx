import { act, fireEvent, render, renderHook, screen, within } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import App from './App'
import useChatJourney from './useChatJourney'
import { mockAirportCatalog } from './test-airports'

const draft = { message: 'Keep this note', origin: 'JFK', destination: 'SEA', departureDate: '2026-12-01',
  originCodes: ['JFK'], destinationCodes: ['SEA'],
  adults: '2', cabins: ['Economy', 'Business'] }
const empty = { message: 'No cached seats match the selected cabins.', results: [] }
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail })
  return { promise, resolve, reject }
}
async function submitForm(cabins = draft.cabins, flexibility = 'exact', endDate = '2026-12-07') {
  const origin = screen.getByRole('combobox', { name: 'From' })
  await act(async () => origin.focus())
  fireEvent.change(origin, { target: { value: draft.origin } })
  fireEvent.keyDown(origin, { key: 'Enter' })
  fireEvent.change(screen.getByRole('combobox', { name: 'To' }), { target: { value: draft.destination } })
  fireEvent.keyDown(screen.getByRole('combobox', { name: 'To' }), { key: 'Enter' })
  fireEvent.change(screen.getByLabelText('Departure date'), { target: { value: draft.departureDate } })
  fireEvent.change(screen.getByRole('combobox', { name: 'Date flexibility' }), { target: { value: flexibility } })
  if (flexibility === 'custom') {
    expect(screen.getByLabelText('Earliest departure')).toHaveValue(draft.departureDate)
    const end = screen.getByLabelText('Latest departure')
    expect(end).toHaveAttribute('type', 'date')
    expect(end).toHaveValue(draft.departureDate)
    fireEvent.change(end, { target: { value: endDate } })
    if (endDate === '2026-12-07') {
      expect(screen.getByText('Departure window: 2026-12-01 through 2026-12-07, inclusive.')).toBeVisible()
    }
  }
  fireEvent.change(screen.getByRole('combobox', { name: 'Adults' }), { target: { value: draft.adults } })
  cabins.forEach((cabin) => fireEvent.click(screen.getByRole('checkbox', { name: cabin })))
  fireEvent.click(screen.getByRole('button', { name: 'Search awards' }))
}

it.each(['cancel', 'reset', 'retry'] as const)('%s isolates captured date windows from edits and stale JSON', async (action) => {
  mockAirportCatalog()
  const body = deferred<typeof empty>()
  const response = Response.json(empty)
  vi.spyOn(response, 'json').mockReturnValueOnce(body.promise)
  const replacement = deferred<Response>()
  vi.mocked(fetch).mockResolvedValueOnce(response).mockReturnValueOnce(replacement.promise)
  const { result } = renderHook(useChatJourney)
  await act(async () => result.current.loadAirports())
  vi.mocked(fetch).mockClear()
  act(() => result.current.setDraft({ ...draft, departureFlex: '3' }))
  await act(async () => result.current.submit('form'))
  const originalBody = vi.mocked(fetch).mock.calls[0][1]?.body
  expect(JSON.parse(String(originalBody))).toMatchObject({ departure_date: '2026-11-28', departure_date_end: '2026-12-04' })
  expect(result.current.turns[0].request).toContain('2026-11-28')
  expect(result.current.turns[0].request).toContain('2026-12-04')
  const signal = vi.mocked(fetch).mock.calls[0][1]?.signal
  act(() => result.current[action === 'retry' ? 'cancel' : action]())
  const canceled = result.current.turns[0]
  expect(signal?.aborted).toBe(true)
  if (action === 'reset') {
    expect(result.current.turns).toEqual([])
    expect(result.current.draft).toMatchObject({ origin: '', cabins: [] })
    expect(result.current.draft.departureFlex).toBeUndefined()
    expect(result.current.draft.departureDateEnd).toBeUndefined()
  }
  act(() => result.current.setDraft({ ...draft, destinationCodes: ['LHR'] }))
  act(() => action === 'retry' ? result.current.retry(canceled) : result.current.submit('form'))
  const replacementBody = vi.mocked(fetch).mock.calls[1][1]?.body
  if (action === 'retry') expect(replacementBody).toBe(originalBody)
  else expect(JSON.parse(String(replacementBody))).not.toHaveProperty('departure_date_end')
  await act(async () => body.resolve(empty))
  expect(result.current.turns.at(-1)?.status).toBe('pending')
  expect(result.current.turns.every((turn) => !turn.response)).toBe(true)
  await act(async () => replacement.resolve(Response.json(empty)))
  expect(result.current.turns.at(-1)?.status).toBe('success')
  expect(result.current.draft.destinationCodes).toEqual(['LHR'])
  expect(vi.mocked(fetch).mock.calls.map(([url]) => url)).toEqual(['/api/search', '/api/search'])
})

it.each([
  { cabins: draft.cabins, summary: 'Economy + Business', flexibility: 'exact' },
  { cabins: [], summary: 'All cabins', flexibility: 'custom' },
])('recovers a failed $flexibility form search and aborts trip expansion on New trip', async ({ cabins, summary, flexibility }) => {
  const trips = deferred<Response>()
  mockAirportCatalog()
  vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockResolvedValueOnce(Response.json({ message: null, results: [{
      availability_id: 'award-1', airline: 'AA', cabin: 'economy', cash_fees_usd: 0, cents_per_point: null,
      departure_date: draft.departureDate, origin: draft.origin, destination: draft.destination,
      points_cost: 12500, program: 'American AAdvantage', seats_available: 2,
    }] })).mockReturnValueOnce(trips.promise)
  render(<App />)
  expect(screen.getByRole('form', { name: 'Enter trip details' }))
    .toHaveAccessibleDescription('One-way awards on an exact date or within a departure range.')
  expect(screen.queryByLabelText('Trip type')).not.toBeInTheDocument()
  expect(screen.queryByText(/round.trip/i)).not.toBeInTheDocument()
  expect(screen.getByLabelText('Departure date')).toHaveAttribute('type', 'date')
  expect(screen.getByRole('combobox', { name: 'Date flexibility' })).toHaveValue('exact')
  expect(screen.getByRole('option', { name: /±\s*180d/ })).toBeInTheDocument()
  await submitForm(cabins, flexibility)
  const retry = await screen.findByRole('button', { name: 'Retry' })
  expect(JSON.parse(String(vi.mocked(fetch).mock.calls[1][1]?.body))).toEqual({
    origin: 'JFK', destination: 'SEA', departure_date: draft.departureDate,
    ...(flexibility === 'custom' ? { departure_date_end: '2026-12-07' } : {}),
    passengers: 2, ...(cabins.length ? { cabins: ['economy', 'business'] } : {}),
  })
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
  fireEvent.click(retry)
  const row = await screen.findByRole('row', { name: /American AAdvantage/ })
  expect(vi.mocked(fetch).mock.calls[2][1]?.body).toBe(vi.mocked(fetch).mock.calls[1][1]?.body)
  expect(row).toHaveTextContent('Minimum fees: $0.00 USD')
  expect(screen.getByRole('region', { name: 'Current trip' })).toHaveTextContent(summary)
  if (flexibility === 'custom') expect(screen.getByRole('region', { name: 'Current trip' })).toHaveTextContent('Mon, Dec 7')
  fireEvent.click(within(row).getByRole('button', { name: 'View trips' }))
  expect(vi.mocked(fetch).mock.calls.map(([url]) => url)).toEqual([
    '/api/airports', '/api/search', '/api/search', '/api/availability/award-1/trips',
  ])
  const tripSignal = vi.mocked(fetch).mock.calls[3][1]?.signal
  fireEvent.click(screen.getByRole('button', { name: 'New trip' }))
  expect(tripSignal?.aborted).toBe(true)
  expect(screen.getByRole('combobox', { name: 'Date flexibility' })).toHaveValue('exact')
  expect(screen.queryByLabelText('Latest departure')).not.toBeInTheDocument()
  await act(async () => trips.resolve(Response.json({ availability_id: 'award-1', trips: [], booking_links: [] })))
  expect(screen.queryByRole('region', { name: 'Award search results' })).not.toBeInTheDocument()
})

it.each(['', '2026-11-30', '2027-11-12'])('retains invalid custom end %s and focuses its error without searching', async (end) => {
  mockAirportCatalog()
  render(<App />)
  await submitForm([], 'custom', end)
  const latest = screen.getByLabelText('Latest departure')
  expect(latest).toHaveValue(end)
  expect(latest).toHaveAttribute('aria-invalid', 'true')
  expect(latest).toHaveFocus()
  expect(fetch).toHaveBeenCalledExactlyOnceWith('/api/airports')
})
