import type { ChatCabin, ChatResult } from './chat-response'

export const cabinOptions: { key: ChatCabin; label: string }[] = [
  { key: 'economy', label: 'Economy' },
  { key: 'premium_economy', label: 'Premium economy' },
  { key: 'business', label: 'Business' },
  { key: 'first', label: 'First' },
]

export type AvailabilitySummary = Pick<ChatResult, 'departure_date' | 'program' | 'origin' | 'destination'> & {
  key: string
  cabins: Partial<Record<ChatCabin, ChatResult>>
  availabilityIds: string[]
}

export function groupSummaries(results: ChatResult[]): AvailabilitySummary[] {
  const groups = new Map<string, AvailabilitySummary>()
  for (const result of results) {
    const { departure_date, program, origin, destination } = result
    const key = JSON.stringify([departure_date, program, origin, destination])
    let group = groups.get(key)
    if (!group) {
      group = { key, departure_date, program, origin, destination, cabins: {}, availabilityIds: [] }
      groups.set(key, group)
    }
    const current = group.cabins[result.cabin]
    if (!current || result.points_cost < current.points_cost
      || (result.points_cost === current.points_cost
        && (result.cash_fees_usd ?? Infinity) < (current.cash_fees_usd ?? Infinity))) {
      group.cabins[result.cabin] = result
    }
    const id = result.availability_id
    if (id?.trim() && !group.availabilityIds.includes(id)) group.availabilityIds.push(id)
  }
  return [...groups.values()]
}

export type SummarySort = {
  field: 'date' | 'program' | 'points'
  cabin?: ChatCabin
  direction: 'asc' | 'desc'
}

function sortValue(row: AvailabilitySummary, sort: SummarySort): string | number | null {
  if (sort.field === 'date') return row.departure_date
  if (sort.field === 'program') return row.program
  return sort.cabin ? row.cabins[sort.cabin]?.points_cost ?? null : null
}

export function sortSummaries(rows: AvailabilitySummary[], sort: SummarySort) {
  return [...rows].sort((first, second) => {
    const firstValue = sortValue(first, sort)
    const secondValue = sortValue(second, sort)
    if (firstValue === null && secondValue !== null) return 1
    if (secondValue === null && firstValue !== null) return -1
    let difference = 0
    if (firstValue !== null && secondValue !== null) {
      difference = typeof firstValue === 'string' && typeof secondValue === 'string'
        ? firstValue.localeCompare(secondValue)
        : Number(firstValue) - Number(secondValue)
    }
    return difference * (sort.direction === 'asc' ? 1 : -1)
      || first.departure_date.localeCompare(second.departure_date)
  })
}

export function getPageNumbers(page: number, totalPages: number): (number | 'ellipsis')[] {
  const total = Number.isFinite(totalPages) ? Math.max(0, Math.floor(totalPages)) : 0
  if (!total) {
    return []
  }
  const current = Number.isFinite(page) ? Math.min(total, Math.max(1, Math.floor(page))) : 1
  const pages = [...new Set([1, current - 1, current, current + 1, total])]
    .filter((number) => number >= 1 && number <= total)
    .sort((first, second) => first - second)
  const result: (number | 'ellipsis')[] = []
  for (const [index, number] of pages.entries()) {
    const previous = pages[index - 1]
    if (index && number - previous === 2) {
      result.push(previous + 1)
    } else if (index && number - previous > 2) {
      result.push('ellipsis')
    }
    result.push(number)
  }
  return result
}
