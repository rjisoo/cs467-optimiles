import { useId, useRef } from 'react'
import { Popover } from 'radix-ui'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cabinOptions, type TripValue } from '../services/availability-presentation'
import './AwardValue.css'

type Props = {
  value: TripValue | null | undefined
  best?: boolean
  compact?: boolean
}

const dollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

export default function AwardValue({ value, best = false, compact = false }: Props) {
  const titleId = useId()
  const explanationRef = useRef<HTMLDivElement>(null)
  if (!value) return null
  const { cpp, cashFare, fees, points, rating, cabin, feeBasis, pointsBasis, cabinVerified } = value
  const cabinLabel = cabinOptions.find((option) => option.key === cabin)?.label ?? cabin
  const ratingLabel = rating[0].toUpperCase() + rating.slice(1)
  const formattedCpp = cpp.toFixed(2)
  const beforeFees = feeBasis === 'before_fees'
  const qualifier = [beforeFees && 'Before fees', pointsBasis === 'trip' && !cabinVerified && 'Cabin unverified']
    .filter(Boolean).join(' · ')

  return (
    <div className="award-value" data-compact={compact}>
      <Popover.Root>
        <Popover.Trigger asChild>
          <button type="button" className="award-rating-trigger"
            aria-label={`${cabinLabel}: estimated ${formattedCpp} cents per point, ${ratingLabel} value${qualifier ? `, ${qualifier}` : ''}. Show explanation`}>
            <span className="award-cpp-link">{compact && 'Est. '}{formattedCpp}¢ / pt</span>
            {(qualifier || !compact) && <small>{qualifier || 'Est. CPP'}</small>}
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content className="award-explanation" ref={explanationRef} tabIndex={0}
            aria-labelledby={titleId} sideOffset={6} collisionPadding={16}
            onClick={(event) => event.stopPropagation()}
            onOpenAutoFocus={(event) => {
              event.preventDefault()
              explanationRef.current?.focus({ preventScroll: true })
            }}>
            <div className="award-explanation-header">
              <strong id={titleId}>How estimated value is calculated</strong>
              <Popover.Close asChild>
                <Button className="award-explanation-close" variant="outline" type="button" aria-label="Close value explanation">Close</Button>
              </Popover.Close>
            </div>
            <p>{cabinLabel} · Per person · One way</p>
            <dl className="award-value-breakdown">
              <div><dt>Estimated cash fare</dt><dd>{dollars.format(cashFare)} USD</dd></div>
              <div><dt>{pointsBasis === 'summary' ? 'Award fees' : 'This trip’s award fees'}</dt>
                <dd>{fees === null ? 'Not included' : `${dollars.format(fees)} USD`}</dd></div>
              <div><dt>{pointsBasis === 'summary' ? 'Points' : 'Points required'}</dt><dd>{points.toLocaleString('en-US')}</dd></div>
            </dl>
            <p>{fees === null ? dollars.format(cashFare) : `(${dollars.format(cashFare)} − ${dollars.format(fees)})`} ÷ {points.toLocaleString('en-US')} × 100 ≈ {formattedCpp}¢ per point{beforeFees ? ' before fees' : ''}.</p>
            {beforeFees && <p>This estimate excludes award fees. Fees are not assumed to be zero; the final CPP and rating may be lower.</p>}
            {feeBasis === 'summary_currency' && <p>Fee currency is inferred from the matching availability summary. The fee amount and points belong to this trip.</p>}
            {pointsBasis === 'summary' && <p>Uses starting points from the availability summary. An individual flight may require more points.</p>}
            {pointsBasis === 'trip' && !cabinVerified && <p>The provider has not confirmed that the entire trip is in this cabin.</p>}
            <p>The cash fare comes from Google Flights via SerpApi for the same route, date and cabin. It may be a different flight.</p>
            <p>Ratings use fixed CPP thresholds: Bad below 1¢; Fair from 1¢; Good from 1.3¢; Great from 1.7¢; Exceptional from 2.5¢. These are comparison tiers, not a loyalty program’s point valuation.</p>
            {best && <p>Best value is the highest displayed CPP among summaries and loaded trips matching the current filters. Ties share the badge. Estimates that include fees rank ahead of before-fees estimates, and trips reporting fewer seats than your party are skipped.</p>}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      <Badge className="award-rating" data-rating={rating}>{ratingLabel}</Badge>
      {best && <Badge className="award-best" variant="outline">
        <span aria-hidden="true">★</span> Best value
      </Badge>}
    </div>
  )
}
