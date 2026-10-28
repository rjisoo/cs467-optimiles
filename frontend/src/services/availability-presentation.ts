import type { AvailabilitySummary, Cabin } from './availability-api'
import { programName } from './availability-prototype'

export type SummarySort = {
  field: 'date' | 'program' | 'points'
  cabin?: Cabin
  direction: 'asc' | 'desc'
}

function sortValue(row: AvailabilitySummary, sort: SummarySort): string | number | null {
  if (sort.field === 'date') {
    return row.date
  }
  if (sort.field === 'program') {
    return row.source === null ? null : programName(row.source)
  }
  const cabin = row.cabins.find((item) => item.cabin === sort.cabin)
  if (cabin?.available !== true || cabin.from_points === 0) {
    return null
  }
  return cabin.from_points
}

export function sortSummaries(rows: AvailabilitySummary[], sort: SummarySort) {
  return [...rows].sort((first, second) => {
    const firstValue = sortValue(first, sort)
    const secondValue = sortValue(second, sort)
    if (firstValue === null && secondValue !== null) {
      return 1
    }
    if (secondValue === null && firstValue !== null) {
      return -1
    }

    let difference = 0
    if (firstValue !== null && secondValue !== null) {
      if (typeof firstValue === 'string' && typeof secondValue === 'string') {
        difference = firstValue.localeCompare(secondValue)
      } else {
        difference = Number(firstValue) - Number(secondValue)
      }
    }
    const direction = sort.direction === 'asc' ? 1 : -1
    return difference * direction
      || first.date.localeCompare(second.date)
      || first.availability_id.localeCompare(second.availability_id)
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
