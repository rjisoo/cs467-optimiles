import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import AvailabilityResults from './AvailabilityResults'
import TripDetails from './TripDetails'
import type { ChatResult } from '../services/chat-response'
import type { FlightTrip, TripDetailsResponse } from '../services/trip-details'

const award: ChatResult = {
  availability_id: 'provider-1', airline: 'AA', cabin: 'economy', cash_fees_usd: 11.2,
  cents_per_point: null, departure_date: '2026-12-01', destination: 'SEA', origin: 'JFK',
  points_cost: 12500, program: 'American AAdvantage', seats_available: 2,
}
const trip = (overrides: Partial<FlightTrip> = {}): FlightTrip => ({
  trip_id: 'flight-1', availability_id: 'provider-1', source: 'american', cabin: 'economy',
  points: 15000, cash_fees_usd: 5.6, taxes_minor: 560, taxes_currency: 'USD', reported_seats: 2,
  departs_at_local: '2026-12-01T09:00:00', arrives_at_local: '2026-12-01T12:10:00',
  duration_minutes: 370, stops: 0, carriers: ['AA'], provider_updated_at: null,
  carrier_names: ['American Airlines'],
  flight_numbers: ['AA123'], segments: [], ...overrides,
})
const details = (trips: FlightTrip[] = [trip()]): TripDetailsResponse => ({
  availability_id: 'provider-1', booking_links: [], trips,
})
const renderResults = () => render(<AvailabilityResults searchId="one" response={{ reply: '', results: [award] }} />)

