import type { ChatCabin, ChatResult } from '../services/chat-response'
import { cabinOptions } from '../services/availability-presentation'
import { awardDateLabel } from '../lib/trip-date'
import Icon from './Icon'

type Props = { summary: ChatResult; comparisonCabins: ChatCabin[] }

const dollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

export default function AvailabilitySummaryRow({ summary, comparisonCabins }: Props) {
  return (
    <tr className="availability-day" aria-label={`${awardDateLabel(summary.departure_date)} ${summary.program}`}>
      <th scope="row" className="availability-date-cell">
        <time dateTime={summary.departure_date}>{awardDateLabel(summary.departure_date)}</time>
        <span>{summary.origin} → {summary.destination}</span>
      </th>
      <td className="availability-program-cell">
        <div className="availability-airline">
          <span className="availability-airline-mark" aria-hidden="true"><Icon name="aircraft" /></span>
          <span>{summary.program}</span>
        </div>
        <p className="availability-list-note">Airlines: {summary.airline}</p>
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
