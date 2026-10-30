import { Fragment, useId } from 'react'
import type { AvailabilitySummary, Cabin } from '../services/availability-api'
import { cabinOptions, programName } from '../services/availability-prototype'
import { awardDateLabel } from '../lib/trip-date'
import type { TripLoadState } from '../useAvailabilityTrips'
import AvailabilityTrips from './AvailabilityTrips'
import Icon from './Icon'
import { representativeComparison, type MockComparison } from '../services/mock-comparisons'
import MockValue from './MockValue'

type Props = {
  summary: AvailabilitySummary
  comparisonCabins: Cabin[]
  mockComparisons?: MockComparison[]
  openCabin: Cabin | null
  state: TripLoadState | undefined
  onToggle: (cabin: Cabin) => void
  onCabinChange: (cabin: Cabin) => void
  onRetry: () => void
}

export default function AvailabilitySummaryRow({
  summary,
  comparisonCabins,
  mockComparisons,
  openCabin,
  state,
  onToggle,
  onCabinChange,
  onRetry,
}: Props) {
  const panelId = useId()
  const isOpen = openCabin !== null
  const availableCabins = summary.cabins.filter((item) => item.available !== false)
  const defaultCabin = availableCabins.find((item) => comparisonCabins.includes(item.cabin))?.cabin
    ?? availableCabins[0]?.cabin
    ?? 'economy'

  function toggleRow(clickedCabin?: string | null) {
    const cabin = availableCabins.find((item) => item.cabin === clickedCabin)?.cabin
    onToggle(cabin ?? defaultCabin)
  }

  return (
    <Fragment>
      <tr
        className="availability-day"
        aria-label={`${awardDateLabel(summary.date)} ${programName(summary.source)}`}
        tabIndex={0}
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={(event) => {
          const target = event.target
          if (!(target instanceof Element) || target.closest('button, a, input, select, textarea')) {
            return
          }
          toggleRow(target.closest('[data-cabin]')?.getAttribute('data-cabin'))
        }}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget || !['Enter', ' '].includes(event.key)) {
            return
          }
          event.preventDefault()
          toggleRow()
        }}
      >
        <th scope="row" className="availability-date-cell">
          <time dateTime={summary.date}>{awardDateLabel(summary.date)}</time>
          <span>{summary.origin_airport} → {summary.destination_airport}</span>
        </th>
        <td className="availability-program-cell">
          <div className="availability-airline">
            <span className="availability-airline-mark" aria-hidden="true">
              <Icon name="aircraft" />
            </span>
            <span>{programName(summary.source)}</span>
          </div>
        </td>
        {cabinOptions.map(({ key, label }) => {
          const cabin = summary.cabins.find((item) => item.cabin === key)
          const representative = representativeComparison(mockComparisons ?? [], key)
          const comparison = representative?.points === cabin?.from_points ? representative : undefined
          const points = cabin?.available === true ? cabin.from_points : null
          const hasPrice = points !== null && points > 0
          let description = 'Not available'
          if (hasPrice) {
            description = `From ${points.toLocaleString('en-US')} pts`
          }
          return (
            <td
              key={key}
              className="availability-cabin"
              data-cabin={key}
              data-selected={comparisonCabins.includes(key)}
            >
              <section aria-label={`${label} daily option`}>
                <h4>{label}</h4>
                <p className="availability-cabin-points">{description}</p>
                {mockComparisons && hasPrice && (
                  <MockValue comparison={comparison} />
                )}
              </section>
            </td>
          )
        })}
      </tr>
      {isOpen && (
        <tr className="availability-detail-row">
          <td colSpan={6}>
            <div id={panelId} className="availability-expanded">
              <AvailabilityTrips
                summary={summary}
                cabin={openCabin}
                onCabinChange={onCabinChange}
                state={state}
                onRetry={onRetry}
                mockComparisons={mockComparisons}
              />
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  )
}
