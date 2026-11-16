import type { TripDraft } from '../components/TripEntry'
import { departureDateBounds, departureFlexDays, departureWindow, isExactDate, validateDepartureDate } from './trip-date'
import type { Airport } from '../services/airports'

export const cabinChoices = ['Economy', 'Premium economy', 'Business', 'First']
export type TripField = Exclude<keyof TripDraft, 'message' | 'originCodes' | 'destinationCodes'>
export type TripFieldErrors = Partial<Record<TripField, string>>

export function resolveTripAirports(draft: TripDraft, field: 'origin' | 'destination', airports: readonly Airport[]): Airport[] {
  const codes = draft[`${field}Codes`]
  if (!Array.isArray(codes)) return []
  return codes.flatMap((code) => {
    const normalized = typeof code === 'string' ? code.trim().toUpperCase() : ''
    const airport = /^[A-Z]{3}$/.test(normalized) && airports.find((item) => item.code === normalized)
    return airport ? [airport] : []
  })
}

export function tripDepartureBounds(draft: TripDraft, airports: readonly Airport[], now = new Date()) {
  let bounds: { min: string; max: string } | undefined
  for (const origin of resolveTripAirports(draft, 'origin', airports)) {
    const current = departureDateBounds(origin.timeZone, now)
    if (typeof current === 'string') return current
    bounds = bounds ? { min: current.min > bounds.min ? current.min : bounds.min,
      max: current.max < bounds.max ? current.max : bounds.max } : current
  }
  return bounds
}

export function validateTripFields(draft: TripDraft, airports?: readonly Airport[], now = new Date()): TripFieldErrors {
  const errors: TripFieldErrors = {}
  const origins = resolveTripAirports(draft, 'origin', airports ?? [])
  const destinations = resolveTripAirports(draft, 'destination', airports ?? [])
  for (const field of ['origin', 'destination'] as const) {
    const label = field === 'origin' ? 'departure' : 'arrival'
    const airportLabel = field === 'origin' ? 'a departure airport' : 'an arrival airport'
    const selected = field === 'origin' ? origins : destinations
    const codes = draft[`${field}Codes`]
    if (!Array.isArray(codes) || !codes.length) {
      errors[field] = `Choose at least one ${label} airport.`
    } else if (!airports) {
      errors[field] = 'Load the airport list before searching.'
    } else if (codes.length > 6) {
      errors[field] = `Choose up to six ${label} airports.`
    } else if (selected.length !== codes.length) {
      errors[field] = `Choose ${airportLabel} from the suggestions or enter its exact code.`
    } else if (new Set(selected.map((airport) => airport.code)).size !== selected.length) {
      errors[field] = `Choose each ${label} airport only once.`
    }
  }
  if (!errors.origin && !errors.destination && origins.some((origin) => destinations.some((destination) => origin.code === destination.code))) {
    errors.destination = 'Departure and arrival airports must not overlap.'
  }

  if (!draft.departureDate) {
    errors.departureDate = 'Enter a departure date.'
  } else if (!isExactDate(draft.departureDate)) {
    errors.departureDate = 'Enter a valid date including the year.'
  }
  const flexibility = draft.departureFlex ?? 'exact'
  if (!['exact', 'custom', ...departureFlexDays.map(String)].includes(flexibility)) {
    errors.departureFlex = 'Choose a listed date option.'
  }
  const dateWindow = departureWindow(draft.departureDate, flexibility, draft.departureDateEnd)
  if (flexibility === 'custom') {
    if (!dateWindow.end) errors.departureDateEnd = 'Enter the latest departure date.'
    else if (!isExactDate(dateWindow.end)) errors.departureDateEnd = 'Enter a valid date including the year.'
    else if (!errors.departureDate && dateWindow.end < dateWindow.start) {
      errors.departureDateEnd = 'Latest departure must be on or after earliest departure.'
    }
  }
  if (!errors.origin && !errors.departureDate && !errors.departureDateEnd && !errors.departureFlex) {
    for (const [index, day] of [dateWindow.start, dateWindow.end].entries()) {
      for (const origin of origins) {
        const error = validateDepartureDate(day, origin.timeZone, now)
        if (error) {
          const field = flexibility === 'custom' && index === 1 ? 'departureDateEnd' : 'departureDate'
          const prefix = flexibility !== 'exact' ? 'Selected range: ' : ''
          errors[field] = prefix + (origins.length > 1 ? `${origin.code}: ${error}` : error)
          break
        }
      }
    }
  }

  if (!/^[1-9]$/.test(draft.adults)) {
    errors.adults = 'Choose 1–9 adults.'
  }

  if (draft.cabins.some((cabin) => !cabinChoices.includes(cabin))) {
    errors.cabins = 'Choose from the listed cabins.'
  } else if (new Set(draft.cabins).size !== draft.cabins.length) {
    errors.cabins = 'Choose each cabin only once.'
  }

  return errors
}
