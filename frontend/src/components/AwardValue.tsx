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
  bestScope?: string
}

const dollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

export default function AwardValue({ value, best = false, compact = false, bestScope }: Props) {
  const titleId = useId()
  const explanationRef = useRef<HTMLDivElement>(null)
  if (!value) return null
  const { cpp, cashFare, fees, points, rating, cabin } = value
  const cabinLabel = cabinOptions.find((option) => option.key === cabin)?.label ?? cabin
  const ratingLabel = rating[0].toUpperCase() + rating.slice(1)
  const formattedCpp = cpp.toFixed(2)

  return (
    <div className="award-value" data-compact={compact}>
      <Popover.Root>
        <Popover.Trigger asChild>
          <button type="button" className="award-rating-trigger"
            aria-label={`${cabinLabel}: estimated ${formattedCpp} cents per point, ${ratingLabel} value. Show explanation`}>
            <span className="award-cpp-link">{compact && 'Est. '}{formattedCpp}¢ / pt</span>
            {!compact && <small>Est. CPP</small>}
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
              <div><dt>This trip’s award fees</dt><dd>{dollars.format(fees)} USD</dd></div>
              <div><dt>Points required</dt><dd>{points.toLocaleString('en-US')}</dd></div>
            </dl>
            <p>({dollars.format(cashFare)} − {dollars.format(fees)}) ÷ {points.toLocaleString('en-US')} × 100 ≈ {formattedCpp}¢ per point.</p>
            <p>The cash fare comes from Google Flights via SerpApi for the same route, date and cabin. It may be a different flight.</p>
            <p>Ratings use fixed CPP thresholds: Bad below 1¢; Fair from 1¢; Good from 1.3¢; Great from 1.7¢; Exceptional from 2.5¢. These are comparison tiers, not a loyalty program’s point valuation.</p>
            {best && <p>Best value: {bestScope ?? 'highest estimated CPP among eligible loaded trips in this comparison'}. Ties share the badge. Trips with unknown fees or insufficient comparison evidence are excluded.</p>}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      <Badge className="award-rating" data-rating={rating}>{ratingLabel}</Badge>
      {best && <Badge className="award-best" variant="outline" title={bestScope}>
        <span aria-hidden="true">★</span> Best value
      </Badge>}
    </div>
  )
}
