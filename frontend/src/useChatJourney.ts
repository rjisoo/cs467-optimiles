import { useEffect, useRef, useState } from 'react'
import { sendChatMessage } from './services/chat-api'
import type { ChatCriteria, ChatResponse } from './services/chat-response'
import { captureSearchCriteria, searchAwards, type SearchCriteria, type SearchResponse } from './services/search-api'
import type { TripDraft } from './components/TripEntry'
import { validateTripFields } from './lib/trip-validation'
import { loadAirportCatalog, type AirportCatalog } from './services/airports'
import { captureChatRequest, criteriaLabel, draftWithCriteria, type ChatRequest } from './services/chat-context'

export type SearchTurn = {
  id: number
  request: string
  status: 'pending' | 'success' | 'canceled' | 'failed'
  error?: string
  response?: ChatResponse | SearchResponse
} & (
  | { source: 'chat'; payload: ChatRequest }
  | { source: 'form'; payload: SearchCriteria }
)

function createTripDraft(): TripDraft {
  return { message: '', origin: '', destination: '', originCodes: [], destinationCodes: [], departureDate: '', adults: '1', cabins: [] }
}

export default function useChatJourney() {
  const [draft, setDraft] = useState<TripDraft>(createTripDraft)
  const [turns, setTurns] = useState<SearchTurn[]>([])
  const [formAttempt, setFormAttempt] = useState(0)
  const [airportCatalog, setAirportCatalog] = useState<AirportCatalog>()
  const [airportStatus, setAirportStatus] = useState<'idle' | 'loading' | 'ready' | 'failed'>('idle')
  const fieldErrors = formAttempt > 0 ? validateTripFields(draft, airportCatalog?.airports) : {}
  const [lastActionId, setLastActionId] = useState(0)
  const active = useRef<AbortController | null>(null)
  const nextId = useRef(0)
  const mounted = useRef(true)
  const pending = turns.some((turn) => turn.status === 'pending')
  const currentCriteria: ChatCriteria | undefined = [...turns].reverse().map((turn) => turn.source === 'form' ? turn.payload
    : turn.response && 'reply' in turn.response ? turn.response.criteria : undefined).find(Boolean) ?? undefined
  const acceptedCriteria = [...turns].reverse().map((turn) => {
    if (turn.source === 'form') return turn.payload
    const response = turn.response && 'reply' in turn.response ? turn.response : undefined
    return response?.searches?.at(-1)?.criteria
  }).find(Boolean)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      active.current?.abort()
      active.current = null
    }
  }, [])

  async function loadAirports() {
    if (airportStatus === 'loading' || airportStatus === 'ready') return
    setAirportStatus('loading')
    try {
      const catalog = await loadAirportCatalog()
      if (!mounted.current) return
      setAirportCatalog(catalog)
      setAirportStatus('ready')
    } catch {
      if (mounted.current) setAirportStatus('failed')
    }
  }

  async function run(turn: SearchTurn, retry = false) {
    if (active.current) return

    const controller = new AbortController()
    active.current = controller
    setLastActionId(turn.id)
    setTurns((previous) => retry
      ? previous.map((item) => item.id === turn.id ? turn : item)
      : [...previous, turn])

    try {
      const response = turn.source === 'form'
        ? await searchAwards(turn.payload, controller.signal)
        : await sendChatMessage(turn.payload, controller.signal)
      if (active.current !== controller) return

      const chat = 'reply' in response ? response : undefined
      const failed = chat?.status === 'failed'
      setDraft((current) => {
        const next = turn.id === nextId.current && chat?.criteria
          ? draftWithCriteria(current, chat.criteria) : current
        return turn.source === 'chat' && current.message === turn.request && !failed && !chat?.failure
          ? { ...next, message: '' } : next
      })
      setTurns((previous) => previous.map((item) => item.id === turn.id
        ? { ...item, status: failed ? 'failed' : 'success', response,
          ...(failed ? { error: chat.reply || 'The search could not be completed. Please try again.' } : {}) }
        : item))
    } catch (error) {
      if (active.current !== controller) return

      const message = error instanceof Error ? error.message : 'The request failed. Please try again.'
      setTurns((previous) => previous.map((item) => item.id === turn.id
        ? { ...item, status: 'failed', error: message }
        : item))
    } finally {
      if (active.current === controller) active.current = null
    }
  }

  function submit(source: 'chat' | 'form'): boolean {
    if (active.current) return false
    if (source === 'chat' && !draft.message.trim()) return false

    if (source === 'form') {
      setFormAttempt((attempt) => attempt + 1)
      const now = new Date()
      if (!airportCatalog || Object.keys(validateTripFields(draft, airportCatalog.airports, now)).length) return false

      const payload = captureSearchCriteria(draft, airportCatalog.airports, now)
      const { origin, destination } = payload
      const originLabel = typeof origin === 'string' ? origin : origin.join(', ')
      const destinationLabel = typeof destination === 'string' ? destination : destination.join(', ')
      const adultLabel = draft.adults === '1' ? 'adult' : 'adults'
      const dates = payload.departure_date_end
        ? `${payload.departure_date} through ${payload.departure_date_end}` : payload.departure_date
      const request = `${originLabel} to ${destinationLabel}, ${dates}, one way, `
        + `${draft.adults} ${adultLabel}. Compare ${draft.cabins.length ? draft.cabins.join(', ') : 'all cabins'}.`
      void run({ id: ++nextId.current, source, request, payload, status: 'pending' })
    } else {
      setFormAttempt(0)
      const payload = captureChatRequest(draft.message, turns, acceptedCriteria)
      void run({ id: ++nextId.current, source, request: draft.message, payload, status: 'pending' })
    }
    return true
  }

  function cancel() {
    active.current?.abort()
    active.current = null
    setTurns((previous) => previous.map((turn) => turn.status === 'pending'
      ? { ...turn, status: 'canceled' }
      : turn))
  }

  function reset() {
    cancel()
    setDraft(createTripDraft())
    setTurns([])
    setFormAttempt(0)
  }

  function retry(turn: SearchTurn) {
    if (active.current || (turn.status !== 'failed' && turn.status !== 'canceled')) return
    if (turn.response && 'reply' in turn.response && turn.response.failure?.retryable === false) return
    void run({ ...turn, status: 'pending', error: undefined, response: undefined }, true)
  }

  function confirm(turn: SearchTurn) {
    const response = turn.response && 'reply' in turn.response ? turn.response : undefined
    if (active.current || turn.id !== turns.at(-1)?.id || response?.status !== 'confirmation' || !response.criteria) return
    const payload = Object.freeze({ ...captureChatRequest('Confirm this trip.', turns, response.criteria), confirmed: true })
    void run({ id: ++nextId.current, source: 'chat', request: payload.message, payload, status: 'pending' })
  }

  function prepareEdit() {
    setFormAttempt(0)
  }

  function retrySearch(turn: SearchTurn, index: number) {
    const response = turn.response && 'reply' in turn.response ? turn.response : undefined
    const search = response?.searches?.[index]
    if (active.current || response?.status !== 'partial' || search?.status !== 'failed' || !search.failure?.retryable) return
    const message = `Retry search: ${criteriaLabel(search.criteria)}.`
    const payload = Object.freeze({ message, context: search.criteria, confirmed: true })
    void run({ id: ++nextId.current, source: 'chat', request: message, payload, status: 'pending' })
  }

  return {
    airportCatalog, airportStatus, loadAirports,
    draft, setDraft, turns, fieldErrors, formAttempt, lastActionId, pending,
    submit, cancel, reset, retry, confirm, retrySearch, currentCriteria, prepareEdit,
  }
}
