import type { AvailabilitySummary } from '../services/availability-api'
import { getMockHighlights } from '../services/mock-comparisons'

type Highlight = ReturnType<typeof getMockHighlights>[number]

type Props = {
  highlights: Highlight[]
  summaries: AvailabilitySummary[]
  selected: Highlight['kind'] | null
  onSelect: (kind: Highlight['kind'] | null) => void
}

function metricLabel(highlight: Highlight) {
  const { metric, kind } = highlight
  if (metric === null) {
    return 'Unavailable'
  }
  if (kind === 'value') {
    return `${metric.toFixed(2)}¢ / pt`
  }
  return `${metric.toLocaleString('en-US')} pts`
}

export default function AvailabilityHighlights({ highlights, summaries, selected, onSelect }: Props) {
  return (
    <section className="availability-highlight-section" aria-label="Award highlights">
      <div className="availability-highlights">
        {highlights.map((highlight) => {
          const ids = new Set(highlight.entries.map((entry) => entry.availability_id))
          const matchingDates = summaries
            .filter((row) => ids.has(row.availability_id))
            .map((row) => row.date)
          const dates = new Set(matchingDates)
          return (
            <button
              key={highlight.kind}
              className="surface availability-highlight"
              aria-pressed={selected === highlight.kind}
              disabled={highlight.metric === null}
              onClick={() => onSelect(selected === highlight.kind ? null : highlight.kind)}
            >
              <span className="availability-highlight-row toolbar">
                <span className="availability-highlight-copy">
                  <span className="availability-highlight-label">{highlight.label}</span>
                  <span className="availability-highlight-count">
                    {highlight.entries.length} mock {highlight.entries.length === 1 ? 'offer' : 'offers'}
                    {' · '}{dates.size} {dates.size === 1 ? 'date' : 'dates'}
                  </span>
                </span>
                <strong className="availability-highlight-metric">{metricLabel(highlight)}</strong>
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
