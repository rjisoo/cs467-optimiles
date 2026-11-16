import Icon from './Icon'
import { Button } from './ui/button'
import { awardDateLabel } from '../lib/trip-date'
import type { ChatResult } from '../services/chat-response'
import type { SearchCriteria } from '../services/search-api'
import { cabinOptions } from '../services/availability-presentation'

const airportNames: Record<string, string> = { JFK: 'New York', SEA: 'Seattle' }

function airportLabel(code: string) {
  return airportNames[code] ? `${airportNames[code]} · ${code}` : code
}

export default function CurrentTrip({ results, criteria }: { results: ChatResult[]; criteria?: SearchCriteria }) {
  if (results.length === 0 && !criteria) return null

  const first = results[0]
  const sameRoute = !!criteria || results.every((row) => row.origin === first.origin && row.destination === first.destination)
  const dates = results.map((row) => row.departure_date).sort()
  const startDate = criteria?.departure_date ?? dates[0]
  const endDate = criteria?.departure_date ?? dates[dates.length - 1]
  const cabins = cabinOptions.filter((option) => criteria
    ? criteria.cabins.includes(option.key) : results.some((row) => row.cabin === option.key))

  return (
    <section className="current-trip panel toolbar" aria-label="Current trip">
      <div>
        <p className="availability-list-note">{criteria ? 'Requested trip · One way' : 'Returned route and dates'}</p>
        <p className="current-trip-route">
          {sameRoute ? <>
            <span>{airportLabel(criteria?.origin ?? first.origin)}</span>
            <Icon name="arrowRight" />
            <span>{airportLabel(criteria?.destination ?? first.destination)}</span>
          </> : <span>Multiple returned routes</span>}
        </p>
        <p className="current-trip-criteria">
          <span>{cabins.map((cabin) => cabin.label).join(' + ')}</span>
          <span>
            <time dateTime={startDate}>{awardDateLabel(startDate)}</time>
            {startDate !== endDate && <>
              {' '}–{' '}
              <time dateTime={endDate}>{awardDateLabel(endDate)}</time>
            </>}
          </span>
          <span>{criteria ? `${criteria.passengers} ${criteria.passengers === 1 ? 'adult' : 'adults'}`
            : 'Passenger count not supplied in results'}</span>
        </p>
      </div>
      <Button
        variant="outline"
        disabled
        aria-label="Edit trip"
        title="Send a new message to change your search"
      >
        <Icon name="pencil" />
        Edit trip
      </Button>
    </section>
  )
}
