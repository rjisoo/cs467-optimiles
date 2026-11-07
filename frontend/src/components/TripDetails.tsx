import { useId, useRef, useState } from 'react'
import { Tabs } from 'radix-ui'
import type { ChatCabin } from '../services/chat-response'
import type { FlightTrip, TripDetailsResponse } from '../services/trip-details'
import { cabinOptions } from '../services/availability-presentation'
import { arrivalDayOffset, formatUpdatedAt } from '../lib/trip-date'
import AvailabilityPagination from './AvailabilityPagination'
import Icon from './Icon'
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from './ui/dialog'

function ReportedTime({ value, compact = false }: { value: string | null; compact?: boolean }) {
  if (!value) return <>Not reported</>
  const match = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?$/)
  const label = match ? `${compact ? '' : `${match[1]} `}${match[2]}` : value.replace('T', ' ')
  return <time dateTime={value}>{label}</time>
}

const dollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

function fees(trip: FlightTrip) {
  return trip.cash_fees_usd == null ? 'USD fees unavailable' : `${dollars.format(trip.cash_fees_usd)} USD fees`
}

function BookingOptions({ links }: { links: TripDetailsResponse['booking_links'] }) {
  const options = links.flatMap((link) => {
    const url = bookingUrl(link.url)
    return url ? [{ label: link.label || 'Open booking search', url }] : []
  })
  if (!options.length) return null
  return <Dialog>
    <DialogTrigger asChild>
      <button className="compact-button compact-button--outline trip-booking-button" type="button"><Icon name="aircraft" />Booking</button>
    </DialogTrigger>
    <DialogContent>
      <DialogTitle>Booking options</DialogTitle>
      <DialogDescription>Choose a program to open its booking search.</DialogDescription>
      <ul className="trip-booking-links">
        {options.map((option, index) => <li key={index}>
          <a href={option.url} target="_blank" rel="noopener noreferrer">{option.label}</a>
        </li>)}
      </ul>
    </DialogContent>
  </Dialog>
}

function bookingUrl(value: string | null) {
  try {
    const url = new URL(value ?? '')
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null
  } catch { return null }
}

function TripRow({ trip, route }: { trip: FlightTrip; route?: string }) {
  const [open, setOpen] = useState(false)
  const detailsId = useId()
  const flights = trip.flight_numbers.join(' / ') || 'Flight numbers not reported'
  const carriers = [...new Set(trip.carrier_names ?? trip.carriers)]
  const dayOffset = arrivalDayOffset(trip.departs_at_local, trip.arrives_at_local)
  const segments = trip.segments.length ? trip.segments : [{
    flight_number: flights, carrier_name: carriers.join(', ') || null, carrier: null,
    origin_airport: null, destination_airport: null,
    departs_at_local: trip.departs_at_local, arrives_at_local: trip.arrives_at_local,
  }]
  return <article className="availability-flight" aria-label={`Flight ${flights}`}>
    <div className="availability-flight-summary" onClick={(event) => {
      if (event.target instanceof Element && !event.target.closest('button, a')) setOpen(!open)
    }}>
      <div className="availability-schedule">
        <p className="availability-times">
          <strong><ReportedTime value={trip.departs_at_local} compact /></strong>
          <Icon name="arrowRight" />
          <span className="availability-arrival-time">
            <strong><ReportedTime value={trip.arrives_at_local} compact /></strong>
            {dayOffset !== 0 && <span className="availability-day-offset"
              title={trip.arrives_at_local.slice(0, 10)}
              aria-label={`Arrival ${Math.abs(dayOffset)} ${Math.abs(dayOffset) === 1 ? 'day' : 'days'} ${dayOffset > 0 ? 'later' : 'earlier'}`}>
              {dayOffset > 0 ? '+' : ''}{dayOffset}
            </span>}
          </span>
        </p>
        <p>{route && `${route} · `}{flights}</p>
      </div>
      <div className="availability-journey">
        <span>{Math.floor(trip.duration_minutes / 60)}h {trip.duration_minutes % 60}m</span>
        <span>{trip.stops === 0 ? 'Nonstop' : `${trip.stops} ${trip.stops === 1 ? 'stop' : 'stops'}`}</span>
      </div>
      <div className="availability-flight-carriers">
        {(carriers.length ? carriers : ['Airline not reported']).map((carrier) => <div className="availability-flight-carrier" key={carrier}>
          <span className="availability-airline-mark" aria-hidden="true"><Icon name="aircraft" /></span>
          <span>{carrier}</span>
        </div>)}
      </div>
      <div className="availability-flight-price">
        <div className="availability-fare">
          <strong>{trip.points === null ? 'Points not reported' : <>{trip.points.toLocaleString('en-US')}<small> pts</small></>}</strong>
          <span>{fees(trip)}</span>
        </div>
        <button className="compact-button compact-button--icon availability-flight-toggle"
          aria-label={`${open ? 'Hide' : 'Show'} flight details for ${flights}`}
          aria-expanded={open} aria-controls={detailsId} onClick={() => setOpen(!open)}>
          <Icon name="chevronDown" />
        </button>
      </div>
    </div>
    <div id={detailsId} className="availability-segment-content" hidden={!open}>
      <table className="availability-trip-table">
        <caption>Trip details</caption>
        <thead><tr>
          <th scope="col">Route</th><th scope="col">Carrier</th><th scope="col">Flight</th>
          <th scope="col">Departure</th><th scope="col">Arrival</th><th scope="col">Last Updated</th>
        </tr></thead>
        <tbody>{segments.map((segment, index) => <tr key={index}>
          <th scope="row">{trip.segments.length
            ? `${segment.origin_airport ?? 'Not reported'} → ${segment.destination_airport ?? 'Not reported'}`
            : route ?? 'Not reported'}</th>
          <td>{segment.carrier_name || segment.carrier || (carriers.length === 1 ? carriers[0] : 'Not reported')}</td>
          <td>{segment.flight_number ?? 'Not reported'}</td>
          <td><ReportedTime value={segment.departs_at_local} /></td>
          <td><ReportedTime value={segment.arrives_at_local} /></td>
          {index === 0 && <td rowSpan={segments.length}>
            {trip.provider_updated_at ? <time dateTime={trip.provider_updated_at}>
              {formatUpdatedAt(trip.provider_updated_at)}
            </time> : 'Not reported'}
          </td>}
        </tr>)}</tbody>
      </table>
    </div>
  </article>
}

