import { useRef, useState, type ReactNode } from 'react'
import type { ChatCabin, ChatResponse } from '../services/chat-response'
import { cabinOptions, sortSummaries, type SummarySort } from '../services/availability-presentation'
import { awardDateLabel } from '../lib/trip-date'
import AvailabilitySummaryRow from './AvailabilitySummaryRow'
import AvailabilityPagination from './AvailabilityPagination'
import AvailabilityFilter from './AvailabilityFilter'

type Props = {
  searchId: string | number
  response: ChatResponse
  message?: ReactNode
}

// Each response owns its filters and pagination.
export default function AvailabilityResults(props: Props) {
  return <SearchResults key={props.searchId} {...props} />
}

function SearchResults({ response, message }: Props) {
  const summaries = response.results
  const availableDates = [...new Set(summaries.map((row) => row.departure_date))].sort()
  const availablePrograms = [...new Set(summaries.map((row) => row.program))]
  const initialCabins = cabinOptions.filter((option) => summaries.some((row) => row.cabin === option.key))
    .map((option) => option.key)
  const [cabins, setCabins] = useState<ChatCabin[]>(initialCabins)
  const [dates, setDates] = useState(availableDates)
  const [programs, setPrograms] = useState(availablePrograms)
  const [sort, setSort] = useState<SummarySort>({ field: 'points', cabin: initialCabins[0], direction: 'asc' })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(5)
  const tableHeading = useRef<HTMLHeadingElement>(null)
  const rows = sortSummaries(summaries.filter((row) => cabins.includes(row.cabin)
    && dates.includes(row.departure_date) && programs.includes(row.program)), sort)

  function changeSort(field: SummarySort['field'], cabin?: ChatCabin) {
    const reverse = sort.field === field && sort.cabin === cabin && sort.direction === 'asc'
    setSort({ field, cabin, direction: reverse ? 'desc' : 'asc' })
    setPage(1)
  }

  function sortState(field: SummarySort['field'], cabin?: ChatCabin) {
    if (sort.field !== field || sort.cabin !== cabin) return 'none'
    return sort.direction === 'asc' ? 'ascending' : 'descending'
  }

  function sortArrow(field: SummarySort['field'], cabin?: ChatCabin) {
    const state = sortState(field, cabin)
    return state === 'none' ? '↕' : state === 'ascending' ? '↑' : '↓'
  }

  const answer = <p className="availability-answer">
    {summaries.length ? `${summaries.length} award ${summaries.length === 1 ? 'option' : 'options'} returned.`
      : 'No award options were returned.'}
  </p>

  return (
    <section className="availability-results" aria-label="Award search results">
      <section className="conversation-message-bubble" aria-label="Assistant message">
        {message}{answer}
      </section>
      {summaries.length > 0 && <>
        <section aria-label="Daily award options" className="availability-daily-options">
          <div className="availability-section-heading toolbar">
            <div>
              <h3 ref={tableHeading}>Compare dates & programs</h3>
              <p>Reported points per cabin · {rows.length} matching rows</p>
            </div>
            <div className="availability-result-actions">
              <div className="availability-controls" role="group" aria-label="Result filters">
                <AvailabilityFilter label="Cabins" allLabel="All cabins" values={cabins}
                  options={cabinOptions.map((item) => ({ value: item.key, label: item.label }))}
                  onChange={(values) => {
                    setCabins(values as ChatCabin[])
                    setPage(1)
                  }} />
                <AvailabilityFilter label="Dates" allLabel="All dates" values={dates}
                  options={availableDates.map((date) => ({ value: date, label: awardDateLabel(date) }))}
                  onChange={(values) => { setDates(values); setPage(1) }} />
                <AvailabilityFilter label="Programs" allLabel="All programs" values={programs}
                  options={availablePrograms.map((program) => ({ value: program, label: program }))}
                  onChange={(values) => { setPrograms(values); setPage(1) }} />
              </div>
            </div>
          </div>
          <table className="availability-table">
            <caption className="visually-hidden">
              Compare dates and mileage programs. Click a column heading to sort; unreported cabin prices stay last.
            </caption>
            <thead><tr>
              <th scope="col" aria-sort={sortState('date')}>
                <button onClick={() => changeSort('date')}>Date {sortArrow('date')}</button>
              </th>
              <th scope="col" aria-sort={sortState('program')}>
                <button onClick={() => changeSort('program')}>Mileage program {sortArrow('program')}</button>
              </th>
              {cabinOptions.map((item) => <th key={item.key} scope="col" aria-sort={sortState('points', item.key)}>
                <button aria-label={`Sort by ${item.label} points`} onClick={() => changeSort('points', item.key)}>
                  <span className="availability-cabin-label-full">{item.label}</span>
                  <span className="availability-cabin-label-short">{item.key === 'premium_economy' ? 'Premium' : item.label}</span>
                  {' '}{sortArrow('points', item.key)}
                </button>
              </th>)}
            </tr></thead>
            <tbody>{rows.slice((page - 1) * pageSize, page * pageSize).map((summary, index) =>
              <AvailabilitySummaryRow key={index} summary={summary} comparisonCabins={cabins} />)}
            </tbody>
          </table>
          {rows.length === 0 && <p className="availability-empty" role="status">No results match these filters.</p>}
          <AvailabilityPagination label="Daily options pagination" unit="award options" page={page}
            pageSize={pageSize} total={rows.length}
            onPageChange={(next, scroll) => {
              setPage(next)
              if (scroll) tableHeading.current?.scrollIntoView?.({ block: 'start' })
            }}
            onPageSizeChange={(size) => { setPageSize(size); setPage(1) }} />
        </section>
        <details className="availability-provenance">
          <summary>Available details & limitations</summary>
          <p>Each row shows one returned award option. Cash fees are in USD; CPP is shown only when reported.</p>
          <p>Reported seat counts do not confirm availability for your whole party. Flight schedules and trip details are not available here yet.</p>
        </details>
      </>}
    </section>
  )
}
