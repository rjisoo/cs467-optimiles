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
