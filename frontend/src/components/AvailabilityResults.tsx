import { useRef, useState } from 'react'
import type { Cabin, SearchResponse, TripsResponse } from '../services/availability-api'
import { cabinOptions, programName } from '../services/availability-prototype'
import { sortSummaries, type SummarySort } from '../services/availability-presentation'
import { getMockHighlights, type MockComparison, type MockHighlight } from '../services/mock-comparisons'
import { awardDateLabel } from '../lib/trip-date'
import useAvailabilityTrips from '../useAvailabilityTrips'
import AvailabilitySummaryRow from './AvailabilitySummaryRow'
import AvailabilityPagination from './AvailabilityPagination'
import AvailabilityFilter from './AvailabilityFilter'
import AvailabilityHighlights from './AvailabilityHighlights'

type Props = {
  searchId: string | number
  response: SearchResponse
  initialCabins?: Cabin[]
  fetchTrips?: (availabilityId: string) => Promise<TripsResponse>
  mockComparisons?: MockComparison[]
  onComparisonCabinsChange?: (cabins: Cabin[]) => void
}

type OpenRow = {
  id: string
  cabin: Cabin
}

// A search owns its filters and cache, even when availability IDs are reused.
export default function AvailabilityResults(props: Props) {
  return <SearchResults key={props.searchId} {...props} />
}

