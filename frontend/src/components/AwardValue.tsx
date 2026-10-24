import { useId, useRef } from 'react'
import { Popover } from 'radix-ui'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatUsd, type CabinFare, type CabinName } from './award-display'
import './AwardValue.css'

export default function AwardValue({ cabin, fare }: { cabin: CabinName; fare: CabinFare }) {
  const titleId = useId()
  const explanationRef = useRef<HTMLDivElement>(null)
  if (fare.status !== 'available' || !fare.previewValue || fare.fees === null) {
    return <div className="award-value">Value unavailable</div>
  }
  const { cpp, cashFare, rating } = fare.previewValue
  const cabinLabel = cabin === 'Premium' ? 'Premium economy' : cabin

  return (
    <div className="award-value">
      <span>
        <strong>{cpp}¢</strong><span className="award-value-unit" aria-hidden="true"> / point</span>
        <span className="visually-hidden"> per point</span>
      </span>
      <Popover.Root>
        <Popover.Trigger asChild>
          <button type="button" className="award-rating-trigger" aria-label={`${cabinLabel}: ${rating} value, illustrative preview. Show explanation`}>
            <Badge className="award-rating" data-rating={rating}>{rating}</Badge>
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content className="award-explanation" ref={explanationRef} tabIndex={0}
            aria-labelledby={titleId} sideOffset={6} collisionPadding={16}
            onOpenAutoFocus={(event) => {
              event.preventDefault()
              explanationRef.current?.focus({ preventScroll: true })
            }}>
            <div className="award-explanation-header">
              <strong id={titleId}>How value is calculated</strong>
              <Popover.Close asChild>
                <Button className="award-explanation-close" variant="outline" type="button" aria-label="Close value explanation">Close</Button>
              </Popover.Close>
            </div>
            <p>{cabinLabel} · Per person · One way</p>
            <p>Comparable cash fare: USD {cashFare.toLocaleString('en-US')}<br />
              Award cash fees: {formatUsd(fare.fees)}<br />Points required: {fare.points.toLocaleString('en-US')}</p>
            <p>(USD {cashFare.toLocaleString('en-US')} − {formatUsd(fare.fees)}) ÷ {fare.points.toLocaleString('en-US')} × 100 ≈ {cpp}¢ per point</p>
            <p>Same itinerary, cabin, currency and traveler basis. Fictional fares; ratings are illustrative, with no approved benchmarks.</p>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  )
}
