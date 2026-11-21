import { Fragment, useId, useRef, useState, type ReactNode } from 'react'
import type { ChatCabin, ChatResponse } from '../services/chat-response'
import type { SearchResponse } from '../services/search-api'
import { cabinOptions, compareLoadedTrips, groupSummaries, sortSummaries, type SummarySort, type ValueGroup } from '../services/availability-presentation'
import { awardDateLabel } from '../lib/trip-date'
import AvailabilitySummaryRow from './AvailabilitySummaryRow'
import AvailabilityPagination from './AvailabilityPagination'
import AvailabilityFilter from './AvailabilityFilter'
import AvailabilityHighlights from './AvailabilityHighlights'
import TripDetails from './TripDetails'
import useTripDetails from '../useTripDetails'

type Props = {
  searchId: string | number
  response: ChatResponse | SearchResponse
  message?: ReactNode
}

function comparisonScope(group: ValueGroup) {
  return `${group.origin} → ${group.destination} · ${awardDateLabel(group.departure_date)} · ${group.passengers ?? 'Unknown'} ${group.passengers === 1 ? 'traveler' : 'travelers'}`
}

// Each response owns its filters and pagination.
export default function AvailabilityResults(props: Props) {
  return <SearchResults key={props.searchId} {...props} />
}

function SearchResults({ response, message }: Props) {
  const { states, load } = useTripDetails()
  const [open, setOpen] = useState<{ key: string; cabin: ChatCabin; selection: number } | null>(null)
  const detailsId = useId()
  const summaries = groupSummaries(response.results)
  const availableDates = [...new Set(summaries.map((row) => row.departure_date))].sort()
  const availablePrograms = [...new Set(summaries.map((row) => row.program))]
  const initialCabins = cabinOptions.filter((option) => summaries.some((row) => row.cabins[option.key]))
    .map((option) => option.key)
  const [cabins, setCabins] = useState<ChatCabin[]>(initialCabins)
  const [dates, setDates] = useState(availableDates)
  const [programs, setPrograms] = useState(availablePrograms)
  const [sort, setSort] = useState<SummarySort>({ field: 'points', cabin: initialCabins[0], direction: 'asc' })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(5)
  const [highlight, setHighlight] = useState<'value' | 'points' | null>(null)
  const tableHeading = useRef<HTMLHeadingElement>(null)
  const filteredResults = response.results.filter((row) => cabins.includes(row.cabin)
    && dates.includes(row.departure_date) && programs.includes(row.program))
  const loadedTrips = Object.values(states).flatMap((state) => state.status === 'success' ? state.response.trips : [])
  const allValues = compareLoadedTrips(response.results, loadedTrips)
  const comparison = compareLoadedTrips(filteredResults, loadedTrips, response.results)
  const bestValues = comparison.groups.flatMap((group) => group.bestValue === null ? [] : [group.bestValue])
  const bestValue = bestValues.length ? Math.max(...bestValues) : null
  const pointValues = comparison.groups.flatMap((group) => group.lowestPoints === null ? [] : [group.lowestPoints])
  const lowestPoints = pointValues.length ? Math.min(...pointValues) : null
  const bestKeys = new Set(comparison.groups.filter((group) => group.bestValue === bestValue)
    .flatMap((group) => [...group.bestKeys]))
  const lowestKeys = new Set(comparison.groups.filter((group) => group.lowestPoints === lowestPoints)
    .flatMap((group) => [...group.lowestKeys]))
  const selectedHighlight = (highlight === 'value' ? bestKeys.size : lowestKeys.size) ? highlight : null
  const selectedEntries = selectedHighlight ? comparison.entries.filter((entry) => selectedHighlight === 'value'
    ? bestKeys.has(entry.key) : lowestKeys.has(entry.key)) : null
  const selectedKeys = selectedEntries ? new Set(selectedEntries.map((entry) => entry.key)) : undefined
  const rows = sortSummaries(summaries.filter((row) => cabins.some((cabin) => row.cabins[cabin])
    && (!selectedEntries || selectedEntries.some((entry) => row.offers.includes(entry.result)))
    && dates.includes(row.departure_date) && programs.includes(row.program)), sort)
  const currentPage = Math.min(page, Math.max(1, Math.ceil(rows.length / pageSize)))
  const warnings = response.warnings?.length ? response.warnings : response.partial
    ? ['Search coverage is incomplete. Results may not include all available awards.'] : []

  function changeSort(field: SummarySort['field'], cabin?: ChatCabin) {
    const reverse = sort.field === field && sort.cabin === cabin && sort.direction === 'asc'
    setSort({ field, cabin, direction: reverse ? 'desc' : 'asc' })
    setPage(1)
    setOpen(null)
  }

  function selectHighlight(kind: 'value' | 'points' | null) {
    setHighlight(kind)
    setPage(1)
    const entry = comparison.entries.find((item) => kind === 'value'
      ? bestKeys.has(item.key) : kind === 'points' && lowestKeys.has(item.key))
    const summary = entry && summaries.find((row) => row.offers.includes(entry.result))
    if (summary && entry) setOpen({ key: summary.key, cabin: entry.result.cabin, selection: 0 })
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
    {response.results.length ? `${response.results.length} award ${response.results.length === 1 ? 'option' : 'options'} returned.`
      : 'No award options were returned.'}
  </p>

  return (
    <section className="availability-results" aria-label="Award search results">
      <section className="conversation-message-bubble" aria-label="Assistant message">
        {message}{answer}
      </section>
      {warnings.length > 0 && <section role="status" aria-label="Search coverage" className="availability-list-note">
        {response.partial && <strong>Partial search results</strong>}
        {warnings.map((warning, index) => <p key={index}>{warning}</p>)}
      </section>}
      {summaries.length > 0 && <>
        <AvailabilityHighlights
          cabinLabel={cabinOptions.filter((item) => cabins.includes(item.key)).map((item) => item.label).join(', ')}
          scope={comparison.groups.length === 1 ? comparisonScope(comparison.groups[0])
            : `${dates.length === 1 ? awardDateLabel(dates[0]) : `${dates.length} selected dates`} · ${comparison.groups.length} comparisons`}
          bestValue={bestValue} lowestPoints={lowestPoints}
          eligibleCount={comparison.entries.filter((entry) => entry.eligible).length}
          loadedCount={comparison.entries.length} selected={selectedHighlight} onSelect={selectHighlight} />
        <section aria-label="Daily award options" className="availability-daily-options">
          <div className="availability-section-heading toolbar">
            <div>
              <h3 ref={tableHeading}>Compare dates & programs</h3>
              <p>Starting points per cabin · CPP from matched loaded trips · {rows.length} matching rows</p>
            </div>
            <div className="availability-result-actions">
              <div className="availability-controls" role="group" aria-label="Result filters">
                <AvailabilityFilter label="Cabins" allLabel="All cabins" values={cabins}
                  options={cabinOptions.map((item) => ({ value: item.key, label: item.label }))}
                  onChange={(values) => {
                    setCabins(values as ChatCabin[])
                    setPage(1)
                    setOpen(null)
                    setHighlight(null)
                  }} />
                <AvailabilityFilter label="Dates" allLabel="All dates" values={dates}
                  options={availableDates.map((date) => ({ value: date, label: awardDateLabel(date) }))}
                  onChange={(values) => { setDates(values); setPage(1); setOpen(null); setHighlight(null) }} />
                <AvailabilityFilter label="Programs" allLabel="All programs" values={programs}
                  options={availablePrograms.map((program) => ({ value: program, label: program }))}
                  onChange={(values) => { setPrograms(values); setPage(1); setOpen(null); setHighlight(null) }} />
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
            <tbody>{rows.slice((currentPage - 1) * pageSize, currentPage * pageSize).map((summary, index) => {
              const ids = summary.availabilityIds
              const pending = ids.some((id) => !states[id] || states[id].status === 'pending')
              const failedIds = ids.filter((id) => states[id]?.status === 'failed')
              const loaded = ids.flatMap((id) => {
                const state = states[id]
                return state?.status === 'success' ? [state.response] : []
              })
              const cabin = sort.cabin && cabins.includes(sort.cabin) && summary.cabins[sort.cabin]
                ? sort.cabin : cabins.find((cabin) => summary.cabins[cabin])!
              const expanded = open?.key === summary.key
              const panelId = `${detailsId}-${index}`
              return <Fragment key={summary.key}>
                <AvailabilitySummaryRow summary={summary} comparison={allValues} comparisonCabins={cabins} open={expanded}
                  detailsId={panelId} onToggle={() => {
                    setOpen(expanded ? null : { key: summary.key, cabin, selection: 0 })
                    if (!expanded) ids.forEach((id) => void load(id))
                  }} onSelectCabin={(cabin) => {
                    setOpen((previous) => ({ key: summary.key, cabin, selection: (previous?.selection ?? 0) + 1 }))
                    ids.forEach((id) => void load(id))
                  }} />
                {expanded && ids.length > 0 && <tr className="availability-detail-row"><td colSpan={6}>
                  <section id={panelId} className="availability-expanded" aria-label={`Trips for ${summary.program}`}>
                    {pending && <p role="status">Loading trip details…</p>}
                    {failedIds.length > 0 && <div role="alert">
                      {[...new Set(failedIds.map((id) => {
                        const state = states[id]
                        return state.status === 'failed' ? state.error : ''
                      }))].map((error) => <p key={error}>{error}</p>)}
                      <button className="compact-button compact-button--outline"
                        onClick={() => failedIds.forEach((id) => void load(id))}>Retry trip details</button>
                    </div>}
                    {!pending && failedIds.length === 0 && <TripDetails key={`${open?.selection}-${selectedHighlight}`} cabin={open?.cabin ?? cabin}
                      entries={allValues.entries.filter((entry) => summary.offers.includes(entry.result))}
                      bestKeys={bestKeys} visibleKeys={selectedKeys}
                      response={{
                        trips: loaded.flatMap((detail) => detail.trips),
                        booking_links: [...new Map(loaded.flatMap((detail) => detail.booking_links)
                          .map((link) => [link.url, link])).values()],
                      }} route={`${summary.origin} → ${summary.destination}`} />}
                  </section>
                </td></tr>}
              </Fragment>
            })}</tbody>
          </table>
          {rows.length === 0 && <p className="availability-empty" role="status">No results match these filters.</p>}
          <AvailabilityPagination label="Daily options pagination" unit="rows" page={currentPage}
            pageSize={pageSize} total={rows.length}
            onPageChange={(next, scroll) => {
              setPage(next)
              setOpen(null)
              if (scroll) tableHeading.current?.scrollIntoView?.({ block: 'start' })
            }}
            onPageSizeChange={(size) => { setPageSize(size); setPage(1); setOpen(null) }} />
        </section>
      </>}
    </section>
  )
}