describe('live trip expansion', () => {
  it('rates matched trips, excludes unknown fees, and opens the calculation without expanding the flight', async () => {
    const user = userEvent.setup()
    const pricedAward = { ...award, source: 'american', search_passengers: 1,
      points_cost: 15000, cash_fare_usd: 245.6, cents_per_point: 9.99 }
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(details([
      trip({ is_mixed_cabin: false }),
      trip({ is_mixed_cabin: false }),
      trip({ trip_id: 'second', flight_numbers: ['AA124'], points: 16000, is_mixed_cabin: false }),
      trip({ trip_id: 'fair', flight_numbers: ['AA125'], points: 20000, is_mixed_cabin: false }),
      trip({ trip_id: 'unknown', flight_numbers: ['AA126'], points: 18000, taxes_minor: null,
        cash_fees_usd: 0, is_mixed_cabin: false }),
    ])))
    render(<AvailabilityResults searchId="value" response={{ reply: '', results: [pricedAward] }} />)
    expect(screen.queryByRole('region', { name: 'Award highlights' })).not.toBeInTheDocument()
    expect(screen.queryByText(/9.99/)).not.toBeInTheDocument()
    expect(screen.getByText('Est. cash fare: $245.60 USD / person')).toBeVisible()
    expect(fetch).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'View Economy trips for 15,000 points' }))
    const bestTrip = await screen.findByRole('article', { name: 'Flight AA123' })
    expect(bestTrip).toHaveTextContent('1.60¢ / pt')
    expect(bestTrip).toHaveTextContent('Good')
    expect(bestTrip).toHaveTextContent('Best value')
    expect(screen.getByRole('article', { name: 'Flight AA125' })).toHaveTextContent('Fair')
    const unknown = screen.getByRole('article', { name: 'Flight AA126' })
    expect(unknown).not.toHaveTextContent('Value unavailable')
    expect(unknown).not.toHaveTextContent('¢')
    expect(unknown).not.toHaveTextContent('$0.00')
    const highlights = within(screen.getByRole('region', { name: 'Award highlights' }))
    expect(highlights.getByRole('button', { name: /Best estimated value/ })).toHaveTextContent('3 eligible loaded trips')
    const summary = screen.getByRole('row', { name: 'Tue, Dec 1 American AAdvantage' })
    expect(summary).toHaveTextContent('Est. 1.60¢ / pt')
    expect(summary).toHaveTextContent('Minimum fees: $11.20 USD')
    const explanationTrigger = within(bestTrip).getByRole('button', { name: /estimated 1.60 cents per point/ })
    explanationTrigger.focus()
    await user.keyboard('{Enter}')
    const explanation = screen.getByRole('dialog', { name: 'How estimated value is calculated' })
    expect(explanation).toHaveTextContent('($245.60 − $5.60) ÷ 15,000 × 100')
    expect(explanation).toHaveTextContent('It may be a different flight.')
    await user.click(within(explanation).getByText('This trip’s award fees'))
    expect(within(bestTrip).getByRole('button', { name: 'Show flight details for AA123' })).toHaveAttribute('aria-expanded', 'false')
    await user.keyboard('{Escape}')
    expect(explanationTrigger).toHaveFocus()
    await user.click(within(summary).getByRole('button', { name: /estimated 1.60 cents per point/ }))
    await user.click(within(screen.getByRole('dialog')).getByText('Estimated cash fare'))
    expect(bestTrip).toBeVisible()
    await user.keyboard('{Escape}')
    await user.selectOptions(screen.getByLabelText('Sort trips'), 'value')
    expect(screen.getAllByRole('article').map((element) => element.getAttribute('aria-label')))
      .toEqual(['Flight AA123', 'Flight AA124', 'Flight AA125', 'Flight AA126'])
    await user.click(highlights.getByRole('button', { name: /Best estimated value/ }))
    expect(screen.getAllByRole('article')).toHaveLength(1)
    expect(screen.getByRole('article', { name: 'Flight AA123' })).toBeVisible()
    await user.click(highlights.getByRole('button', { name: /Best estimated value/ }))
    expect(screen.getAllByRole('article')).toHaveLength(4)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('keeps off-page ties in comparisons and updates winners when another program loads', async () => {
    const user = userEvent.setup()
    const first = { ...award, source: 'american', search_passengers: 1, points_cost: 15000, cash_fare_usd: 245.6 }
    const second = { ...first, availability_id: 'provider-2', source: 'united', program: 'United MileagePlus', points_cost: 12000 }
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(details(Array.from({ length: 6 }, (_, index) => trip({
      trip_id: `tie-${index}`, flight_numbers: [`AA${index}`], is_mixed_cabin: false,
    })))))
      .mockResolvedValueOnce(Response.json({ ...details(), availability_id: 'provider-2', trips: [trip({
        availability_id: 'provider-2', source: 'united', trip_id: 'winner', points: 12000,
        flight_numbers: ['UA1'], is_mixed_cabin: false,
      })] }))
    const view = render(<AvailabilityResults searchId="one" response={{ reply: '', results: [first, second] }} />)
    await user.click(within(screen.getByRole('row', { name: 'Tue, Dec 1 American AAdvantage' })).getByRole('button', { name: 'View trips' }))
    expect(await screen.findAllByText('Best value', { exact: true })).toHaveLength(5)
    const pager = within(screen.getByRole('navigation', { name: 'Trip pagination' }))
    await user.click(pager.getByRole('button', { name: 'Next' }))
    expect(screen.getByRole('article', { name: 'Flight AA5' })).toHaveTextContent('Best value')
    const highlights = screen.getByRole('region', { name: 'Award highlights' })
    expect(highlights).toHaveTextContent('6 eligible loaded trips')
    await user.click(within(screen.getByRole('row', { name: 'Tue, Dec 1 United MileagePlus' })).getByRole('button', { name: 'View trips' }))
    expect(await screen.findByRole('article', { name: 'Flight UA1' })).toHaveTextContent('Best value')
    expect(highlights).toHaveTextContent('2.00¢ / pt')
    await user.click(within(screen.getByRole('row', { name: 'Tue, Dec 1 American AAdvantage' })).getByRole('button', { name: 'View trips' }))
    expect(screen.queryByText('Best value', { exact: true })).not.toBeInTheDocument()
    expect(fetch).toHaveBeenCalledTimes(2)
    view.rerender(<AvailabilityResults searchId="two" response={{ reply: '', results: [first, second] }} />)
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Award highlights' })).not.toBeInTheDocument()
  })

  it('follows cabin and date filters across every loaded comparison without another dropdown', async () => {
    const user = userEvent.setup()
    const first = { ...award, source: 'american', search_passengers: 1, points_cost: 15000, cash_fare_usd: 245.6 }
    const second = { ...first, availability_id: 'provider-2', departure_date: '2026-12-02', points_cost: 12000, cash_fare_usd: 365.6 }
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(details([
      trip({ is_mixed_cabin: false }),
      trip({ trip_id: 'second', flight_numbers: ['AA124'], points: 16000, is_mixed_cabin: false }),
      trip({ trip_id: 'business', flight_numbers: ['AA131'], cabin: 'business', points: 40000, is_mixed_cabin: false }),
      trip({ trip_id: 'business-second', flight_numbers: ['AA132'], cabin: 'business', points: 50000, is_mixed_cabin: false }),
    ]))).mockResolvedValueOnce(Response.json({ availability_id: 'provider-2', booking_links: [], trips: [
      trip({ availability_id: 'provider-2', trip_id: 'next-day', points: 12000, is_mixed_cabin: false,
        flight_numbers: ['AA201'], departs_at_local: '2026-12-02T09:00:00' }),
      trip({ availability_id: 'provider-2', trip_id: 'next-day-second', points: 18000, is_mixed_cabin: false,
        flight_numbers: ['AA202'], departs_at_local: '2026-12-02T10:00:00' }),
    ] }))
    render(<AvailabilityResults searchId="filters" response={{ reply: '', results: [
      first, { ...first, cabin: 'business', points_cost: 40000, cash_fare_usd: 805.6 }, second,
    ] }} />)
    await user.click(within(screen.getByRole('row', { name: 'Tue, Dec 1 American AAdvantage' })).getByRole('button', { name: 'View trips' }))
    await screen.findByRole('article', { name: 'Flight AA123' })
    await user.click(within(screen.getByRole('row', { name: 'Wed, Dec 2 American AAdvantage' })).getByRole('button', { name: 'View trips' }))
    await screen.findByRole('article', { name: 'Flight AA201' })
    const highlights = within(screen.getByRole('region', { name: 'Award highlights' }))
    expect(screen.queryByLabelText('Compare value for')).not.toBeInTheDocument()
    expect(highlights.getByRole('button', { name: /Best estimated value/ })).toHaveTextContent('3.00¢ / pt')
    expect(highlights.getByRole('button', { name: /Best estimated value/ })).not.toHaveTextContent('1.60')
    expect(highlights.getByRole('button', { name: /Lowest points/ })).toHaveTextContent('12,000 pts')
    expect(highlights.getByRole('button', { name: /Lowest points/ })).not.toHaveTextContent('40,000')
    await user.click(highlights.getByRole('button', { name: /Best estimated value/ }))
    expect(screen.queryByRole('row', { name: 'Tue, Dec 1 American AAdvantage' })).not.toBeInTheDocument()
    expect(screen.getByRole('row', { name: 'Wed, Dec 2 American AAdvantage' })).toBeVisible()
    expect(screen.getAllByRole('article')).toHaveLength(1)
    expect(screen.getByRole('article', { name: 'Flight AA201' })).toHaveTextContent('Best value')
    await user.click(highlights.getByRole('button', { name: /Lowest points/ }))
    expect(screen.getAllByRole('article')).toHaveLength(1)
    expect(screen.getByRole('article', { name: 'Flight AA201' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: /Cabins:/ }))
    await user.click(screen.getByRole('checkbox', { name: 'Business' }))
    await user.keyboard('{Escape}')
    expect(highlights.getByRole('button', { name: /Lowest points/ })).toHaveTextContent('12,000 pts')
    await user.click(screen.getByRole('button', { name: /Dates:/ }))
    await user.click(screen.getByRole('checkbox', { name: 'Wed, Dec 2' }))
    await user.keyboard('{Escape}')
    expect(highlights.getByRole('button', { name: /Best estimated value/ })).toHaveTextContent('1.60¢ / pt')
    expect(highlights.getByRole('button', { name: /Lowest points/ })).toHaveTextContent('15,000 pts')
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('opens the clicked cabin and switches an open row without refetching, including keyboard activation', async () => {
    const user = userEvent.setup()
    const cabinOffers = [
      { cabin: 'economy', label: 'Economy', points: 12500 },
      { cabin: 'premium_economy', label: 'Premium economy', points: 20000 },
      { cabin: 'business', label: 'Business', points: 40000 },
      { cabin: 'first', label: 'First', points: 60000 },
    ] as const
    vi.mocked(fetch).mockResolvedValue(Response.json(details(cabinOffers.map(({ cabin }) => trip({
      cabin, trip_id: cabin, flight_numbers: [cabin],
    })))))
    render(<AvailabilityResults searchId="cabins" response={{ reply: '', results: cabinOffers.map(({ cabin, points }) => ({
      ...award, cabin, points_cost: points,
    })) }} />)
    const businessPrice = screen.getByRole('button', { name: 'View Business trips for 40,000 points' })
    await user.click(businessPrice)
    expect(await screen.findByRole('tab', { name: 'Business' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('article', { name: 'Flight business' })).toBeVisible()
    await user.click(screen.getByRole('tab', { name: 'Economy' }))
    await user.click(businessPrice)
    expect(screen.getByRole('tab', { name: 'Business' })).toHaveAttribute('aria-selected', 'true')
    for (const { label, points } of cabinOffers) {
      const price = screen.getByRole('button', { name: `View ${label} trips for ${points.toLocaleString('en-US')} points` })
      price.focus()
      await user.keyboard(label === 'First' ? ' ' : '{Enter}')
      expect(screen.getByRole('tab', { name: label })).toHaveAttribute('aria-selected', 'true')
      expect(price).toHaveFocus()
      expect(screen.getByRole('button', { name: 'Hide trips' })).toHaveAttribute('aria-expanded', 'true')
    }
    await user.click(screen.getByRole('button', { name: 'Hide trips' }))
    await user.click(businessPrice)
    expect(screen.getByRole('tab', { name: 'Business' })).toHaveAttribute('aria-selected', 'true')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('keeps the latest clicked cabin while a shared trip request is pending', async () => {
    const user = userEvent.setup()
    let resolve!: (value: Response) => void
    vi.mocked(fetch).mockReturnValueOnce(new Promise((done) => { resolve = done }))
    render(<AvailabilityResults searchId="pending" response={{ reply: '', results: [
      award, { ...award, cabin: 'business', points_cost: 40000 },
    ] }} />)
    await user.click(screen.getByRole('button', { name: 'View Economy trips for 12,500 points' }))
    await user.click(screen.getByRole('button', { name: 'View Business trips for 40,000 points' }))
    expect(fetch).toHaveBeenCalledTimes(1)
    await act(async () => resolve(Response.json(details([trip(), trip({ cabin: 'business' })]))))
    expect(screen.getByRole('tab', { name: 'Business' })).toHaveAttribute('aria-selected', 'true')
  })

  it('loads a shared record once for grouped cabins and starts with the sorted cabin', async () => {
    const user = userEvent.setup()
    vi.mocked(fetch).mockResolvedValue(Response.json(details([
      trip(), trip({ trip_id: 'business-1', cabin: 'business', flight_numbers: ['AA456'] }),
    ])))
    render(<AvailabilityResults searchId="grouped" response={{ reply: '', results: [
      award, { ...award, cabin: 'business', points_cost: 40000 },
    ] }} />)
    await user.click(screen.getByRole('button', { name: 'Sort by Business points' }))
    await user.click(screen.getByRole('button', { name: 'View trips' }))
    expect(await screen.findByRole('article', { name: 'Flight AA456' })).toBeVisible()
    await user.click(screen.getByRole('tab', { name: 'Economy' }))
    expect(screen.getByRole('article', { name: 'Flight AA123' })).toBeVisible()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('combines trips from every grouped record and retries only failed loads', async () => {
    const user = userEvent.setup()
    const booking = { label: 'Book with program', url: 'https://www.aa.com/', primary: true }
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ ...details(), booking_links: [booking] }))
      .mockResolvedValueOnce(new Response(null, { status: 502 }))
      .mockResolvedValueOnce(Response.json({ availability_id: 'provider-2', booking_links: [booking], trips: [
        trip({ availability_id: 'provider-2', trip_id: 'business-2', cabin: 'business', flight_numbers: ['AA456'] }),
      ] }))
    render(<AvailabilityResults searchId="grouped" response={{ reply: '', results: [
      award, { ...award }, { ...award, availability_id: 'provider-2', cabin: 'business', points_cost: 40000 },
    ] }} />)
    await user.click(screen.getByRole('button', { name: 'View trips' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('HTTP 502')
    await user.click(screen.getByRole('button', { name: 'Retry trip details' }))
    expect(await screen.findByRole('article', { name: 'Flight AA123' })).toBeVisible()
    await user.click(screen.getByRole('tab', { name: 'Business' }))
    expect(screen.getByRole('article', { name: 'Flight AA456' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Booking' }))
    expect(screen.getAllByRole('link', { name: 'Book with program' })).toHaveLength(1)
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'Hide trips' }))
    await user.click(screen.getByRole('button', { name: 'View trips' }))
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(vi.mocked(fetch).mock.calls.map(([url]) => url)).toEqual([
      '/api/availability/provider-1/trips', '/api/availability/provider-2/trips', '/api/availability/provider-2/trips',
    ])
  })

  it('loads by supplied ID on keyboard expansion, keeps the summary, and reuses pending/successful details', async () => {
    const user = userEvent.setup()
    let resolve!: (value: Response) => void
    vi.mocked(fetch).mockReturnValueOnce(new Promise((done) => { resolve = done }))
    renderResults()
    expect(fetch).not.toHaveBeenCalled()
    const trigger = screen.getByRole('button', { name: 'View trips' })
    trigger.focus()
    await user.keyboard('{Enter}')
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(document.getElementById(trigger.getAttribute('aria-controls')!)).toHaveTextContent('Loading trip details')
    expect(fetch).toHaveBeenCalledWith('/api/availability/provider-1/trips', expect.objectContaining({ signal: expect.any(AbortSignal) }))
    await user.click(screen.getByRole('button', { name: 'Hide trips' }))
    await user.click(screen.getByRole('button', { name: 'View trips' }))
    expect(fetch).toHaveBeenCalledTimes(1)
    await act(async () => resolve(Response.json(details())))
    expect(await screen.findByRole('article', { name: 'Flight AA123' })).toBeVisible()
    expect(screen.getByText('From 12,500 pts')).toBeVisible()
    expect(screen.getByRole('article', { name: 'Flight AA123' })).toHaveTextContent('15,000 pts')
    await user.click(screen.getByRole('button', { name: 'Hide trips' }))
    await user.click(screen.getByRole('button', { name: 'View trips' }))
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('retries a failed expansion and caches an empty response', async () => {
    const user = userEvent.setup()
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 502 }))
      .mockResolvedValueOnce(Response.json(details([])))
    renderResults()
    await user.click(screen.getByRole('button', { name: 'View trips' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('HTTP 502')
    await user.click(screen.getByRole('button', { name: 'Retry trip details' }))
    expect(await screen.findByText('No economy trips were returned for this availability.')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Hide trips' }))
    await user.click(screen.getByRole('button', { name: 'View trips' }))
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('combines carrier names and segment schedules in one table with the requested columns', async () => {
    const user = userEvent.setup()
    const response = details([trip({ taxes_minor: 0, cash_fees_usd: 0, reported_seats: 0, carriers: ['AA', 'AA'],
      provider_updated_at: '2026-11-02T19:38:11.562677Z', segments: [{
      flight_number: 'AA123', origin_airport: 'JFK', destination_airport: 'SEA',
      carrier: 'AA', carrier_name: 'American Airlines',
      departs_at_local: null, arrives_at_local: null,
    }] }), trip({ trip_id: 'unknown', cash_fees_usd: null, points: null, reported_seats: null }),
      trip({ trip_id: 'default-currency', taxes_currency: null })])
    render(<TripDetails response={response} cabin="economy" />)
    expect(screen.getByText('$0.00 USD fees')).toBeVisible()
    expect(screen.queryByText('$5.60 USD fees')).not.toBeInTheDocument()
    expect(screen.getAllByText('USD fees unavailable')).toHaveLength(2)
    expect(screen.queryByText(/minor units|currency not reported|Times are shown as reported/)).not.toBeInTheDocument()
    expect(screen.getByText('Points not reported')).toBeVisible()
    expect(screen.getAllByText('09:00')[0]).toHaveAttribute('datetime', '2026-12-01T09:00:00')
    const flight = screen.getAllByRole('article', { name: 'Flight AA123' })[0]
    const toggle = within(flight).getByRole('button', { name: 'Show flight details for AA123' })
    toggle.focus()
    await user.keyboard('{Enter}')
    expect(toggle).toHaveFocus()
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    const table = within(flight).getByRole('table', { name: 'Trip details' })
    expect(within(flight).getAllByRole('table')).toHaveLength(1)
    expect(within(table).getAllByRole('columnheader').map((cell) => cell.textContent))
      .toEqual(['Route', 'Carrier', 'Flight', 'Departure', 'Arrival', 'Last Updated'])
    expect(within(table).getByRole('cell', { name: 'American Airlines' })).toBeVisible()
    expect(within(table).getAllByRole('cell', { name: 'Not reported' })).toHaveLength(2)
    expect(table.querySelector('time')).toHaveAttribute('datetime', '2026-11-02T19:38:11.562677Z')
    expect(table).not.toHaveTextContent('Z')
    await user.keyboard('{Enter}')
    expect(table).not.toBeVisible()
  })

  it('shows airline names and a compact next-day badge with a trip fallback when segments are absent', async () => {
    const user = userEvent.setup()
    render(<TripDetails response={details([trip({ carriers: ['AS'], carrier_names: ['Alaska Airlines'],
      departs_at_local: '2026-12-06T22:05:00', arrives_at_local: '2026-12-07T06:30:00',
      flight_numbers: ['AS16'], duration_minutes: 325 })])} cabin="economy" route="SEA → JFK" />)
    expect(screen.getAllByText('Alaska Airlines')[0]).toBeVisible()
    expect(screen.getByLabelText('Arrival 1 day later')).toHaveTextContent('+1')
    expect(screen.queryByText('2026-12-07')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show flight details for AS16' }))
    const table = screen.getByRole('table', { name: 'Trip details' })
    expect(within(table).getByRole('rowheader')).toHaveTextContent('SEA → JFK')
    expect(within(table).getByRole('cell', { name: 'Alaska Airlines' })).toBeVisible()
    expect(table).toHaveTextContent('2026-12-06 22:05')
    expect(table).toHaveTextContent('2026-12-07 06:30')
  })

  it('opens safe booking options in a keyboard-accessible dialog and restores focus', async () => {
    const user = userEvent.setup()
    const response = details()
    response.booking_links = [
      { label: 'Book with program', url: 'https://www.aa.com/', primary: true },
      { label: 'Unsafe link', url: 'javascript:alert(1)', primary: false },
    ]
    render(<TripDetails response={response} cabin="economy" />)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    const booking = screen.getByRole('button', { name: 'Booking' })
    booking.focus()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('dialog', { name: 'Booking options' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Book with program' })).toHaveAttribute('href', 'https://www.aa.com/')
    expect(screen.queryByRole('link', { name: 'Unsafe link' })).not.toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(booking).toHaveFocus()
  })

  it('filters to the row cabin, pages all trips and resets pagination when sorting', async () => {
    const user = userEvent.setup()
    const trips = Array.from({ length: 6 }, (_, index) => trip({ trip_id: String(index),
      flight_numbers: [`AA${index}`], points: 6000 - index * 1000, duration_minutes: 100 + index }))
    render(<TripDetails response={details([...trips, trip({ cabin: 'business', flight_numbers: ['BUSINESS'] })])} cabin="economy" />)
    expect(screen.getByText('Economy trips · 6 returned')).toBeVisible()
    expect(screen.queryByRole('article', { name: 'Flight BUSINESS' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Sort trips')).toHaveValue('points')
    expect(screen.getAllByRole('article')[0]).toHaveAccessibleName('Flight AA5')
    expect(screen.queryByRole('article', { name: 'Flight AA0' })).not.toBeInTheDocument()
    const pager = within(screen.getByRole('navigation', { name: 'Trip pagination' }))
    await user.click(pager.getByRole('button', { name: 'Next' }))
    expect(screen.getByRole('article', { name: 'Flight AA0' })).toBeVisible()
    expect(screen.queryByRole('article', { name: 'Flight AA5' })).not.toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Sort trips'), 'reported')
    expect(pager.getByRole('button', { name: 'Previous' })).toBeDisabled()
    await user.selectOptions(screen.getByLabelText('Sort trips'), 'points')
    expect(screen.queryByRole('article', { name: 'Flight AA0' })).not.toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Sort trips'), 'duration')
    expect(screen.getByRole('article', { name: 'Flight AA0' })).toBeVisible()
    expect(screen.queryByRole('article', { name: 'Flight AA5' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Business' }))
    expect(screen.getByText('Business trips · 1 returned')).toBeVisible()
    expect(screen.getByRole('article', { name: 'Flight BUSINESS' })).toBeVisible()
    expect(screen.queryByRole('article', { name: 'Flight AA0' })).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'First' })).toBeDisabled()
    await user.click(screen.getByRole('tab', { name: 'Economy' }))
    expect(screen.getByRole('article', { name: 'Flight AA0' })).toBeVisible()
  })
})
