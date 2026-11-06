import { useId, useRef, useState } from 'react'
import { Tabs } from 'radix-ui'
import type { ChatCabin } from '../services/chat-response'
import type { FlightTrip, TripDetailsResponse } from '../services/trip-details'
import { cabinOptions } from '../services/availability-presentation'
import AvailabilityPagination from './AvailabilityPagination'
import Icon from './Icon'

function ReportedTime({ value, compact = false }: { value: string | null; compact?: boolean }) {
  if (!value) return <>Not reported</>
  const match = value.match(/^\d{4}-\d{2}-\d{2}T(\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/)
  const label = compact && match ? `${match[1]}${match[2] ?? ''}` : value.replace('T', ' ')
  return <time dateTime={value} title={value}>{label}</time>
}

function fees(trip: FlightTrip) {
  if (trip.taxes_minor === null) return 'Cash fees not reported'
  const currency = trip.taxes_currency?.toUpperCase()
  if (currency && Intl.supportedValuesOf('currency').includes(currency)) {
    const format = new Intl.NumberFormat('en-US', { style: 'currency', currency })
    const digits = format.resolvedOptions().maximumFractionDigits ?? 2
    return `${format.format(trip.taxes_minor / 10 ** digits)} ${trip.taxes_currency} fees`
  }
  return `${trip.taxes_minor.toLocaleString('en-US')} fee minor units · ${trip.taxes_currency ?? 'currency not reported'}`
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
  return <article className="availability-flight" aria-label={`Flight ${flights}`}>
    <div className="availability-flight-summary" onClick={(event) => {
      if (event.target instanceof Element && !event.target.closest('button, a')) setOpen(!open)
    }}>
      <div className="availability-flight-main">
        <div className="availability-schedule">
          <p className="availability-times">
            <strong><ReportedTime value={trip.departs_at_local} compact /></strong>
            <Icon name="arrowRight" />
            <strong><ReportedTime value={trip.arrives_at_local} compact /></strong>
            {trip.arrives_at_local.slice(0, 10) !== trip.departs_at_local.slice(0, 10)
              && <span>{trip.arrives_at_local.slice(0, 10)}</span>}
          </p>
          <p>{route && `${route} · `}{flights}</p>
        </div>
        <div className="availability-journey">
          <span>{Math.floor(trip.duration_minutes / 60)}h {trip.duration_minutes % 60}m</span>
          <span>{trip.stops === 0 ? 'Nonstop' : `${trip.stops} ${trip.stops === 1 ? 'stop' : 'stops'}`}</span>
        </div>
        <div className="availability-fare">
          <strong>{trip.points === null ? 'Points not reported' : <>{trip.points.toLocaleString('en-US')}<small> pts</small></>}</strong>
          <span>{fees(trip)}</span>
        </div>
      </div>
      <button className="compact-button compact-button--icon availability-flight-toggle"
        aria-label={`${open ? 'Hide' : 'Show'} flight details for ${flights}`}
        aria-expanded={open} aria-controls={detailsId} onClick={() => setOpen(!open)}>
        <Icon name="chevronDown" />
      </button>
    </div>
    <div id={detailsId} className="availability-segment-content" hidden={!open}>
      <p>Carriers: {trip.carriers.join(', ') || 'Not reported'} · {trip.reported_seats === null ? 'Seats not reported' : `Reported seats: ${trip.reported_seats}`}</p>
      <p>Departure: <ReportedTime value={trip.departs_at_local} /> · Arrival: <ReportedTime value={trip.arrives_at_local} /></p>
      {trip.provider_updated_at && <p>Provider updated: <ReportedTime value={trip.provider_updated_at} /></p>}
      {trip.segments.length ? <ol>{trip.segments.map((segment, index) => <li key={index}>
        <strong>{segment.origin_airport ?? 'Airport not reported'} → {segment.destination_airport ?? 'Airport not reported'}</strong>
        <span>{segment.flight_number ?? 'Flight number not reported'}</span>
        <span>Departure: <ReportedTime value={segment.departs_at_local} /></span>
        <span>Arrival: <ReportedTime value={segment.arrives_at_local} /></span>
      </li>)}</ol> : <p>Segment schedules not reported.</p>}
    </div>
  </article>
}

export default function TripDetails({ response, cabin, route }: { response: TripDetailsResponse; cabin: ChatCabin; route?: string }) {
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState('reported')
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
          <option value="departure">Reported departure</option>
          <option value="points">Lowest points</option>
          <option value="duration">Shortest duration</option>
        </select>
      </label>}
    </div>
    <p className="availability-list-note">Times are shown as reported, without timezone conversion. Prices and seats may differ from the summary; confirm with the program.</p>
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
    <div className="trip-booking-links">
      {response.booking_links.map((link, index) => {
        const url = bookingUrl(link.url)
        return url ? <a key={index} href={url} target="_blank" rel="noopener noreferrer">{link.label || 'Open booking search'}</a> : null
      })}
    </div>
    </Tabs.Content>
  </Tabs.Root>
}
