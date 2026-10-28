import { Popover } from 'radix-ui'
import { calculateMockCpp, type MockComparison } from '../services/mock-comparisons'

function dollars(minor: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(minor / 100)
}

export default function MockValue({ comparison }: { comparison?: MockComparison }) {
  const cpp = comparison ? calculateMockCpp(comparison) : null
  if (cpp === null || !comparison) {
    return <span className="availability-list-note">CPP unavailable</span>
  }

  return (
    <div className="availability-value">
      <Popover.Root>
        <Popover.Trigger asChild>
          <button
            className="availability-cpp-button"
            aria-label={`Explain CPP: ${cpp.toFixed(2)} cents per point`}
          >
            {cpp.toFixed(2)}¢ / pt
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            className="popover-surface availability-value-explanation"
            sideOffset={8}
            collisionPadding={12}
          >
            <strong>Mock cash comparison</strong>
            <p>
              Comparable cash fare: {dollars(comparison.cash_price_minor!)} USD.
              {' '}Award taxes: {dollars(comparison.taxes_minor!)} USD.
              {' '}Award price: {comparison.points!.toLocaleString('en-US')} points.
            </p>
            <p>
              (Cash fare − award taxes) ÷ points × 100 = {cpp.toFixed(2)} cents per point.
            </p>
            <p>Assumed cash price for one person, one way, in the same itinerary and cabin. No currency conversion.</p>
            <Popover.Close className="compact-button compact-button--text">Close explanation</Popover.Close>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  )
}
