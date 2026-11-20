import { act, fireEvent, render, renderHook, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import App from './App'
import useChatJourney from './useChatJourney'
import { validateChatResponse } from './services/chat-response'
import { captureChatRequest } from './services/chat-context'
import type { SearchTurn } from './useChatJourney'
import { mockAirportCatalog } from './test-airports'

const criteria = { origin: 'JFK', destination: 'SEA', departure_date: '2026-12-01', passengers: 2, cabins: ['business'] }
const empty = { reply: 'No matching cached awards.', results: [], status: 'empty', criteria,
  missing_fields: [], failure: null, searches: [{ criteria, status: 'empty', results: [], message: 'No matches.', failure: null }] }
const clarification = { ...empty, reply: 'Where and when would you like to fly?', status: 'clarification',
  criteria: null, searches: [], missing_fields: ['origin', 'destination', 'departure date'] }
const failure = { ...empty, reply: 'The assistant took too long.', status: 'failed', searches: [],
  failure: { code: 'timeout', retryable: true } }
function requestBody(index = -1) {
  return JSON.parse(String(vi.mocked(fetch).mock.calls.at(index)?.[1]?.body))
}
function send(message: string, initial = false) {
  fireEvent.change(screen.getByRole('textbox', { name: initial ? 'Your trip request' : 'Continue your search' }), { target: { value: message } })
  fireEvent.click(screen.getByRole('button', { name: 'Send request' }))
}

describe('contextual chat', () => {
  it('sends accepted history and normalized criteria, keeps retry context, and clears both on New trip', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(empty)).mockResolvedValueOnce(Response.json(failure))
      .mockResolvedValueOnce(Response.json(clarification)).mockResolvedValueOnce(Response.json(empty))
      .mockResolvedValueOnce(Response.json(clarification))
    const { result } = renderHook(useChatJourney)
    async function submit(message: string) {
      act(() => result.current.setDraft((draft) => ({ ...draft, message })))
      await act(async () => result.current.submit('chat'))
    }
    await submit('JFK to SEA December 1, 2026, 2 adults business')
    expect(result.current.draft).toMatchObject({ originCodes: ['JFK'], destinationCodes: ['SEA'], adults: '2', cabins: ['Business'] })
    await submit('Try December 2')
    const captured = requestBody()
    expect(captured.context).toEqual(criteria)
    expect(captured.history.map((item: { role: string }) => item.role)).toEqual(['user', 'assistant'])
    expect(result.current.turns[1].status).toBe('failed')
    expect(result.current.draft.message).toBe('Try December 2')
    const failed = result.current.turns[1]
    await submit('Another question')
    expect(requestBody().history).toEqual(captured.history)
    await act(async () => result.current.retry(failed))
    expect(requestBody()).toEqual(captured)
    expect(result.current.turns).toHaveLength(3)
    act(() => result.current.reset())
    await submit('Start over')
    expect(requestBody()).toEqual({ message: 'Start over' })
  })

  it('carries a form airport set, date range and selected cabins into a chat follow-up', async () => {
    mockAirportCatalog()
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ message: 'No matches.', results: [] }))
      .mockResolvedValueOnce(Response.json(clarification))
    const { result } = renderHook(useChatJourney)
    await act(async () => result.current.loadAirports())
    act(() => result.current.setDraft({ message: '', origin: '', destination: '', originCodes: ['JFK', 'LGA'], destinationCodes: ['SEA'],
      departureDate: '2026-12-01', departureFlex: 'custom', departureDateEnd: '2026-12-03', adults: '2', cabins: ['Business', 'First'] }))
    await act(async () => result.current.submit('form'))
    const form = requestBody()
    act(() => result.current.setDraft((draft) => ({ ...draft, message: 'Make that 3 adults' })))
    await act(async () => result.current.submit('chat'))
    expect(requestBody().context).toEqual(form)
    expect(requestBody().history[0].content).toContain('JFK, LGA to SEA')
    expect(requestBody().history[1].content).toBe('No matches.')
  })

  it('bounds history to 20 messages and excludes failed and canceled attempts', () => {
    const turns: SearchTurn[] = Array.from({ length: 15 }, (_, id) => ({ id, source: 'chat', request: `Request ${id}`,
      payload: { message: `Request ${id}` }, status: 'success', response: { reply: `Reply ${id}`, results: [] } }))
    turns.push({ ...turns[0], id: 15, status: 'failed' }, { ...turns[0], id: 16, status: 'canceled' })
    const payload = captureChatRequest('Next', turns)
    expect(payload.history).toHaveLength(20)
    expect(payload.history?.[0]).toEqual({ role: 'user', content: 'Request 5' })
    expect(Object.isFrozen(payload.history)).toBe(true)
  })

  it('renders all clarification fields without claiming a search or no availability', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(clarification))
    render(<App />)
    send('Find a trip', true)
    expect(await screen.findByText('Where and when would you like to fly?')).toBeVisible()
    expect(screen.getByText('Details to resolve: origin, destination, departure date.')).toBeVisible()
    expect(screen.queryByRole('region', { name: 'Award search results' })).not.toBeInTheDocument()
    expect(screen.queryByText('No award options were returned.')).not.toBeInTheDocument()
  })

  it('confirms captured criteria exactly once and labels a real empty search', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ ...empty, status: 'confirmation', searches: [], reply: 'Please confirm the date and airports.' }))
      .mockResolvedValueOnce(Response.json(empty))
    render(<App />)
    send('New York to Seattle December 1', true)
    const confirm = await screen.findByRole('button', { name: 'Confirm and search' })
    expect(fetch).toHaveBeenCalledTimes(1)
    fireEvent.click(confirm)
    fireEvent.click(confirm)
    await screen.findByText('No award options were returned.')
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(requestBody()).toMatchObject({ confirmed: true, context: criteria })
    expect(screen.queryByRole('button', { name: 'Confirm and search' })).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Current trip' })).toHaveTextContent('2 adults')
  })

  it('does not trust an unconfirmed proposal as context for an ordinary follow-up', async () => {
    const proposal = { ...empty, status: 'confirmation', searches: [], reply: 'Please confirm.' }
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(proposal)).mockResolvedValueOnce(Response.json(proposal))
    render(<App />)
    send('New York to Seattle December 1', true)
    await screen.findByRole('button', { name: 'Confirm and search' })
    send('Make that 3 adults')
    await screen.findByRole('button', { name: 'Confirm and search' })
    expect(requestBody()).not.toHaveProperty('context')
    expect(requestBody()).not.toHaveProperty('confirmed')
  })

  it('retains validated criteria from a failed search for the next refinement', async () => {
    const nextCriteria = { ...criteria, departure_date: '2026-12-03' }
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(empty)).mockResolvedValueOnce(Response.json({ ...failure,
      criteria: nextCriteria, searches: [{ ...empty.searches[0], criteria: nextCriteria, status: 'failed', failure: failure.failure }],
    })).mockResolvedValueOnce(Response.json(clarification))
    render(<App />)
    send('JFK to SEA 2026-12-01', true)
    await screen.findByText('No award options were returned.')
    send('Try December 3, 2026')
    await screen.findByRole('button', { name: 'Retry' })
    send('Try economy')
    await screen.findByText('Where and when would you like to fly?')
    expect(requestBody().context).toEqual(nextCriteria)
  })

  it('distinguishes an HTTP-200 failure and preserves the draft with retry eligibility', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(failure)).mockResolvedValueOnce(Response.json({
      ...failure, failure: { code: 'not_configured', retryable: false },
    }))
    render(<App />)
    send('Search for my trip', true)
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }))
    await screen.findByText('Request failed. This does not mean no awards exist.')
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Continue your search' })).toHaveValue('Search for my trip')
    expect(screen.queryByText('No award options were returned.')).not.toBeInTheDocument()
  })

  it('attributes successful, empty and failed searches separately within a partial turn', async () => {
    const offer = { airline: 'AA', cabin: 'business', cash_fees_usd: null, cents_per_point: null, departure_date: '2026-12-01',
      destination: 'SEA', origin: 'JFK', points_cost: 25000, program: 'American AAdvantage', seats_available: 2 }
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ ...empty, status: 'partial', results: [offer], partial: true,
      failure: failure.failure, searches: [
        { ...empty.searches[0], status: 'results', results: [offer] },
        { ...empty.searches[0], criteria: { ...criteria, departure_date: '2026-12-02' } },
        { ...empty.searches[0], criteria: { ...criteria, departure_date: '2026-12-03' }, status: 'failed', message: 'Provider timed out.', failure: failure.failure },
      ] })).mockResolvedValueOnce(Response.json(empty))
    render(<App />)
    send('Compare three dates', true)
    await screen.findByRole('table')
    expect(within(screen.getByRole('region', { name: 'Search details 1' })).getByRole('table')).toBeVisible()
    expect(screen.getByRole('region', { name: 'Search details 2' })).toHaveTextContent('2026-12-02')
    expect(screen.getByRole('region', { name: 'Search details 3' })).toHaveTextContent('Provider timed out.')
    fireEvent.click(screen.getByRole('button', { name: 'Retry this search' }))
    await screen.findByRole('region', { name: 'Search 2' })
    expect(requestBody()).toMatchObject({ confirmed: true, context: { ...criteria, departure_date: '2026-12-03' } })
    expect(screen.getAllByRole('table')).toHaveLength(1)
    expect(screen.getByRole('region', { name: 'Search 1' })).toHaveTextContent('Provider timed out.')
  })

  it.each([
    { status: 'invented' }, { status: 'confirmation', criteria: null }, { status: 'failed', failure: null },
    { criteria: { ...criteria, passengers: 10 } }, { criteria: { ...criteria, departure_date: '2026-02-30' } },
    { criteria: { ...criteria, destination: 'JFK' } }, { missing_fields: [7] }, { searches: [{}] },
  ])('rejects malformed structured outcomes %j', (overrides) => {
    expect(() => validateChatResponse({ ...empty, ...overrides })).toThrow('Invalid response')
  })
})
