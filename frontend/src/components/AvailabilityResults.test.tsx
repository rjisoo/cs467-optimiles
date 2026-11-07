import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import AvailabilityResults from './AvailabilityResults'
import type { ChatResponse, ChatResult } from '../services/chat-response'

function result(overrides: Partial<ChatResult> = {}): ChatResult {
  return { airline: 'AA, AS', cabin: 'economy', cash_fees_usd: 11.2, cents_per_point: null,
    departure_date: '2026-12-01', destination: 'SEA', origin: 'JFK', points_cost: 12500,
    program: 'American AAdvantage', seats_available: 2, ...overrides }
}
function response(results: ChatResult[]): ChatResponse { return { reply: 'Returned awards', results } }
const rows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1)

describe('returned award options', () => {
  it('shows supplied fields and null/zero values without expanding rows that lack provider IDs', async () => {
    const user = userEvent.setup()
    const fetch = vi.spyOn(globalThis, 'fetch')
    render(<AvailabilityResults searchId="one" response={response([
      result(), result({ program: 'Zero fare', points_cost: 0, cash_fees_usd: 0, cents_per_point: 0, seats_available: 0 }),
      result({ program: 'Unreported', cash_fees_usd: null, seats_available: null }),
      result({ program: 'Reported value', cents_per_point: 2.75 }),
    ])} message={<p>Reply from the service</p>} />)
    expect(screen.getByRole('region', { name: 'Assistant message' })).toHaveTextContent('Reply from the service')
    const american = screen.getByRole('row', { name: /American AAdvantage/ })
    expect(american).toHaveTextContent('JFK → SEA')
    expect(american).not.toHaveTextContent('Airlines:')
    expect(american).toHaveTextContent('12,500 pts')
    expect(american).toHaveTextContent('$11.20 USD fees')
    expect(american).toHaveTextContent('Reported seats: 2')
    expect(american).toHaveTextContent('CPP not reported')
    expect(within(american).getByRole('region', { name: 'Business daily option' })).toHaveTextContent('Not reported')
    const zero = screen.getByRole('row', { name: /Zero fare/ })
    expect(zero).toHaveTextContent('0 pts')
    expect(zero).toHaveTextContent('$0.00 USD fees')
    expect(zero).toHaveTextContent('CPP: 0.00¢/pt')
    expect(zero).toHaveTextContent('Reported seats: 0')
    const unknown = screen.getByRole('row', { name: /Unreported/ })
    expect(unknown).toHaveTextContent('Cash fees not reported')
    expect(unknown).toHaveTextContent('Seats not reported')
    expect(screen.getByRole('row', { name: /Reported value/ })).toHaveTextContent('CPP: 2.75¢/pt')
    expect(american).not.toHaveAttribute('tabindex')
    expect(american).not.toHaveAttribute('aria-expanded')
    expect(within(american).queryByRole('button', { name: 'View trips' })).not.toBeInTheDocument()
    expect(within(american).queryByRole('button', { name: /View Economy trips/ })).not.toBeInTheDocument()
    await user.click(american)
    expect(fetch).not.toHaveBeenCalled()
    expect(screen.queryByRole('region', { name: /flights on/ })).not.toBeInTheDocument()
  })

  it('opens supplied details from a row click or Enter/Space without moving keyboard focus', async () => {
    const user = userEvent.setup()
    vi.mocked(fetch).mockResolvedValue(Response.json({ availability_id: 'record-1', booking_links: [], trips: [] }))
    render(<AvailabilityResults searchId="one" response={response([result({ availability_id: 'record-1' })])} />)
    const row = screen.getByRole('row', { name: /American AAdvantage/ })
    await user.click(within(row).getByText('12,500 pts'))
    expect(await screen.findByText('No economy trips were returned for this availability.')).toBeVisible()
    expect(row).toHaveAttribute('aria-expanded', 'true')
    row.focus()
    await user.keyboard('{Enter}')
    expect(row).toHaveAttribute('aria-expanded', 'false')
    expect(row).toHaveFocus()
    await user.keyboard(' ')
    expect(row).toHaveAttribute('aria-expanded', 'true')
    expect(row).toHaveFocus()
    expect(fetch).toHaveBeenCalledTimes(1)
    await user.click(within(row).getByRole('button', { name: 'Hide trips' }))
    expect(row).toHaveAttribute('aria-expanded', 'false')
  })

  it('combines cabins and duplicate records into one date and program row', () => {
    const duplicate = result()
    render(<AvailabilityResults searchId="one" response={response([
      duplicate, { ...duplicate }, result({ cabin: 'premium_economy', points_cost: 20000 }),
      result({ cabin: 'business', points_cost: 40000, cash_fees_usd: 55, seats_available: 1 }),
      result({ cabin: 'first', points_cost: 60000 }),
    ])} />)
    expect(rows()).toHaveLength(1)
    const grouped = within(rows()[0])
    expect(grouped.getByRole('region', { name: 'Economy daily option' })).toHaveTextContent('12,500 pts')
    expect(grouped.getByRole('region', { name: 'Premium economy daily option' })).toHaveTextContent('20,000 pts')
    const business = grouped.getByRole('region', { name: 'Business daily option' })
    expect(business).toHaveTextContent('40,000 pts$55.00 USD fees')
    expect(business).toHaveTextContent('Reported seats: 1')
    expect(grouped.getByRole('region', { name: 'First daily option' })).toHaveTextContent('60,000 pts')
    expect(screen.getByText('Reported points per cabin · 1 matching rows')).toBeVisible()
    expect(screen.getByText('5 award options returned.')).toBeVisible()
  })

  it('does not hide a response that supplies only business awards', () => {
    render(<AvailabilityResults searchId="business" response={response([result({ cabin: 'business' })])} />)
    expect(rows()).toHaveLength(1)
    expect(within(rows()[0]).getByRole('region', { name: 'Business daily option' })).toHaveTextContent('12,500 pts')
    expect(screen.getByRole('button', { name: 'Sort by Business points' }).closest('th')).toHaveAttribute('aria-sort', 'ascending')
  })

  it('sorts points and combines cabin, date, and program filters', async () => {
    const user = userEvent.setup()
    render(<AvailabilityResults searchId="one" response={response([
      result({ program: 'High', points_cost: 20000 }), result({ program: 'Low', points_cost: 5000 }),
      result({ program: 'High', departure_date: '2026-12-02', points_cost: 25000 }),
      result({ program: 'Business', cabin: 'business', points_cost: 500 }),
      result({ program: 'Low', cabin: 'business', points_cost: 30000 }),
    ])} />)
    expect(rows()[0]).toHaveTextContent('Low')
    await user.click(screen.getByRole('button', { name: 'Sort by Business points' }))
    expect(rows()[0]).toHaveTextContent('Business')
    expect(rows()[1]).toHaveTextContent('Low')
    await user.click(screen.getByRole('button', { name: 'Sort by Economy points' }))
    await user.click(screen.getByRole('button', { name: 'Sort by Economy points' }))
    expect(rows()[0]).toHaveTextContent('25,000 pts')
    expect(rows()[3]).toHaveTextContent('Business')
    await user.click(screen.getByRole('button', { name: /Cabins:/ }))
    await user.click(screen.getByRole('checkbox', { name: 'Business' }))
    await user.keyboard('{Escape}')
    expect(rows()).toHaveLength(3)
    await user.click(screen.getByRole('button', { name: /Dates:/ }))
    await user.click(screen.getByRole('checkbox', { name: 'Wed, Dec 2' }))
    await user.keyboard('{Escape}')
    expect(rows()).toHaveLength(2)
    await user.click(screen.getByRole('button', { name: /Programs:/ }))
    await user.click(screen.getByRole('checkbox', { name: 'High' }))
    await user.keyboard('{Escape}')
    expect(rows()).toHaveLength(1)
    expect(rows()[0]).toHaveTextContent('Low')
    await user.click(screen.getByRole('button', { name: /Cabins:/ }))
    await user.click(screen.getByRole('checkbox', { name: 'Economy' }))
    await user.keyboard('{Escape}')
    expect(screen.getByText('No results match these filters.')).toBeVisible()
  })

  it('pages the full response locally and resets controls for a new response', async () => {
    const user = userEvent.setup()
    const data = response(Array.from({ length: 12 }, (_, index) => [
      result({ program: `Program ${index + 1}`, points_cost: index + 1 }),
      result({ program: `Program ${index + 1}`, cabin: 'business', points_cost: (index + 1) * 10 }),
    ]).flat())
    const view = render(<AvailabilityResults searchId="one" response={data} />)
    expect(rows()).toHaveLength(5)
    expect(screen.getByText('Reported points per cabin · 12 matching rows')).toBeVisible()
    expect(within(rows()[0]).getByRole('region', { name: 'Business daily option' })).toHaveTextContent('10 pts')
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(rows()[0]).toHaveTextContent('Program 6')
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(rows()).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
    await user.selectOptions(screen.getByLabelText('Rows per page'), '25')
    expect(rows()).toHaveLength(12)
    view.rerender(<AvailabilityResults searchId="two" response={data} />)
    expect(rows()).toHaveLength(5)
    expect(rows()[0]).toHaveTextContent('Program 1')
  })

  it('shows an empty response without an invented table or price', () => {
    render(<AvailabilityResults searchId="empty" response={response([])} message={<p>Please specify your route.</p>} />)
    expect(screen.getByRole('region', { name: 'Assistant message' })).toHaveTextContent('Please specify your route.')
    expect(screen.getByText('No award options were returned.')).toBeVisible()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Result filters' })).not.toBeInTheDocument()
  })
})
