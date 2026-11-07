import { useEffect, useRef, useState } from 'react'
import { fetchTripDetails, type TripDetailsResponse } from './services/trip-details'

export type TripLoadState =
  | { status: 'pending' }
  | { status: 'success'; response: TripDetailsResponse }
  | { status: 'failed'; error: string }

export default function useTripDetails() {
  const [states, setStates] = useState<Record<string, TripLoadState>>({})
  const cache = useRef<Record<string, TripLoadState>>({})
  const requests = useRef(new Map<string, AbortController>())

  useEffect(() => {
    const pending = requests.current
    return () => {
      pending.forEach((controller) => controller.abort())
      pending.clear()
      cache.current = {}
    }
  }, [])

  function update(id: string, state: TripLoadState) {
    cache.current = { ...cache.current, [id]: state }
    setStates(cache.current)
  }

  async function load(id: string) {
    if (cache.current[id]?.status === 'pending' || cache.current[id]?.status === 'success') return
    const controller = new AbortController()
    requests.current.set(id, controller)
    update(id, { status: 'pending' })
    try {
      const response = await fetchTripDetails(id, controller.signal)
      if (requests.current.get(id) !== controller) return
      update(id, { status: 'success', response })
    } catch (error) {
      if (requests.current.get(id) !== controller) return
      update(id, { status: 'failed', error: error instanceof Error ? error.message : 'Trip details could not load. Please try again.' })
    } finally {
      if (requests.current.get(id) === controller) requests.current.delete(id)
    }
  }

  return { states, load }
}
