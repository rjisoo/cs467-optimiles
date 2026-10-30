import type {
  AvailabilitySummary,
  CabinSummary,
  SearchResponse,
  Trip,
  TripsResponse,
} from './availability-api'

function cabins(
  economy: number | null,
  extra: CabinSummary[] = [],
): CabinSummary[] {
  return [
    { cabin: 'economy', available: true, from_points: economy },
    ...(['premium', 'business', 'first'] as const).map((cabin) => {
      return extra.find((summary) => summary.cabin === cabin) ?? {
        cabin,
        available: false,
        from_points: null,
      }
    }),
  ]
}

function summary(
  availability_id: string,
  date: string,
  source: string | null,
  cabinSummaries: CabinSummary[],
): AvailabilitySummary {
  return {
    availability_id,
    date,
    origin_airport: 'JFK',
    destination_airport: 'SEA',
    source,
    cabins: cabinSummaries,
  }
}

export const searchFixture: SearchResponse = {
  criteria: {
    origin_airport: 'JFK',
    destination_airport: 'SEA',
    start_date: '2026-10-31',
    end_date: '2026-11-06',
  },
  results: [
    summary('avail-united-1031', '2026-10-31', 'united', cabins(15000, [
      { cabin: 'premium', available: true, from_points: 25000 },
      { cabin: 'business', available: true, from_points: 35000 },
    ])),
    summary('avail-alaska-1031', '2026-10-31', 'alaska', cabins(0, [
      { cabin: 'first', available: true, from_points: 45000 },
    ])),
    summary('avail-delta-1101', '2026-11-01', 'delta', cabins(18000, [
      { cabin: 'premium', available: null, from_points: null },
      { cabin: 'business', available: true, from_points: null },
    ])),
    summary('avail-united-1102', '2026-11-02', 'united', cabins(20000)),
    summary('avail-alaska-1103', '2026-11-03', 'alaska', cabins(22000)),
    summary('avail-united-1104', '2026-11-04', 'united', cabins(24000)),
    summary('avail-empty-1105', '2026-11-05', 'united', cabins(26000)),
    summary('avail-unknown-1106', '2026-11-06', null, cabins(null, [
      { cabin: 'first', available: null, from_points: null },
    ])),
  ],
}

function trip(
  availability_id: string,
  trip_id: string,
  changes: Partial<Trip> = {},
): Trip {
  const row = searchFixture.results.find((result) => {
    return result.availability_id === availability_id
  })!
  const departs_at_local = `${row.date}T09:00:00`
  const arrives_at_local = `${row.date}T12:10:00`

  return {
    trip_id,
    availability_id,
    source: row.source,
    cabin: 'economy',
    points: row.cabins[0].from_points,
    taxes_minor: 560,
    taxes_currency: 'USD',
    reported_seats: 2,
    departs_at_local,
    arrives_at_local,
    duration_minutes: 370,
    stops: 0,
    flight_numbers: ['UA123'],
    segments: [{
      flight_number: 'UA123',
      origin_airport: row.origin_airport,
      destination_airport: row.destination_airport,
      departs_at_local,
      arrives_at_local,
    }],
    ...changes,
  }
}

const unitedEconomyTrips = Array.from({ length: 12 }, (_, index) => {
  const departureHour = String(index + 6).padStart(2, '0')
  const arrivalHour = String(index + 9).padStart(2, '0')
  const departs_at_local = `2026-10-31T${departureHour}:00:00`
  const arrives_at_local = `2026-10-31T${arrivalHour}:10:00`
  const flight_number = `UA${123 + index}`

  return trip('avail-united-1031', `trip-united-economy-${index + 1}`, {
    points: 15000 + index * 1000,
    reported_seats: index === 0 ? null : 2,
    departs_at_local,
    arrives_at_local,
    flight_numbers: [flight_number],
    segments: [{
      flight_number,
      origin_airport: 'JFK',
      destination_airport: 'SEA',
      departs_at_local,
      arrives_at_local,
    }],
  })
})

export const tripsFixtures: Record<string, TripsResponse> = {
  'avail-united-1031': {
    availability_id: 'avail-united-1031',
    trips: [
      ...unitedEconomyTrips,
      trip('avail-united-1031', 'trip-united-premium', {
        cabin: 'premium',
        points: 25000,
        taxes_minor: 720,
        taxes_currency: 'CAD',
      }),
      trip('avail-united-1031', 'trip-united-business-1', {
        cabin: 'business',
        points: 35000,
        taxes_minor: null,
      }),
      trip('avail-united-1031', 'trip-united-business-2', {
        cabin: 'business',
        points: 40000,
        taxes_currency: null,
        reported_seats: null,
      }),
    ],
  },
  'avail-alaska-1031': {
    availability_id: 'avail-alaska-1031',
    trips: [
      trip('avail-alaska-1031', 'trip-alaska-zero', { taxes_minor: 0 }),
      trip('avail-alaska-1031', 'trip-alaska-first', {
        cabin: 'first',
        points: 45000,
      }),
    ],
  },
  'avail-delta-1101': {
    availability_id: 'avail-delta-1101',
    trips: [
      trip('avail-delta-1101', 'trip-delta-economy'),
      trip('avail-delta-1101', 'trip-delta-business', {
        cabin: 'business',
        points: null,
      }),
    ],
  },
  'avail-united-1102': {
    availability_id: 'avail-united-1102',
    trips: [trip('avail-united-1102', 'trip-united-1102')],
  },
  'avail-alaska-1103': {
    availability_id: 'avail-alaska-1103',
    trips: [trip('avail-alaska-1103', 'trip-alaska-1103')],
  },
  'avail-united-1104': {
    availability_id: 'avail-united-1104',
    trips: [trip('avail-united-1104', 'trip-united-1104')],
  },
  'avail-empty-1105': {
    availability_id: 'avail-empty-1105',
    trips: [],
  },
  'avail-unknown-1106': {
    availability_id: 'avail-unknown-1106',
    trips: [trip('avail-unknown-1106', 'trip-unknown', {
      cabin: null,
      taxes_minor: null,
      taxes_currency: null,
      reported_seats: null,
      departs_at_local: null,
      arrives_at_local: null,
      duration_minutes: null,
      stops: null,
      flight_numbers: [],
      segments: [],
    })],
  },
}
