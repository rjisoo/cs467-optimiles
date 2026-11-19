export function awardDateLabel(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

export function isExactDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000-')) {
    return false
  }
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export const departureFlexDays = [1, 3, 7, 14, 28, 60, 180] as const

export function departureWindow(start: string, flexibility = 'exact', end = '') {
  if (flexibility === 'custom') return { start, end }
  if (!isExactDate(start) || !departureFlexDays.some((days) => String(days) === flexibility)) {
    return { start, end: start }
  }
  function offset(days: number) {
    const date = new Date(`${start}T00:00:00Z`)
    date.setUTCDate(date.getUTCDate() + days)
    return date.toISOString().slice(0, 10)
  }
  return { start: offset(-Number(flexibility)), end: offset(Number(flexibility)) }
}

export function arrivalDayOffset(departure: string, arrival: string): number {
  const start = departure.slice(0, 10)
  const end = arrival.slice(0, 10)
  if (!isExactDate(start) || !isExactDate(end)) return 0
  return (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000
}

export function formatUpdatedAt(value: string | null, timeZone?: string): string {
  if (!value) return 'Not reported'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return 'Not reported'
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    hour12: false, timeZoneName: 'short', timeZone,
  }).format(date)
}

export function departureDateBounds(timeZone: string | undefined, now: Date) {
  if (!timeZone || /^[+-]/.test(timeZone)) {
    return 'The departure airport timezone must be confirmed before searching.'
  }
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    return 'The current date could not be checked. Try again.'
  }
  let today: string
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone, calendar: 'iso8601', numberingSystem: 'latn',
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(now)
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)!.value
    today = `${part('year').padStart(4, '0')}-${part('month')}-${part('day')}`
  } catch {
    return 'The departure airport timezone must be confirmed before searching.'
  }
  // UTC holds calendar labels; advance calendar days without changing airport-local instants.
  const lastDate = new Date(`${today}T00:00:00Z`)
  lastDate.setUTCDate(lastDate.getUTCDate() + 365)
  return { min: today, max: lastDate.toISOString().slice(0, 10) }
}

export function validateDepartureDate(value: string, timeZone: string | undefined, now: Date): string | undefined {
  if (!isExactDate(value)) return 'Choose a valid departure date (YYYY-MM-DD).'
  const bounds = departureDateBounds(timeZone, now)
  if (typeof bounds === 'string') return bounds
  if (value < bounds.min) return "Choose today or later in the departure airport's timezone."
  if (value > bounds.max) return 'Choose a departure date within 365 days of today.'
  return undefined
}
