import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import CurrentTrip from './CurrentTrip'
import type { ChatResult } from '../services/chat-response'

const result = (overrides: Partial<ChatResult> = {}): ChatResult => ({
  airline: 'AA, AS', cabin: 'economy', cash_fees_usd: 11.2, cents_per_point: null,
  departure_date: '2026-12-01', destination: 'SEA', origin: 'JFK',
  points_cost: 12500, program: 'American AAdvantage', seats_available: 2,
  ...overrides,
})

describe('returned trip context', () => {
  it('uses returned route and cabin without inferring passenger or request criteria', () => {
    render(<CurrentTrip results={[result()]} />)
    const trip = within(screen.getByRole('region', { name: 'Current trip' }))
    expect(trip.getByText('New York · JFK')).toBeVisible()
    expect(trip.getByText('Seattle · SEA')).toBeVisible()
    expect(trip.getByText('Tue, Dec 1')).toHaveAttribute('datetime', '2026-12-01')
    expect(trip.getByText('Economy')).toBeVisible()
    expect(trip.getByText('Passenger count not supplied in results')).toBeVisible()
    expect(trip.queryByText(/1 adult|One way|Any program|No points limit|Sample|Airport unknown/)).not.toBeInTheDocument()
  })

  it('preserves unfamiliar airport codes and orders the returned date span without mutating rows', () => {
    const results = [
      result({ origin: 'ORD', destination: 'LAX', departure_date: '2026-12-04', cabin: 'business' }),
      result({ origin: 'ORD', destination: 'LAX', departure_date: '2026-12-01', cabin: 'premium_economy' }),
    ]
    render(<CurrentTrip results={results} />)
    const trip = within(screen.getByRole('region', { name: 'Current trip' }))
    expect(trip.getByText('ORD')).toBeVisible()
    expect(trip.getByText('LAX')).toBeVisible()
    expect(trip.getByText('Tue, Dec 1')).toHaveAttribute('datetime', '2026-12-01')
    expect(trip.getByText('Fri, Dec 4')).toHaveAttribute('datetime', '2026-12-04')
    expect(trip.getByText('Premium economy + Business')).toBeVisible()
    expect(results[0].departure_date).toBe('2026-12-04')
    expect(trip.queryByText('Airport unknown')).not.toBeInTheDocument()
  })

  it('labels mixed returned routes instead of selecting the first route', () => {
    render(<CurrentTrip results={[result(), result({ destination: 'LAX' })]} />)
    const trip = within(screen.getByRole('region', { name: 'Current trip' }))
    expect(trip.getByText('Multiple returned routes')).toBeVisible()
    expect(trip.queryByText(/New York|Seattle|LAX/)).not.toBeInTheDocument()
  })

  it('removes route context when the latest response has no structured results', () => {
    const { rerender } = render(<CurrentTrip results={[result()]} />)
    expect(screen.getByRole('region', { name: 'Current trip' })).toBeVisible()
    rerender(<CurrentTrip results={[]} />)
    expect(screen.queryByRole('region', { name: 'Current trip' })).not.toBeInTheDocument()
  })
})
