import { useEffect, useRef, useState } from 'react'
import type { SearchResponse } from './services/availability-api'
import {
  createTripDraft,
  demoCriteria,
  demoRequest,
  getMockResults,
  searchMock,
  supportsDemo,
  type TripCriteria,
} from './services/mock-search'
import type { TripDraft } from './components/TripEntry'
import { validateTripFields } from './lib/trip-validation'

export type SearchTurn = {
  id: number
  criteria: TripCriteria
  request: string
  status: 'pending' | 'success' | 'canceled' | 'failed'
  results?: SearchResponse
}

export default function useMockJourney(seedPreview = false) {
  const [draft, setDraft] = useState<TripDraft>(() => {
    if (seedPreview) {
      return { ...demoCriteria, message: '' }
    }
    return createTripDraft()
  })
  const [turns, setTurns] = useState<SearchTurn[]>(() => {
    if (!seedPreview) {
      return []
    }
    return [{
      id: 1,
      criteria: structuredClone(demoCriteria),
      request: demoRequest,
      status: 'success',
      results: getMockResults(demoCriteria),
    }]
  })
  const [notice, setNotice] = useState('')
  const [formAttempt, setFormAttempt] = useState(0)
  const fieldErrors = formAttempt > 0 ? validateTripFields(draft) : {}
  const [lastActionId, setLastActionId] = useState(seedPreview ? 1 : 0)
  const active = useRef<AbortController | null>(null)
  const nextId = useRef(seedPreview ? 1 : 0)
  const pending = turns.some((turn) => turn.status === 'pending')
  useEffect(() => {
    return () => {
      active.current?.abort()
      active.current = null
    }
  }, [])

  async function run(turn: SearchTurn, fail = false, retry = false) {
    if (active.current) {
      return
    }

    const controller = new AbortController()
    const submittedMessage = retry ? turn.request : draft.message
    active.current = controller
    setNotice('')
    setLastActionId(turn.id)
    setTurns((previous) => {
      if (retry) {
        return previous.map((item) => item.id === turn.id ? turn : item)
      }
      return [...previous, turn]
    })

    try {
      const results = await searchMock(turn.criteria, controller.signal, fail)
      if (active.current !== controller) {
        return
      }
      setDraft((current) => {
        if (current.message === submittedMessage) {
          return { ...current, message: '' }
        }
        return current
      })
      setTurns((previous) => previous.map((item) => {
        if (item.id === turn.id) {
          return { ...item, status: 'success', results }
        }
        return item
      }))
    } catch {
      if (active.current !== controller) {
        return
      }
      setTurns((previous) => previous.map((item) => {
        if (item.id === turn.id) {
          return { ...item, status: 'failed' }
        }
        return item
      }))
    } finally {
      if (active.current === controller) {
        active.current = null
      }
    }
  }

  function submit(source: 'chat' | 'form') {
    if (active.current) {
      return
    }

    const message = draft.message.trim()
    if (source === 'chat' && !message) {
      return
    }
    const fail = source === 'chat' && message.endsWith('Fail once.')
    if (source === 'form') {
      setFormAttempt((attempt) => attempt + 1)
      if (Object.keys(validateTripFields(draft)).length) {
        setNotice('')
        return
      }
    } else {
      setFormAttempt(0)
    }
    let criteria: TripCriteria
    if (source === 'chat') {
      criteria = structuredClone(demoCriteria)
    } else {
      criteria = {
        origin: draft.origin.trim().toUpperCase(),
        destination: draft.destination.trim().toUpperCase(),
        departureDate: draft.departureDate,
        endDate: draft.departureDate,
        adults: draft.adults,
        cabins: [...draft.cabins],
      }
    }
    if (source === 'form' && !supportsDemo(criteria)) {
      setNotice('The form demo supports only JFK to SEA, October 31–November 6, 2026. Choose a departure date in that range, or type a message to try the mock search.')
      return
    }
    setDraft({ ...criteria, message: draft.message })

    let request = draft.message
    if (source === 'form') {
      const adultLabel = criteria.adults === '1' ? 'adult' : 'adults'
      request = `${criteria.origin} to ${criteria.destination}, ${criteria.departureDate}, one way, `
        + `${criteria.adults} ${adultLabel}. Compare ${criteria.cabins.join(', ')}.`
    }
    void run({ id: ++nextId.current, criteria, request, status: 'pending' }, fail)
  }

  function cancel() {
    active.current?.abort()
    active.current = null
    setTurns((previous) => previous.map((turn) => {
      if (turn.status === 'pending') {
        return { ...turn, status: 'canceled' }
      }
      return turn
    }))
  }

  function reset() {
    cancel()
    setDraft(createTripDraft())
    setTurns([])
    setNotice('')
    setFormAttempt(0)
  }

  function retry(turn: SearchTurn) {
    if (active.current || (turn.status !== 'failed' && turn.status !== 'canceled')) {
      return
    }
    void run({ ...turn, status: 'pending' }, false, true)
  }

  return {
    draft,
    setDraft,
    turns,
    notice,
    fieldErrors,
    formAttempt,
    lastActionId,
    pending,
    submit,
    cancel,
    reset,
    retry,
  }
}
