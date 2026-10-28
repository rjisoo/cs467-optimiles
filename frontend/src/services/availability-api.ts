export type Cabin = 'economy' | 'premium' | 'business' | 'first'

export type RequiredCriteria = {
  origin_airport: string | null
  destination_airport: string | null
  start_date: string | null
  end_date: string | null
}

export type UserMessageContext = {
  original_message: string | null
  criteria: RequiredCriteria | null
  last_reply: string | null
}

export type UserMessage = {
  message: string
  context?: UserMessageContext | null
}

export type LLMSearchResponse = {
  is_ready_to_search: boolean
  reply: string
  criteria: RequiredCriteria
}

export type SeatsAeroSearchRequest = RequiredCriteria & {
  order_by?: string
  take?: number
  skip?: number
  cursor?: number | null
}

export type CabinSummary = {
  cabin: Cabin
  available: boolean | null
  from_points: number | null
}

export type AvailabilitySummary = {
  availability_id: string
  date: string
  origin_airport: string
  destination_airport: string
  source: string | null
  cabins: CabinSummary[]
}

export type FlightSegment = {
  flight_number: string | null
  origin_airport: string | null
  destination_airport: string | null
  departs_at_local: string | null
  arrives_at_local: string | null
}

export type Trip = {
  trip_id: string
  availability_id: string
  source: string | null
  cabin: Cabin | null
  points: number | null
  taxes_minor: number | null
  taxes_currency: string | null
  reported_seats: number | null
  departs_at_local: string | null
  arrives_at_local: string | null
  duration_minutes: number | null
  stops: number | null
  flight_numbers: string[]
  segments: FlightSegment[]
}

export type SearchResponse = {
  criteria: RequiredCriteria
  results: AvailabilitySummary[]
  has_more?: boolean
  cursor?: number | null
  next_skip?: number
}

export type TripsResponse = {
  availability_id: string
  trips: Trip[]
}
