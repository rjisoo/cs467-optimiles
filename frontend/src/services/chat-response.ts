import { isExactDate } from '../lib/trip-date'
import type { SearchCriteria } from './search-api'

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

export type SearchCoverage = { partial?: boolean; warnings?: string[] }
export type ChatFailure = { code: string; retryable: boolean }
export type ChatCriteria = SearchCriteria & { programs?: readonly string[]; max_points?: number }
export type ChatSearch = SearchCoverage & {
  criteria: ChatCriteria
  status: 'results' | 'empty' | 'failed'
  results: ChatResult[]
  message: string | null
  failure: ChatFailure | null
}
export type ChatResponse = SearchCoverage & {
  reply: string
  results: ChatResult[]
  status?: 'reply' | 'clarification' | 'confirmation' | 'results' | 'empty' | 'failed' | 'partial'
  criteria?: ChatCriteria | null
  missing_fields?: string[]
  failure?: ChatFailure | null
  searches?: ChatSearch[]
}

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
  const base = { reply: response.reply, results: validateResults(response.results), ...validateSearchCoverage(response) }
  if (response.status === undefined) return base
  const status = response.status as ChatResponse['status']
  if (!status || !['reply', 'clarification', 'confirmation', 'results', 'empty', 'failed', 'partial'].includes(status)) invalid('status')
  const criteria = response.criteria == null ? null : validateChatCriteria(response.criteria)
  const failure = validateFailure(response.failure)
  if (status === 'confirmation' && !criteria) invalid('criteria')
  if (status === 'failed' && !failure) invalid('failure')
  if (!Array.isArray(response.missing_fields)) invalid('missing_fields')
  const missing_fields = response.missing_fields.map((field) => text(field, 'missing_fields'))
  if (!Array.isArray(response.searches)) invalid('searches')
  const searches = response.searches.map((value): ChatSearch => {
    const group = record(value, 'searches')
    if (!['results', 'empty', 'failed'].includes(String(group.status))) invalid('searches.status')
    if (group.message !== null && typeof group.message !== 'string') invalid('searches.message')
    const results = validateResults(group.results)
    const groupFailure = validateFailure(group.failure)
    if (group.status === 'failed' && !groupFailure) invalid('searches.failure')
    if ((group.status === 'results') !== (results.length > 0)) invalid('searches.results')
    return { criteria: validateChatCriteria(group.criteria), status: group.status as ChatSearch['status'],
      results, message: group.message, failure: groupFailure, ...validateSearchCoverage(group) }
  })
  if (['reply', 'clarification', 'confirmation', 'failed', 'empty'].includes(status) && base.results.length) invalid('results')
  if (['results', 'empty', 'partial'].includes(status) && !searches.length) invalid('searches')
  if (status === 'results' && !base.results.length) invalid('results')
  if (['reply', 'clarification', 'confirmation'].includes(status) && searches.length) invalid('searches')
  if (status === 'failed' && searches.some((search) => search.status !== 'failed')) invalid('searches')
  return { ...base, status, criteria, missing_fields, failure, searches }
}

function validateFailure(input: unknown): ChatFailure | null {
  if (input == null) return null
  const failure = record(input, 'failure')
  if (typeof failure.retryable !== 'boolean') invalid('failure.retryable')
  return { code: text(failure.code, 'failure.code'), retryable: failure.retryable }
}

export function validateChatCriteria(input: unknown): ChatCriteria {
  const criteria = record(input, 'criteria')
  function endpoint(value: unknown): string | readonly string[] {
    const codes = typeof value === 'string' ? [value] : value
    if (!Array.isArray(codes) || !codes.length || codes.length > 6
      || codes.some((code) => typeof code !== 'string' || !/^[A-Z]{3}$/.test(code))
      || new Set(codes).size !== codes.length) invalid('criteria.airport')
    return typeof value === 'string' ? value : Object.freeze([...codes])
  }
  const origin = endpoint(criteria.origin)
  const destination = endpoint(criteria.destination)
  const origins = typeof origin === 'string' ? [origin] : origin
  const destinations = typeof destination === 'string' ? [destination] : destination
  if (origins.some((code) => destinations.includes(code))) invalid('criteria.destination')
  const start = text(criteria.departure_date, 'criteria.departure_date')
  const end = criteria.departure_date_end == null ? undefined : text(criteria.departure_date_end, 'criteria.departure_date_end')
  if (!isExactDate(start) || (end && (!isExactDate(end) || end < start))) invalid('criteria.departure_date')
  const passengers = number(criteria.passengers, 'criteria.passengers', true)
  if (passengers < 1 || passengers > 9 || criteria.return_date != null) invalid('criteria')
  if (criteria.cabin != null && criteria.cabins != null) invalid('criteria.cabins')
  const cabins = criteria.cabins ?? (criteria.cabin == null ? undefined : [criteria.cabin])
  if (cabins !== undefined && (!Array.isArray(cabins) || !cabins.length || cabins.length > 4
    || new Set(cabins).size !== cabins.length
    || cabins.some((cabin) => !['economy', 'premium_economy', 'business', 'first'].includes(cabin)))) invalid('criteria.cabins')
  if (criteria.programs != null && !Array.isArray(criteria.programs)) invalid('criteria.programs')
  const programs = (criteria.programs as unknown[] | null | undefined)?.map((program) => text(program, 'criteria.programs'))
  const maxPoints = criteria.max_points == null ? undefined : number(criteria.max_points, 'criteria.max_points', true)
  if (maxPoints === 0) invalid('criteria.max_points')
  return Object.freeze({ origin, destination, departure_date: start, ...(end ? { departure_date_end: end } : {}),
    passengers, ...(cabins ? { cabins: Object.freeze(cabins as ChatCabin[]) } : {}),
    ...(programs?.length ? { programs: Object.freeze(programs) } : {}),
    ...(maxPoints ? { max_points: maxPoints } : {}) })
}

export function validateSearchCoverage(response: Record<string, unknown>): SearchCoverage {
  const coverage: SearchCoverage = {}
  if (response.partial !== undefined) {
    if (typeof response.partial !== 'boolean') invalid('partial')
    coverage.partial = response.partial
  }
  if (response.warnings !== undefined) {
    if (!Array.isArray(response.warnings)) invalid('warnings')
    coverage.warnings = response.warnings.map((warning, index) => text(warning, `warnings[${index}]`))
  }
  return coverage
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
