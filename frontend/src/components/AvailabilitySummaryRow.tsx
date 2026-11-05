import type { ChatCabin, ChatResult } from '../services/chat-response'
import { cabinOptions } from '../services/availability-presentation'
import { awardDateLabel } from '../lib/trip-date'
import Icon from './Icon'

type Props = { summary: ChatResult; comparisonCabins: ChatCabin[]; open: boolean; detailsId: string; onToggle: () => void }

const dollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

export default function AvailabilitySummaryRow({ summary, comparisonCabins, open, detailsId, onToggle }: Props) {
  const canExpand = Boolean(summary.availability_id)
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
        <p className="availability-list-note">Airlines: {summary.airline}</p>
        {!canExpand && <p className="availability-list-note">Trip details unavailable</p>}
      </td>
      {cabinOptions.map(({ key, label }) => (
        <td key={key} className="availability-cabin" data-selected={comparisonCabins.includes(key)}>
          <section aria-label={`${label} daily option`}>
            <h4>{label}</h4>
            {summary.cabin === key ? <>
              <p className="availability-cabin-points">{summary.points_cost.toLocaleString('en-US')} pts</p>
              <p className="availability-list-note">{summary.cash_fees_usd === null
                ? 'Cash fees not reported' : `${dollars.format(summary.cash_fees_usd)} USD fees`}</p>
              <p className="availability-list-note">{summary.cents_per_point === null
                ? 'CPP not reported' : `CPP: ${summary.cents_per_point.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}¢/pt`}</p>
              <p className="availability-list-note">{summary.seats_available === null
                ? 'Seats not reported' : `Reported seats: ${summary.seats_available}`}</p>
            </> : <p className="availability-list-note">Not reported</p>}
          </section>
        </td>
      ))}
    </tr>
  )
}
