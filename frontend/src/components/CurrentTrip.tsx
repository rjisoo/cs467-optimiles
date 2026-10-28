import Icon from './Icon'
import { Button } from './ui/button'
import { awardDateLabel } from '../lib/trip-date'
import type { TripCriteria } from '../services/mock-search'
import type { RequiredCriteria } from '../services/availability-api'

const airportNames: Record<string, string> = { JFK: 'New York', SEA: 'Seattle' }

function airportLabel(codes: string | null) {
  if (codes === null) {
    return 'Airport unknown'
  }
  return codes
    .split(',')
    .map((value) => {
      const code = value.trim()
      return airportNames[code] ? `${airportNames[code]} · ${code}` : code
    })
    .join(' / ')
}

type Props = {
  criteria: TripCriteria
  resolvedCriteria?: RequiredCriteria
  comparisonCabins?: string[]
}

export default function CurrentTrip({
  criteria,
  resolvedCriteria,
  comparisonCabins = criteria.cabins,
}: Props) {
  const resolved = resolvedCriteria ?? {
    origin_airport: criteria.origin,
    destination_airport: criteria.destination,
    start_date: criteria.departureDate,
    end_date: criteria.endDate ?? criteria.departureDate,
  }
  const range = resolved.end_date !== resolved.start_date
  const datesKnown = resolved.start_date !== null && resolved.end_date !== null
  let dateMode = 'Dates incomplete'
  if (datesKnown) {
    dateMode = range ? 'Date range' : 'Exact dates'
  }
  const cabinLabel = comparisonCabins.length === 4
    ? 'all cabins'
    : comparisonCabins.join(' + ') || 'no cabins selected'

  return (
    <section className="current-trip panel toolbar" aria-label="Current trip">
      <div>
        <p className="current-trip-route">
          <span>{airportLabel(resolved.origin_airport)}</span>
          <Icon name="arrowRight" />
          <span>{airportLabel(resolved.destination_airport)}</span>
        </p>
        <p className="current-trip-criteria">
          <span>One way</span>
          <span>{criteria.adults} {criteria.adults === '1' ? 'adult' : 'adults'} · local preference</span>
          <span>All cabins · Compare {cabinLabel}</span>
          <span>
            {resolved.start_date ? (
              <time dateTime={resolved.start_date}>{awardDateLabel(resolved.start_date)}</time>
            ) : (
              'Start date unknown'
            )}
            {(range || !datesKnown) && (
              <>
                {' '}–{' '}
                {resolved.end_date ? (
                  <time dateTime={resolved.end_date}>{awardDateLabel(resolved.end_date)}</time>
                ) : (
                  'End date unknown'
                )}
              </>
            )}
          </span>
          <span>{dateMode}</span>
          <span>Any program</span>
          <span>No points limit</span>
        </p>
      </div>
      <Button
        variant="outline"
        disabled
        aria-label="Edit trip, preview only"
        title="Preview only — current-trip editing comes later"
      >
        <Icon name="pencil" />
        Edit trip
        <span className="current-trip-edit-note"> · Preview only</span>
      </Button>
    </section>
  )
}