function SearchResults({
  response,
  initialCabins = ['economy'],
  fetchTrips,
  mockComparisons,
  onComparisonCabinsChange,
}: Props) {
  const summaries = response.results
  const availableDates = [...new Set(summaries.map((row) => row.date))].sort()
  const availablePrograms = [...new Set(summaries.map((row) => row.source))]
  const programOptions = availablePrograms.map((source) => ({
    value: source ?? '',
    label: programName(source),
  }))
  const [cabins, setCabins] = useState<Cabin[]>(initialCabins)
  const [dates, setDates] = useState(availableDates)
  const [programs, setPrograms] = useState(programOptions.map((option) => option.value))
  const [sort, setSort] = useState<SummarySort>({ field: 'points', cabin: 'economy', direction: 'asc' })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(5)
  const [open, setOpen] = useState<OpenRow | null>(null)
  const [highlightKind, setHighlightKind] = useState<MockHighlight['kind'] | null>(null)
  const tableHeading = useRef<HTMLHeadingElement>(null)
  const { states, loadTrips } = useAvailabilityTrips(fetchTrips)
  const matchingRows = summaries.filter((row) => {
    return cabins.length > 0
      && dates.includes(row.date)
      && programs.includes(row.source ?? '')
  })
  const filteredRows = sortSummaries(matchingRows, sort)
  const comparisons = (mockComparisons ?? []).filter((sample) => {
    if (sample.cabin === null || !cabins.includes(sample.cabin)) {
      return false
    }
    const row = filteredRows.find((summary) => summary.availability_id === sample.availability_id)
    const cabin = row?.cabins.find((item) => item.cabin === sample.cabin)
    return cabin?.available === true && cabin.from_points !== null && cabin.from_points > 0
  })
  const highlights = getMockHighlights(comparisons)
  const selectedHighlight = highlights.find((highlight) => highlight.kind === highlightKind)
  const highlightedIds = new Set(selectedHighlight?.entries.map((entry) => entry.availability_id))
  const rows = filteredRows.filter((row) => !selectedHighlight || highlightedIds.has(row.availability_id))
  const cabinLabel = cabinOptions
    .filter((option) => cabins.includes(option.key))
    .map((option) => option.label)
    .join(' + ') || 'No cabins selected'

  function resetRows() {
    setPage(1)
    setOpen(null)
  }

  function changeSort(field: SummarySort['field'], cabin?: Cabin) {
    const reverse = sort.field === field && sort.cabin === cabin && sort.direction === 'asc'
    setSort({ field, cabin, direction: reverse ? 'desc' : 'asc' })
    resetRows()
  }

  function sortState(field: SummarySort['field'], cabin?: Cabin) {
    if (sort.field !== field || sort.cabin !== cabin) {
      return 'none'
    }
    return sort.direction === 'asc' ? 'ascending' : 'descending'
  }

  function sortArrow(field: SummarySort['field'], cabin?: Cabin) {
    const state = sortState(field, cabin)
    if (state === 'none') {
      return '↕'
    }
    return state === 'ascending' ? '↑' : '↓'
  }

  function toggleRow(id: string, cabin: Cabin) {
    if (open?.id === id) {
      setOpen(null)
      return
    }
    setOpen({ id, cabin })
    void loadTrips(id)
  }

  return (
    <section className="availability-results" aria-label="Award search results">
      <p className="availability-answer">
        I found {summaries.length} availability {summaries.length === 1 ? 'row' : 'rows'}.
        {' '}Expand a row to load its trips.
      </p>
      <p className="availability-list-note">
        {response.criteria.origin_airport ?? 'Origin unknown'} → {response.criteria.destination_airport ?? 'Destination unknown'}
        {' · '}{response.criteria.start_date ? awardDateLabel(response.criteria.start_date) : 'Start date unknown'}
        {' – '}{response.criteria.end_date ? awardDateLabel(response.criteria.end_date) : 'End date unknown'}
      </p>
      {mockComparisons && (
        <section className="availability-refinements panel" aria-label="Search highlights">
          <div className="availability-section-heading toolbar">
            <h3>Highlights <span>· {cabinLabel}</span></h3>
            <span>Mock comparisons</span>
          </div>
          <AvailabilityHighlights
            highlights={highlights}
            summaries={filteredRows}
            selected={highlightKind}
            onSelect={(kind) => {
              setHighlightKind(kind)
              resetRows()
            }}
          />
          <p className="availability-list-note">
            Higher CPP means more value · Assumed USD fares per person · Select a highlight to show matching rows
          </p>
        </section>
      )}
      <section aria-label="Daily award options" className="availability-daily-options">
        <div className="availability-section-heading toolbar">
          <div>
            <h3 ref={tableHeading}>Compare dates & programs</h3>
            <p>
              Starting points per cabin{mockComparisons && ' · CPP for that price'}
              {' · '}Select a row to load itineraries · {rows.length} matching rows
            </p>
          </div>
          <div className="availability-result-actions">
            {selectedHighlight && (
              <button
                className="compact-button compact-button--text"
                onClick={() => {
                  setHighlightKind(null)
                  resetRows()
                }}
              >
                Clear highlight
              </button>
            )}
            <div className="availability-controls" role="group" aria-label="Result filters">
              <AvailabilityFilter
                label="Cabins"
                allLabel="All cabins"
                values={cabins}
                options={cabinOptions.map((item) => ({ value: item.key, label: item.label }))}
                onChange={(values) => {
                  const selected = values as Cabin[]
                  setCabins(selected)
                  onComparisonCabinsChange?.(selected)
                  setHighlightKind(null)
                  resetRows()
                }}
              />
              <AvailabilityFilter
                label="Dates"
                allLabel="All dates"
                values={dates}
                options={availableDates.map((date) => ({ value: date, label: awardDateLabel(date) }))}
                onChange={(values) => {
                  setDates(values)
                  setHighlightKind(null)
                  resetRows()
                }}
              />
              <AvailabilityFilter
                label="Programs"
                allLabel="All programs"
                values={programs}
                options={programOptions}
                onChange={(values) => {
                  setPrograms(values)
                  setHighlightKind(null)
                  resetRows()
                }}
              />
            </div>
          </div>
        </div>
        <table className="availability-table">
          <caption className="visually-hidden">
            Compare dates and mileage programs. Click a column heading to sort; unknown prices stay last.
          </caption>
          <thead>
            <tr>
              <th scope="col" aria-sort={sortState('date')}>
                <button onClick={() => changeSort('date')}>Date {sortArrow('date')}</button>
              </th>
              <th scope="col" aria-sort={sortState('program')}>
                <button onClick={() => changeSort('program')}>Mileage program {sortArrow('program')}</button>
              </th>
              {cabinOptions.map((item) => (
                <th key={item.key} scope="col" aria-sort={sortState('points', item.key)}>
                  <button
                    aria-label={`Sort by ${item.label} points`}
                    onClick={() => changeSort('points', item.key)}
                  >
                    <span className="availability-cabin-label-full">{item.label}</span>
                    <span className="availability-cabin-label-short">
                      {item.key === 'premium' ? 'Premium' : item.label}
                    </span>
                    {' '}{sortArrow('points', item.key)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice((page - 1) * pageSize, page * pageSize).map((summary) => {
              const availabilityId = summary.availability_id
              const rowComparisons = mockComparisons?.filter((sample) => {
                return sample.availability_id === availabilityId
              })

              return (
                <AvailabilitySummaryRow
                  key={availabilityId}
                  summary={summary}
                  comparisonCabins={cabins}
                  mockComparisons={rowComparisons}
                  openCabin={open?.id === availabilityId ? open.cabin : null}
                  state={states[availabilityId]}
                  onToggle={(cabin) => toggleRow(availabilityId, cabin)}
                  onCabinChange={(cabin) => setOpen({ id: availabilityId, cabin })}
                  onRetry={() => void loadTrips(availabilityId)}
                />
              )
            })}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="availability-empty" role="status">No results match these filters.</p>
        )}
        <AvailabilityPagination
          label="Daily options pagination"
          unit="date / program rows"
          page={page}
          pageSize={pageSize}
          total={rows.length}
          onPageChange={(next, scroll) => {
            setPage(next)
            setOpen(null)
            if (scroll) {
              tableHeading.current?.scrollIntoView?.({ block: 'start' })
            }
          }}
          onPageSizeChange={(size) => {
            setPageSize(size)
            resetRows()
          }}
        />
      </section>
      <details className="availability-provenance">
        <summary>Available details & limitations</summary>
        <p>
          After expansion: departure and arrival times, journey duration, stops, taxes, reported seats and segments
          are shown when supplied. Sort those loaded trips by time, points or duration.
        </p>
        <p>
          The API summaries contain route, date, mileage program, cabin availability and starting points.
          They cannot establish global journey-duration or value rankings before trips load.
        </p>
        {mockComparisons && (
          <p>
            This preview adds separate mock cash and tax comparisons to populate CPP and highlights immediately.
            CPP uses matching USD cash fares and known taxes. Unknown availability and zero or unknown points
            display as Not available. Only trips with positive points are displayed. Cabin cells show the CPP
            for their starting-price itinerary. Highlight selections show matching rows.
          </p>
        )}
        <p>
          Live CPP and best-value scores require comparable cash prices. Qualitative value ratings, booking links,
          operating-carrier metadata and freshness indicators remain unavailable.
        </p>
        <p>
          Passenger availability is not guaranteed: seat counts may be unknown and search criteria do not include
          passenger count. Form passenger and cabin selections remain local preferences.
        </p>
        <p>
          Provider search pagination is deferred. Each expansion fetches all trips once for that availability ID,
          then filters, sorts and pages locally in groups of five; it does not request five trips at a time.
          Results are cached only for this search.
        </p>
        <p>Local mock fixtures · No live search. Mileage programs identify where points are redeemed, not the operating airline.</p>
      </details>
    </section>
  )
}
