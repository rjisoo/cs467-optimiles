import type { TripDraft } from '../components/TripEntry'
import { validateTripFields } from '../lib/trip-validation'
import { validateResults, type ChatCabin, type ChatResult } from './chat-response'

export type SearchCriteria = Readonly<{
  origin: string
  destination: string
  departure_date: string
  passengers: number
  cabins: readonly ChatCabin[]
}>
export type SearchResponse = { results: ChatResult[]; message: string | null }

export function captureSearchCriteria(draft: TripDraft): SearchCriteria {
  if (Object.keys(validateTripFields(draft)).length) throw new Error('Invalid search criteria')
  return Object.freeze({
    origin: draft.origin.trim().toUpperCase(), destination: draft.destination.trim().toUpperCase(),
    departure_date: draft.departureDate, passengers: Number(draft.adults),
    cabins: Object.freeze(draft.cabins.map((cabin) => cabin.toLowerCase().replaceAll(' ', '_') as ChatCabin)),
  })
}

export function validateSearchResponse(input: unknown): SearchResponse {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid search response')
  const response = input as Record<string, unknown>
  if (response.message !== null && typeof response.message !== 'string') {
    throw new Error('Invalid search response message')
  }
  return { results: validateResults(response.results), message: response.message }
}

function failureMessage(status: number | null): string {
  if (status === null) return 'Could not reach the search service. Check your connection and try again.'
  if (status === 400) return 'The search service rejected these criteria. Check your trip details and try again.'
  if (status === 429) return 'Too many requests. Wait a moment before trying again.'
  if (status >= 500) return 'The search service is unavailable. Try again later.'
  return `The search request failed (HTTP ${status}). Please try again.`
}

export async function searchAwards(criteria: SearchCriteria, signal: AbortSignal): Promise<SearchResponse> {
  let response: Response
  try {
    response = await fetch('/api/search', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(criteria), signal,
    })
  } catch (error) {
    if (signal.aborted) throw error
    throw new Error(failureMessage(null), { cause: error })
  }
  if (!response.ok) throw new Error(failureMessage(response.status))
  try {
    return validateSearchResponse(await response.json())
  } catch (error) {
    if (signal.aborted) throw error
    throw new Error('The search service returned an invalid response. Please try again.', { cause: error })
  }
}
