// Presentation data only; this is not a backend response contract.
export const cabinNames = ['Economy', 'Premium', 'Business', 'First'] as const
export type CabinName = typeof cabinNames[number]
export type CabinFare =
  | { status: 'No award' | 'Not reported' }
  | {
      status: 'available'
      points: number
      fees: number | null
      previewValue: { cpp: string; cashFare: number; rating: 'Good' | 'Fair' | 'Bad' } | null
    }

export type AwardDisplay = {
  id: string
  airline: string | null
  airlineMark: 'plane' | 'waves' | 'aircraft'
  program: string
  origin: string
  destination: string
  awardDate: string
  schedule: {
    departure: string
    departureZone: string
    arrival: string
    arrivalZone: string
    arrivalDate: string
    dayOffset: string
    duration: string
    stops: string
  } | null
  cabins: Record<CabinName, CabinFare>
  seatNote: string
  checked: { dateTime: string; label: string } | null
  previewCategories: ('The best value' | 'Shortest journey' | 'Lowest points')[]
}

export function awardDateLabel(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
  })
}

export function formatUsd(amount: number) {
  return `USD ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
