import type { SearchTurn } from '../useChatJourney'
import type { TripDraft } from '../components/TripEntry'
import type { SearchCriteria } from './search-api'
import type { ChatCriteria } from './chat-response'
import { cabinOptions } from './availability-presentation'

export type ChatMessage = Readonly<{ role: 'user' | 'assistant'; content: string }>
export type ChatRequest = Readonly<{
  message: string
  history?: readonly ChatMessage[]
  context?: ChatCriteria
  confirmed?: boolean
}>

export function captureChatRequest(message: string, turns: readonly SearchTurn[], context?: ChatCriteria): ChatRequest {
  const messages: ChatMessage[] = []
  for (const turn of turns) {
    if (turn.status !== 'success' || !turn.response) continue
    messages.push(Object.freeze({ role: 'user', content: turn.request }))
    const reply = 'reply' in turn.response ? turn.response.reply : turn.response.message
    if (reply?.trim()) messages.push(Object.freeze({ role: 'assistant', content: reply }))
  }
  const history = messages.slice(-20)
  while (history[0]?.role === 'assistant') history.shift()
  return Object.freeze({ message, ...(history.length ? { history: Object.freeze(history) } : {}),
    ...(context ? { context } : {}) })
}

export function draftWithCriteria(draft: TripDraft, criteria: SearchCriteria): TripDraft {
  return { ...draft, origin: '', destination: '',
    originCodes: typeof criteria.origin === 'string' ? [criteria.origin] : [...criteria.origin],
    destinationCodes: typeof criteria.destination === 'string' ? [criteria.destination] : [...criteria.destination],
    departureDate: criteria.departure_date, departureFlex: criteria.departure_date_end ? 'custom' : 'exact',
    departureDateEnd: criteria.departure_date_end,
    adults: String(criteria.passengers),
    cabins: cabinOptions.filter((option) => criteria.cabins?.includes(option.key)).map((option) => option.label),
  }
}

export function criteriaLabel(criteria: ChatCriteria): string {
  const label = (value: string | readonly string[]) => typeof value === 'string' ? value : value.join(' / ')
  const dates = criteria.departure_date_end
    ? `${criteria.departure_date} through ${criteria.departure_date_end}` : criteria.departure_date
  const cabins = criteria.cabins?.map((cabin) => cabin.replaceAll('_', ' ')).join(', ') ?? 'all cabins'
  const filters = [criteria.programs?.length ? criteria.programs.join(', ') : '',
    criteria.max_points ? `at most ${criteria.max_points.toLocaleString()} points` : ''].filter(Boolean)
  return `${label(criteria.origin)} → ${label(criteria.destination)}, ${dates}, one way, ${criteria.passengers} adult${criteria.passengers === 1 ? '' : 's'}, ${cabins}${filters.length ? `, ${filters.join(', ')}` : ''}`
}
