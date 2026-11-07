import type { ChatCabin } from '../services/chat-response'
import { cabinOptions, type AvailabilitySummary } from '../services/availability-presentation'
import { awardDateLabel } from '../lib/trip-date'
import Icon from './Icon'

type Props = {
  summary: AvailabilitySummary
  comparisonCabins: ChatCabin[]
  open: boolean
  detailsId: string
  onToggle: () => void
  onSelectCabin: (cabin: ChatCabin) => void
}

const dollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

export default function AvailabilitySummaryRow({ summary, comparisonCabins, open, detailsId, onToggle, onSelectCabin }: Props) {
  const canExpand = summary.availabilityIds.length > 0
  return (
    <tr className="availability-day" aria-label={`${awardDateLabel(summary.departure_date)} ${summary.program}`}
      tabIndex={canExpand ? 0 : undefined} aria-expanded={canExpand ? open : undefined}
      aria-controls={canExpand && open ? detailsId : undefined}
      onClick={canExpand ? (event) => {
        if (event.target instanceof Element && !event.target.closest('button, a, input, select, textarea')) onToggle()
      } : undefined}
      onKeyDown={canExpand ? (event) => {
        if (event.target !== event.currentTarget || !['Enter', ' '].includes(event.key)) return
        event.preventDefault()
        onToggle()
      } : undefined}>
      <th scope="row" className="availability-date-cell">
        <time dateTime={summary.departure_date}>{awardDateLabel(summary.departure_date)}</time>
        <span>{summary.origin} → {summary.destination}</span>
      </th>
      <td className="availability-program-cell">
        <div className="availability-airline">
          <span className="availability-airline-mark" aria-hidden="true"><Icon name="aircraft" /></span>
          <span>{summary.program}</span>
          {canExpand && <button className="compact-button compact-button--icon availability-summary-toggle"
            aria-label={open ? 'Hide trips' : 'View trips'} aria-expanded={open}
            aria-controls={open ? detailsId : undefined} onClick={onToggle}>
            <Icon name="chevronDown" />
          </button>}
        </div>
        {!canExpand && <p className="availability-list-note">Trip details unavailable</p>}
      </td>
      {cabinOptions.map(({ key, label }) => {
        const offer = summary.cabins[key]
        const price = offer && <>
          <strong className="availability-cabin-points">{offer.points_cost.toLocaleString('en-US')} pts</strong>
          <span className="availability-list-note">{offer.cash_fees_usd === null
            ? 'Cash fees not reported' : `${dollars.format(offer.cash_fees_usd)} USD fees`}</span>
        </>
        return (
          <td key={key} className="availability-cabin" data-selected={comparisonCabins.includes(key)}>
            <section aria-label={`${label} daily option`}>
              <h4>{label}</h4>
              {offer ? <>
                {canExpand ? <button type="button" className="availability-cabin-price availability-cabin-price-button"
                  aria-label={`View ${label} trips for ${offer.points_cost.toLocaleString('en-US')} points`}
                  aria-expanded={open} aria-controls={open ? detailsId : undefined}
                  onClick={() => onSelectCabin(key)}>{price}</button>
                  : <p className="availability-cabin-price">{price}</p>}
                <p className="availability-list-note">{offer.cents_per_point === null
                  ? 'CPP not reported' : `CPP: ${offer.cents_per_point.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}¢/pt`}</p>
                <p className="availability-list-note">{offer.seats_available === null
                  ? 'Seats not reported' : `Reported seats: ${offer.seats_available}`}</p>
              </> : <p className="availability-list-note availability-cabin-unreported">Not reported</p>}
            </section>
          </td>
        )
      })}
    </tr>
  )
}
