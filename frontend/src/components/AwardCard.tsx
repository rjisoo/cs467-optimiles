import { useId } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import Icon from './Icon'
import AwardValue from './AwardValue'
import { awardDateLabel, cabinNames, formatUsd, type AwardDisplay } from './award-display'
import './AwardCard.css'

const categoryIcons = { 'The best value': 'trophy', 'Shortest journey': 'timer', 'Lowest points': 'coins' } as const

export default function AwardCard({ award }: { award: AwardDisplay }) {
  const headingId = useId()
  const { schedule } = award

  return (
    <article aria-labelledby={headingId} className="award-container">
      <Card className="award-card">
        <div className="award-body">
          <div className="award-itinerary">
            <header className="award-heading">
              <h3 id={headingId}>
                <span className="award-mark" data-unknown={!award.airline}><Icon name={award.airlineMark} /></span>
                <span>{award.airline ?? 'Airline unavailable'}</span>
              </h3>
              <div className="award-categories" aria-label="Illustrative category badges">
                {award.previewCategories.map((category) => (
                  <Badge key={category} className="award-category" data-value={category === 'The best value'}>
                    <span className="award-category-icon"><Icon name={categoryIcons[category]} /></span>{category}
                  </Badge>
                ))}
              </div>
            </header>
            <div className="award-route" data-unknown={!schedule}>
              <div className="award-origin">
                <strong className="award-airport">{award.origin}</strong>
                <p className="award-time">{schedule?.departure ?? 'Unavailable'} <span>{schedule?.departureZone}</span></p>
                <div className="award-date">
                  <time dateTime={award.awardDate}>{awardDateLabel(award.awardDate)}</time>
                </div>
              </div>
              <div className="award-journey">
                <p>{schedule?.duration ?? 'Duration unknown'}</p>
                <div className="award-route-line" />
                <p>{schedule?.stops ?? 'Stops unknown'}</p>
              </div>
              <div className="award-destination">
                <div className="award-arrival-airport">
                  <strong className="award-airport">{award.destination}</strong>
                  {schedule && <span className="award-day-offset">{schedule.dayOffset}</span>}
                </div>
                <p className="award-time">{schedule?.arrival ?? 'Unavailable'} <span>{schedule?.arrivalZone}</span></p>
                <div className="award-date">
                  {schedule ? <time dateTime={schedule.arrivalDate}>{awardDateLabel(schedule.arrivalDate)}</time> : <p>Date unavailable</p>}
                </div>
              </div>
            </div>
          </div>
          <div className="award-cabins" role="group" aria-label="Cabin points and USD fees per person, one way">
            {cabinNames.map((cabin) => {
              const fare = award.cabins[cabin]
              let feeLabel = ''
              if (fare.status === 'available') {
                feeLabel = fare.fees === null ? 'Fees unknown' : `+ ${formatUsd(fare.fees)}`
              }
              return (
                <section className="award-cabin" key={cabin} data-cabin={cabin} aria-label={cabin === 'Premium' ? 'Premium economy' : cabin}>
                  <h4>{cabin}</h4>
                  <div className="award-price">
                    {fare.status === 'available' ? (
                      <strong className="award-points">{fare.points.toLocaleString('en-US')}</strong>
                    ) : <p className="award-missing">{fare.status}</p>}
                    <p className="award-fees" data-unknown={fare.status === 'available' && fare.fees === null}>{feeLabel}</p>
                  </div>
                  <AwardValue cabin={cabin} fare={fare} />
                </section>
              )
            })}
          </div>
        </div>
        <footer className="award-footer">
          <span>{!schedule && 'Availability only · '}{award.seatNote}</span>
          <span>{award.checked ? <>Last checked <time dateTime={award.checked.dateTime}>{award.checked.label}</time> · illustrative</> : 'Last checked time unavailable'}</span>
        </footer>
      </Card>
    </article>
  )
}