export default function TripDetails({ response, cabin, route }: {
  response: Pick<TripDetailsResponse, 'trips' | 'booking_links'>; cabin: ChatCabin; route?: string
}) {
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState('points')
  const [selectedCabin, setSelectedCabin] = useState<string>(cabin)
  const heading = useRef<HTMLHeadingElement>(null)
  const options = [...cabinOptions, ...[...new Set(response.trips.map((trip) => trip.cabin))]
    .filter((value) => !cabinOptions.some((option) => option.key === value))
    .map((value) => ({ key: value, label: value }))]
  const cabinLabel = options.find((option) => option.key === selectedCabin)?.label
  const trips = response.trips.filter((trip) => trip.cabin === selectedCabin)
  if (sort !== 'reported') trips.sort((a, b) => {
    if (sort === 'departure') return a.departs_at_local.localeCompare(b.departs_at_local)
    const first = sort === 'points' ? a.points : a.duration_minutes
    const second = sort === 'points' ? b.points : b.duration_minutes
    if (first === null) return second === null ? 0 : 1
    if (second === null) return -1
    return first - second
  })

  return <Tabs.Root value={selectedCabin} onValueChange={(value) => { setSelectedCabin(value); setPage(1) }}>
    <Tabs.List className="availability-cabin-tabs" aria-label="Flight cabin">
      {options.map((option) => <Tabs.Trigger key={option.key} value={option.key} aria-label={option.label}
        disabled={option.key !== cabin && !response.trips.some((trip) => trip.cabin === option.key)}>
        {option.key === 'premium_economy' ? 'Premium' : option.label}
      </Tabs.Trigger>)}
    </Tabs.List>
    <Tabs.Content value={selectedCabin} className="availability-cabin-panel">
    <div className="availability-list-heading toolbar">
      <h4 ref={heading}>{cabinLabel} trips · {trips.length} returned</h4>
      {trips.length > 1 && <label>Sort trips{' '}
        <select className="compact-control" value={sort} onChange={(event) => {
          setSort(event.target.value)
          setPage(1)
          heading.current?.scrollIntoView?.({ block: 'start' })
        }}>
          <option value="reported">Provider order</option>
          <option value="departure">Departure time</option>
          <option value="points">Lowest points</option>
          <option value="duration">Shortest duration</option>
        </select>
      </label>}
      <BookingOptions links={response.booking_links} />
    </div>
    {trips.length === 0 && <p role="status">No {cabinLabel?.toLowerCase()} trips were returned for this availability.</p>}
    {trips.length > 0 && <>
      <p className="availability-flight-scroll-hint">Scroll sideways to see all flight details.</p>
      <div className="availability-flight-rows" role="region" aria-label="Flight itineraries" tabIndex={0}>
        {trips.slice((page - 1) * 5, page * 5).map((trip, index) => <TripRow key={`${selectedCabin}-${trip.trip_id}-${index}`} trip={trip} route={route} />)}
      </div>
    </>}
    {trips.length > 5 && <AvailabilityPagination label="Trip pagination" unit="trips" page={page}
      pageSize={5} total={trips.length} onPageChange={(next, scroll) => {
        setPage(next)
        if (scroll) heading.current?.scrollIntoView?.({ block: 'start' })
      }} />}
    </Tabs.Content>
  </Tabs.Root>
}
