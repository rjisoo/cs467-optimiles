import { useId, useRef, useState } from 'react'
import { Tabs } from 'radix-ui'
import type { AvailabilitySummary, Cabin, Trip } from '../services/availability-api'
import {
  cabinOptions,
  formatAirportTime,
  formatOfferTaxes,
  programName,
} from '../services/availability-prototype'
import type { TripLoadState } from '../useAvailabilityTrips'
import { awardDateLabel } from '../lib/trip-date'
import AvailabilityPagination from './AvailabilityPagination'
import Icon from './Icon'
import type { MockComparison } from '../services/mock-comparisons'
import MockValue from './MockValue'

type Props = {
  summary: AvailabilitySummary
  cabin: Cabin
  onCabinChange: (cabin: Cabin) => void
  state: TripLoadState | undefined
  onRetry: () => void
  mockComparisons?: MockComparison[]
}

type TripSort = 'departure' | 'points' | 'duration'

function durationLabel(minutes: number | null) {
  if (minutes === null) {
    return 'Duration unknown'
  }
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

function stopsLabel(stops: number | null) {
  if (stops === null) {
    return 'Stops unknown'
  }
  if (stops === 0) {
    return 'Direct'
  }
  return `${stops} ${stops === 1 ? 'stop' : 'stops'}`
}

function TripRow({ trip, summary, mockComparisons }: {
  trip: Trip
  summary: AvailabilitySummary
  mockComparisons?: MockComparison[]
}) {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const detailsId = useId()
  const flightLabel = trip.flight_numbers.join(', ') || 'details unavailable'
  const arrivalDate = trip.arrives_at_local?.slice(0, 10)
  const taxesKnown = trip.taxes_minor !== null && trip.taxes_currency !== null
  const cabinLabel = cabinOptions.find((option) => option.key === trip.cabin)?.label ?? 'Unknown'
  const comparison = mockComparisons?.find((sample) => {
    return sample.availability_id === trip.availability_id
      && sample.trip_id === trip.trip_id
      && sample.cabin === trip.cabin
      && sample.points === trip.points
      && sample.taxes_minor === trip.taxes_minor
      && sample.taxes_currency === trip.taxes_currency
  })

  return (
    <article className="availability-flight" aria-label={`Flight ${flightLabel}`}>
      <div
        className="availability-flight-summary"
        onClick={(event) => {
          const target = event.target
          if (!(target instanceof Element) || target.closest('button, a, input, select, textarea')) {
            return
          }
          setDetailsOpen(!detailsOpen)
        }}
      >
        <div className="availability-flight-main" data-value-preview={mockComparisons !== undefined}>
          <div className="availability-schedule">
            <p className="availability-times">
              <strong>{formatAirportTime(trip.departs_at_local)}</strong>
              <Icon name="arrowRight" />
              <strong>{formatAirportTime(trip.arrives_at_local)}</strong>
              {arrivalDate && arrivalDate !== summary.date && (
                <span>{awardDateLabel(arrivalDate)}</span>
              )}
            </p>
            <p>
              {summary.origin_airport} → {summary.destination_airport}
              {' · '}{trip.flight_numbers.join(' / ') || 'Flight numbers unknown'}
            </p>
          </div>
          <div className="availability-journey">
            <span>{durationLabel(trip.duration_minutes)}</span>
            <span>{stopsLabel(trip.stops)}</span>
          </div>
          <div className="availability-fare">
            <strong>
              {trip.points === null ? 'Not available' : trip.points.toLocaleString('en-US')}
              {trip.points !== null && <small> pts</small>}
            </strong>
            <span>{taxesKnown && '+ '}{formatOfferTaxes(trip)}</span>
          </div>
          {mockComparisons && <MockValue comparison={comparison} />}
        </div>
        <button
          className="compact-button compact-button--icon availability-flight-toggle"
          aria-label={`${detailsOpen ? 'Hide' : 'Show'} flight details for ${flightLabel}`}
          aria-expanded={detailsOpen}
          aria-controls={detailsId}
          onClick={() => setDetailsOpen(!detailsOpen)}
        >
          <Icon name="chevronDown" />
        </button>
      </div>
      <div id={detailsId} className="availability-segment-content" hidden={!detailsOpen}>
        <p>
          Cabin: {cabinLabel} · Mileage program: {programName(trip.source)}
          {' · '}Reported seats: {trip.reported_seats ?? 'Unknown'}
        </p>
        {trip.segments.length > 0 ? (
          <ol>
            {trip.segments.map((segment, index) => (
              <li key={`${segment.flight_number}-${index}`}>
                <strong>
                  {segment.origin_airport ?? 'Unknown airport'} → {segment.destination_airport ?? 'Unknown airport'}
                </strong>
                <span>
                  {segment.flight_number ?? 'Flight number unknown'}
                  {' · '}{formatAirportTime(segment.departs_at_local)} → {formatAirportTime(segment.arrives_at_local)}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p>Segment details unavailable.</p>
        )}
        <p>Seat counts are informational. Availability for all passengers is not guaranteed.</p>
      </div>
    </article>
  )
}

function TripList({ summary, cabin, trips, mockComparisons }: {
  summary: AvailabilitySummary
  cabin: Cabin | null
  trips: Trip[]
  mockComparisons?: MockComparison[]
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  const [sort, setSort] = useState<TripSort>('departure')
  const [page, setPage] = useState(1)
  const cabinLabel = cabinOptions.find((option) => option.key === cabin)?.label ?? 'Unknown cabin'
  const cabinTrips = trips.filter((trip) => trip.cabin === cabin)
  const filtered = cabinTrips.filter((trip) => trip.points !== null && trip.points > 0)
  const sortValue = (trip: Trip) => {
    if (sort === 'points') {
      return trip.points
    }
    if (sort === 'duration') {
      return trip.duration_minutes
    }
    return trip.departs_at_local
  }
  const sorted = [...filtered].sort((first, second) => {
    const firstValue = sortValue(first)
    const secondValue = sortValue(second)
    if (firstValue === secondValue) {
      return 0
    }
    if (firstValue === null) {
      return 1
    }
    if (secondValue === null) {
      return -1
    }
    if (typeof firstValue === 'string' && typeof secondValue === 'string') {
      return firstValue.localeCompare(secondValue)
    }
    return Number(firstValue) - Number(secondValue)
  })

  return (
    <section className="availability-flight-list" aria-label={`${programName(summary.source)} flights on ${summary.date}`}>
      <div className="availability-list-heading toolbar">
        <div className="availability-list-intro">
          <h4 ref={heading}>{awardDateLabel(summary.date)} <span>· {cabinLabel}</span></h4>
          <p className="availability-list-note">
            Times local to each airport · Each row is a separate itinerary
          </p>
        </div>
        {filtered.length > 1 && (
          <label>
            Sort flights
            <select
              className="compact-control"
              value={sort}
              onChange={(event) => {
                setSort(event.target.value as TripSort)
                setPage(1)
              }}
            >
              <option value="departure">Departure time</option>
              <option value="points">Lowest points</option>
              <option value="duration">Shortest journey</option>
            </select>
          </label>
        )}
      </div>
      {filtered.length > 0 ? (
        <>
          <p className="availability-flight-scroll-hint">Scroll sideways to see all flight details.</p>
          <div className="availability-flight-rows" role="region" aria-label="Flight itineraries" tabIndex={0}>
            {sorted.slice((page - 1) * 5, page * 5).map((trip) => (
              <TripRow key={trip.trip_id} trip={trip} summary={summary} mockComparisons={mockComparisons} />
            ))}
          </div>
          <AvailabilityPagination
            label="Flight pagination"
            unit="flights"
            page={page}
            pageSize={5}
            total={filtered.length}
            onPageChange={(next, scroll) => {
              setPage(next)
              if (scroll) {
                heading.current?.scrollIntoView?.({ block: 'nearest' })
              }
            }}
          />
        </>
      ) : (
        <p className="availability-empty" role="status">
          {cabinTrips.length > 0
            ? 'Not available'
            : 'No trips were returned for this cabin.'}
        </p>
      )}
    </section>
  )
}

export default function AvailabilityTrips({
  summary,
  cabin,
  onCabinChange,
  state,
  onRetry,
  mockComparisons,
}: Props) {
  const [unknownSelected, setUnknownSelected] = useState(false)
  const trips = state?.status === 'success' ? state.trips : []
  const tabOptions: { key: Cabin | 'unknown'; label: string }[] = [...cabinOptions]
  if (trips.some((trip) => trip.cabin === null)) {
    tabOptions.push({ key: 'unknown', label: 'Unknown cabin' })
  }
  const selectedCabin = unknownSelected ? 'unknown' : cabin

  return (
    <Tabs.Root
      value={selectedCabin}
      onValueChange={(value) => {
        setUnknownSelected(value === 'unknown')
        if (value !== 'unknown') {
          onCabinChange(value as Cabin)
        }
      }}
    >
      <Tabs.List className="availability-cabin-tabs" aria-label="Flight cabin" data-cabins={tabOptions.length}>
        {tabOptions.map((option) => {
          const summaryCabin = summary.cabins.find((item) => item.cabin === option.key)
          const hasTrips = trips.some((trip) => trip.cabin === option.key)
          return (
            <Tabs.Trigger
              key={option.key}
              value={option.key}
              aria-label={option.label}
              disabled={summaryCabin?.available === false && !hasTrips}
            >
              <span className="availability-cabin-label-full">{option.label}</span>
              <span className="availability-cabin-label-short">
                {option.key === 'premium' ? 'Premium' : option.label}
              </span>
            </Tabs.Trigger>
          )
        })}
      </Tabs.List>
      {(!state || state.status === 'loading') && (
        <p className="availability-empty" role="status">Loading trips…</p>
      )}
      {state?.status === 'error' && (
        <div className="availability-empty" role="alert">
          <p>Trips could not be loaded.</p>
          <button className="compact-button compact-button--text" onClick={onRetry}>Retry trips</button>
        </div>
      )}
      {state?.status === 'success' && state.trips.length === 0 && (
        <p className="availability-empty" role="status">No trips were returned for this availability.</p>
      )}
      {state?.status === 'success' && state.trips.length > 0 && (
        tabOptions.map((option) => (
          <Tabs.Content key={option.key} value={option.key} className="availability-cabin-panel">
            <TripList
              summary={summary}
              cabin={option.key === 'unknown' ? null : option.key}
              trips={state.trips}
              mockComparisons={mockComparisons}
            />
          </Tabs.Content>
        ))
      )}
    </Tabs.Root>
  )
}
