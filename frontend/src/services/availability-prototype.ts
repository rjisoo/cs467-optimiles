import type { Cabin, Trip } from './availability-api'

export const cabinOptions: { key: Cabin; label: string }[] = [
  { key: 'economy', label: 'Economy' },
  { key: 'premium', label: 'Premium economy' },
  { key: 'business', label: 'Business' },
  { key: 'first', label: 'First' },
]

const programNames: Record<string, string> = {
  united: 'United MileagePlus',
  alaska: 'Alaska mileage program',
  delta: 'Delta SkyMiles',
  virginatlantic: 'Virgin Atlantic Flying Club',
}

export function programName(source: string | null): string {
  if (source === null) {
    return 'Mileage program unavailable'
  }

  return programNames[source] ?? source
}

export function formatOfferTaxes(
  offer: Pick<Trip, 'taxes_minor' | 'taxes_currency'>,
): string {
  if (offer.taxes_minor === null) {
    return 'Fees unavailable'
  }

  if (offer.taxes_currency === null) {
    return `${offer.taxes_minor.toLocaleString('en-US')} minor units · currency unavailable`
  }

  const currency = offer.taxes_currency
  if (!Intl.supportedValuesOf('currency').includes(currency)) {
    return `${offer.taxes_minor.toLocaleString('en-US')} minor units · ${currency}`
  }

  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    currencyDisplay: 'code',
  })
  const fractionDigits = formatter.resolvedOptions().maximumFractionDigits ?? 2
  return formatter.format(offer.taxes_minor / 10 ** fractionDigits)
}

// The response already contains airport-local wall times; keep those clocks.
export function formatAirportTime(value: string | null): string {
  const match = value?.match(/T(\d{2}):(\d{2})/)
  if (!match) {
    return 'Time unavailable'
  }

  const hour = Number(match[1])
  const period = hour >= 12 ? 'PM' : 'AM'
  return `${hour % 12 || 12}:${match[2]} ${period}`
}
