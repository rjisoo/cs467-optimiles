import { isExactDate } from '../lib/trip-date'

export type ChatCabin = 'economy' | 'premium_economy' | 'business' | 'first'

export type ChatResult = {
  availability_id?: string | null
  airline: string
  cabin: ChatCabin
  cash_fees_usd: number | null
  cents_per_point: number | null
  departure_date: string
  destination: string
  origin: string
  points_cost: number
  program: string
  seats_available: number | null
}

export type ChatResponse = { reply: string; results: ChatResult[] }

function invalid(path: string): never {
  throw new Error(`Invalid response at ${path}`)
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid(path)
  return value as Record<string, unknown>
}

function text(value: unknown, path: string): string {
  if (typeof value !== 'string' || !value.trim()) return invalid(path)
  return value
}

function number(value: unknown, path: string, integer = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0
    || (integer && !Number.isSafeInteger(value))) return invalid(path)
  return value
}

function nullableNumber(value: unknown, path: string, integer = false): number | null {
  return value == null ? null : number(value, path, integer)
}

function nullableCpp(value: unknown, path: string): number | null {
  if (value == null) return null
  if (typeof value !== 'number' || !Number.isFinite(value)) return invalid(path)
  return value
}

export function validateChatResponse(input: unknown): ChatResponse {
  const response = record(input, 'response')
  if (typeof response.reply !== 'string') invalid('reply')
  return { reply: response.reply, results: validateResults(response.results) }
}

export function validateResults(input: unknown): ChatResult[] {
  if (!Array.isArray(input)) invalid('results')
  return input.map((value, index): ChatResult => {
    const path = `results[${index}]`
    const row = record(value, path)
    const cabin = text(row.cabin, `${path}.cabin`)
    if (!['economy', 'premium_economy', 'business', 'first'].includes(cabin)) invalid(`${path}.cabin`)
    const departureDate = text(row.departure_date, `${path}.departure_date`)
    if (!isExactDate(departureDate)) invalid(`${path}.departure_date`)
    const origin = text(row.origin, `${path}.origin`)
    const destination = text(row.destination, `${path}.destination`)
    if (!/^[A-Z]{3}$/.test(origin)) invalid(`${path}.origin`)
    if (!/^[A-Z]{3}$/.test(destination)) invalid(`${path}.destination`)
    if (row.availability_id != null && (typeof row.availability_id !== 'string'
      || !/^[A-Za-z0-9_-]{1,200}$/.test(row.availability_id))) invalid(`${path}.availability_id`)
    return {
      ...(row.availability_id === undefined ? {} : { availability_id: row.availability_id as string | null }),
      airline: text(row.airline, `${path}.airline`), cabin: cabin as ChatCabin,
      cash_fees_usd: nullableNumber(row.cash_fees_usd, `${path}.cash_fees_usd`),
      cents_per_point: nullableCpp(row.cents_per_point, `${path}.cents_per_point`),
      departure_date: departureDate, destination, origin,
      points_cost: number(row.points_cost, `${path}.points_cost`, true),
      program: text(row.program, `${path}.program`),
      seats_available: nullableNumber(row.seats_available, `${path}.seats_available`, true),
    }
  })
}
