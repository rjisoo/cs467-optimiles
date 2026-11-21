import './AwardValue.css'

type Props = {
  cabinLabel: string
  scope: string
  bestValue: number | null
  lowestPoints: number | null
  eligibleCount: number
  loadedCount: number
  selected: 'value' | 'points' | null
  onSelect: (kind: 'value' | 'points' | null) => void
}

export default function AvailabilityHighlights({ cabinLabel, scope, bestValue, lowestPoints,
  eligibleCount, loadedCount, selected, onSelect }: Props) {
  const highlights = [
    { kind: 'value' as const, label: 'Best estimated value', metric: bestValue,
      formatted: bestValue === null ? '' : `${bestValue.toFixed(2)}¢ / pt`,
      detail: `${eligibleCount} eligible loaded ${eligibleCount === 1 ? 'trip' : 'trips'}` },
    { kind: 'points' as const, label: 'Lowest points', metric: lowestPoints,
      formatted: lowestPoints === null ? '' : `${lowestPoints.toLocaleString('en-US')} pts`,
      detail: `Among ${loadedCount} loaded ${loadedCount === 1 ? 'trip' : 'trips'}` },
  ].filter((highlight) => highlight.metric !== null)
  if (!highlights.length) return null
  return (
    <section className="availability-highlight-section" aria-label="Award highlights">
      <div className="availability-highlight-heading">
        <h3>Highlights <span>· {cabinLabel}</span></h3>
        <p>{scope}</p>
      </div>
      <div className="availability-highlights">
        {highlights.map((highlight) => (
            <button
              key={highlight.kind}
              type="button"
              className="availability-highlight"
              data-kind={highlight.kind}
              aria-pressed={selected === highlight.kind}
              onClick={() => onSelect(selected === highlight.kind ? null : highlight.kind)}
            >
              <span className="availability-highlight-row toolbar">
                <span className="availability-highlight-copy">
                  <span className="availability-highlight-label">
                    {highlight.kind === 'value' && <span aria-hidden="true">★ </span>}{highlight.label}
                  </span>
                  <span className="availability-highlight-count">{highlight.detail}</span>
                </span>
                <strong className="availability-highlight-metric">{highlight.formatted}</strong>
              </span>
            </button>
        ))}
      </div>
      {bestValue !== null && <p className="availability-highlight-note">
        Higher CPP means more value · Cash fares are estimates · Unknown fees are excluded from value comparisons
      </p>}
    </section>
  )
}
