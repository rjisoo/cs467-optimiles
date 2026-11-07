import { describe, expect, it, vi } from 'vitest'
import { fetchTripDetails, validateTripDetails } from './trip-details'

const trip = {
  trip_id: 'flight-1', availability_id: 'availability-1', source: 'united', cabin: 'economy',
  points: 15000, cash_fees_usd: 5.6, taxes_minor: 560, taxes_currency: 'USD', reported_seats: 2,
  departs_at_local: '2026-12-01T09:00:00', arrives_at_local: '2026-12-01T12:10:00',
  duration_minutes: 370, stops: 0, carriers: ['UA'], flight_numbers: ['UA123'], provider_updated_at: null,
  carrier_names: ['United Airlines'],
  segments: [{ flight_number: 'UA123', origin_airport: 'JFK', destination_airport: 'SEA',
    carrier: 'UA', carrier_name: 'United Airlines',
    departs_at_local: null, arrives_at_local: null }],
}
const payload = { availability_id: 'availability-1', booking_links: [], trips: [trip] }

describe('trip detail response boundary', () => {
  it('fetches the requested availability and preserves supplied times and missing segment schedules', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(payload))
    const signal = new AbortController().signal
    expect(await fetchTripDetails('availability-1', signal)).toEqual(payload)
    expect(fetch).toHaveBeenCalledWith('/api/availability/availability-1/trips', { signal })
  })

  it('keeps null and zero distinct, preserves booking fields, and normalizes the premium cabin name', () => {
    const value = { ...payload, booking_links: [{ label: null, url: null, primary: false }],
      trips: [{ ...trip, cabin: 'premium', points: 0, cash_fees_usd: 0, taxes_minor: 0, taxes_currency: null, reported_seats: null }] }
    const normalized = validateTripDetails(value, 'availability-1')
    expect(normalized.trips[0]).toMatchObject({ cabin: 'premium_economy', points: 0, cash_fees_usd: 0, taxes_minor: 0,
      taxes_currency: null, reported_seats: null })
    expect(normalized.booking_links).toEqual(value.booking_links)
    expect(validateTripDetails({ ...payload, trips: [] }, 'availability-1').trips).toEqual([])
    expect(validateTripDetails({ ...payload, trips: [{ ...trip, cash_fees_usd: null }] }, 'availability-1')
      .trips[0].cash_fees_usd).toBeNull()
  })

  it.each([
    { ...payload, availability_id: 'another' },
    { ...payload, trips: [{ ...trip, availability_id: 'another' }] },
    { ...payload, trips: null }, { ...payload, booking_links: undefined },
    { ...payload, trips: [{ ...trip, points: '15000' }] },
    { ...payload, trips: [{ ...trip, cash_fees_usd: '5.60' }] },
    { ...payload, trips: [{ ...trip, duration_minutes: -1 }] },
    { ...payload, trips: [{ ...trip, segments: [null] }] },
    { ...payload, trips: [{ ...trip, carriers: 'UA' }] },
    { ...payload, trips: [{ ...trip, carrier_names: 'United Airlines' }] },
    { ...payload, trips: [{ ...trip, segments: [{ ...trip.segments[0], carrier_name: 123 }] }] },
  ])('rejects invalid or mismatched details', (value) => {
    expect(() => validateTripDetails(value, 'availability-1')).toThrow('invalid details')
  })

  it.each([404, 502, 503, 504])('does not substitute data after HTTP %i', async (status) => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status }))
    await expect(fetchTripDetails('availability-1', new AbortController().signal)).rejects.toThrow(`HTTP ${status}`)
  })

  it('rejects malformed JSON, network failure and unsafe identifiers', async () => {
    const signal = new AbortController().signal
    vi.mocked(fetch).mockResolvedValueOnce(new Response('not JSON')).mockRejectedValueOnce(new TypeError('Offline'))
    await expect(fetchTripDetails('availability-1', signal)).rejects.toThrow('invalid details')
    await expect(fetchTripDetails('availability-1', signal)).rejects.toThrow('Could not reach')
    await expect(fetchTripDetails('../other', signal)).rejects.toThrow('invalid details')
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})
