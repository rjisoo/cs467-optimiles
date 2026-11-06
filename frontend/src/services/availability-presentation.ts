import type { ChatCabin, ChatResult } from './chat-response'

export const cabinOptions: { key: ChatCabin; label: string }[] = [
  { key: 'economy', label: 'Economy' },
  { key: 'premium_economy', label: 'Premium economy' },
  { key: 'business', label: 'Business' },
  { key: 'first', label: 'First' },
]

export type SummarySort = {
  field: 'date' | 'program' | 'points'
  cabin?: ChatCabin
  direction: 'asc' | 'desc'
}

function sortValue(row: ChatResult, sort: SummarySort): string | number | null {
  if (sort.field === 'date') return row.departure_date
  if (sort.field === 'program') return row.program
  return row.cabin === sort.cabin ? row.points_cost : null
}

export function sortSummaries(rows: ChatResult[], sort: SummarySort) {
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
