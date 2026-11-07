import { useEffect, useRef, useState } from 'react'
import { sendChatMessage } from './services/chat-api'
import type { ChatResponse } from './services/chat-response'
import type { TripDraft } from './components/TripEntry'
import { validateTripFields } from './lib/trip-validation'

export type SearchTurn = {
  id: number
  source: 'chat' | 'form'
  request: string
  status: 'pending' | 'success' | 'canceled' | 'failed'
  error?: string
  response?: ChatResponse
}

function createTripDraft(): TripDraft {
  return { message: '', origin: '', destination: '', departureDate: '', adults: '1', cabins: [] }
}

export default function useChatJourney() {
  const [draft, setDraft] = useState<TripDraft>(createTripDraft)
  const [turns, setTurns] = useState<SearchTurn[]>([])
  const [formAttempt, setFormAttempt] = useState(0)
  const fieldErrors = formAttempt > 0 ? validateTripFields(draft) : {}
  const [lastActionId, setLastActionId] = useState(0)
  const active = useRef<AbortController | null>(null)
  const nextId = useRef(0)
  const pending = turns.some((turn) => turn.status === 'pending')

  useEffect(() => () => {
    active.current?.abort()
    active.current = null
  }, [])

  async function run(turn: SearchTurn, retry = false) {
    if (active.current) return

    const controller = new AbortController()
    active.current = controller
    setLastActionId(turn.id)
    setTurns((previous) => retry
      ? previous.map((item) => item.id === turn.id ? turn : item)
      : [...previous, turn])

    try {
      const response = await sendChatMessage(turn.request, controller.signal)
      if (active.current !== controller) return

      setDraft((current) => turn.source === 'chat' && current.message === turn.request
        ? { ...current, message: '' }
        : current)
      setTurns((previous) => previous.map((item) => item.id === turn.id
        ? { ...item, status: 'success', response }
        : item))
    } catch (error) {
      if (active.current !== controller) return

      const message = error instanceof Error ? error.message : 'The chat request failed. Please try again.'
      setTurns((previous) => previous.map((item) => item.id === turn.id
        ? { ...item, status: 'failed', error: message }
        : item))
    } finally {
      if (active.current === controller) active.current = null
    }
  }

  function submit(source: 'chat' | 'form') {
    if (active.current) return
    if (source === 'chat' && !draft.message.trim()) return

    let request = draft.message
    if (source === 'form') {
      setFormAttempt((attempt) => attempt + 1)
      if (Object.keys(validateTripFields(draft)).length) return

      const origin = draft.origin.trim().toUpperCase()
      const destination = draft.destination.trim().toUpperCase()
      const adultLabel = draft.adults === '1' ? 'adult' : 'adults'
      request = `${origin} to ${destination}, ${draft.departureDate}, one way, `
        + `${draft.adults} ${adultLabel}. Compare ${draft.cabins.join(', ')}.`
      setDraft((current) => ({ ...current, origin, destination }))
    } else {
      setFormAttempt(0)
    }
    void run({ id: ++nextId.current, source, request, status: 'pending' })
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
    void run({ ...turn, status: 'pending', error: undefined }, true)
  }

  return {
    draft, setDraft, turns, fieldErrors, formAttempt, lastActionId, pending,
    submit, cancel, reset, retry,
  }
}
