export type FlightSegment = {
  flight_number: string | null
  origin_airport: string | null
  destination_airport: string | null
  departs_at_local: string | null
  arrives_at_local: string | null
}

export type FlightTrip = {
  trip_id: string
  availability_id: string
  source: string
  cabin: string
  points: number | null
  taxes_minor: number | null
  taxes_currency: string | null
  reported_seats: number | null
  departs_at_local: string
  arrives_at_local: string
  duration_minutes: number
  stops: number
  carriers: string[]
  provider_updated_at: string | null
  flight_numbers: string[]
  segments: FlightSegment[]
}

export type TripDetailsResponse = {
  availability_id: string
  booking_links: { label: string | null; url: string | null; primary: boolean }[]
  trips: FlightTrip[]
}

function invalid(): never {
  throw new Error('The trip service returned invalid details. Please try again.')
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid()
  return value as Record<string, unknown>
}

function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return invalid()
  return value
}

function optionalText(value: unknown): string | null {
  return value == null ? null : text(value)
}

function number(value: unknown, integer = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0
    || (integer && !Number.isSafeInteger(value))) return invalid()
  return value
}

function optionalNumber(value: unknown): number | null {
  return value == null ? null : number(value)
}

function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) return invalid()
  return value
}

export function validateTripDetails(input: unknown, requestedId: string): TripDetailsResponse {
  const response = record(input)
  if (response.availability_id !== requestedId) invalid()
  return {
    availability_id: requestedId,
    booking_links: array(response.booking_links).map((value) => {
      const link = record(value)
      if (typeof link.primary !== 'boolean') invalid()
      return { label: optionalText(link.label), url: optionalText(link.url), primary: link.primary }
    }),
    trips: array(response.trips).map((value) => {
      const trip = record(value)
      if (trip.availability_id !== requestedId) invalid()
      const cabin = text(trip.cabin)
      return {
        trip_id: text(trip.trip_id), availability_id: requestedId, source: text(trip.source),
        cabin: cabin === 'premium' ? 'premium_economy' : cabin,
        points: optionalNumber(trip.points), taxes_minor: optionalNumber(trip.taxes_minor),
        taxes_currency: optionalText(trip.taxes_currency), reported_seats: optionalNumber(trip.reported_seats),
        departs_at_local: text(trip.departs_at_local), arrives_at_local: text(trip.arrives_at_local),
        duration_minutes: number(trip.duration_minutes, true), stops: number(trip.stops, true),
        carriers: array(trip.carriers).map(text), flight_numbers: array(trip.flight_numbers).map(text),
        provider_updated_at: optionalText(trip.provider_updated_at),
        segments: array(trip.segments).map((value) => {
          const segment = record(value)
          return {
            flight_number: optionalText(segment.flight_number), origin_airport: optionalText(segment.origin_airport),
            destination_airport: optionalText(segment.destination_airport),
            departs_at_local: optionalText(segment.departs_at_local), arrives_at_local: optionalText(segment.arrives_at_local),
          }
        }),
      }
    }),
  }
}

export async function fetchTripDetails(id: string, signal: AbortSignal): Promise<TripDetailsResponse> {
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(id)) return invalid()
  let response: Response
  try {
    response = await fetch(`/api/availability/${encodeURIComponent(id)}/trips`, { signal })
  } catch (error) {
    if (signal.aborted) throw error
    throw new Error('Could not reach the trip service. Please try again.', { cause: error })
  }
  if (!response.ok) throw new Error(`Trip details are unavailable (HTTP ${response.status}). Please try again.`)
  try {
    return validateTripDetails(await response.json(), id)
  } catch (error) {
    if (signal.aborted) throw error
    throw new Error('The trip service returned invalid details. Please try again.', { cause: error })
  }
}
