import AwardCard from './AwardCard'
import Icon from './Icon'
import './AwardPreview.css'
import { awardFixtures, awardPreviewTrip } from './award-fixtures'
import { awardDateLabel } from './award-display'

export default function AwardPreview() {
  const { origin, destination, awardDate } = awardPreviewTrip
  const dateLabel = awardDateLabel(awardDate)
  const bookingCurrencies = awardFixtures
    .map(({ airline, program }) => `${airline ?? 'availability only'} — ${program}`)
    .join('; ')

  return (
    <section className="award-preview" aria-label="Fictional static award preview">
      <p className="award-preview-request">Find awards from {origin} to {destination} on {dateLabel} for 2 adults, one way. Show all four cabins; compare Business awards.</p>
      <div className="award-preview-reply">
        <span className="award-preview-avatar"><Icon name="plane" /></span>
        <p className="award-preview-assistant">OptiMiles</p>
        <p className="award-preview-message">Static examples of complete, unknown and availability-only data.</p>
      </div>
      <section className="award-preview-results" aria-label={`Results for ${dateLabel}`}>
        <header>
          <h2>Results for <time dateTime={awardDate}>{dateLabel}</time></h2>
          <p>{origin} → {destination} · One way · 2 adults · All cabins · Prices per person · Fees in USD</p>
          <p>Preview only — fictional fares, timestamps, ratings and category badges. No search or ranking is performed.</p>
        </header>
        {awardFixtures.map((award) => <AwardCard key={award.id} award={award} />)}
        <p>Premium means premium economy. No award = reported unavailable; Not reported = unknown. Prices do not confirm seats for your party.</p>
        <p>Fictional booking currencies: {bookingCurrencies}.</p>
      </section>
    </section>
  )
}
