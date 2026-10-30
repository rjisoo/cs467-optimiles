import { useCallback, useEffect, useRef, useState } from 'react'
import type { Trip, TripsResponse } from './services/availability-api'
import { fetchMockTrips } from './services/mock-trips'

export type TripLoadState =
  | { status: 'loading' }
  | { status: 'success'; trips: Trip[] }
  | { status: 'error' }

export default function useAvailabilityTrips(
  fetchTrips: (availabilityId: string) => Promise<TripsResponse> = fetchMockTrips,
) {
  const [states, setStates] = useState<Record<string, TripLoadState>>({})
  const cached = useRef(new Map<string, Trip[]>())
  const pending = useRef(new Map<string, Promise<void>>())
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const loadTrips = useCallback((availabilityId: string): Promise<void> => {
    if (!mounted.current || cached.current.has(availabilityId)) {
      return Promise.resolve()
    }

    const existingRequest = pending.current.get(availabilityId)
    if (existingRequest) {
      return existingRequest
    }

    setStates((current) => ({
      ...current,
      [availabilityId]: { status: 'loading' },
    }))

    const request = Promise.resolve()
      .then(() => fetchTrips(availabilityId))
      .then((response) => {
        const matchesRequest = response.availability_id === availabilityId
          && Array.isArray(response.trips)
          && response.trips.every((trip) => trip.availability_id === availabilityId)
        if (!matchesRequest) {
          throw new Error('Trips do not belong to the requested availability.')
        }
        if (!mounted.current) {
          return
        }

        cached.current.set(availabilityId, response.trips)
        setStates((current) => ({
          ...current,
          [availabilityId]: { status: 'success', trips: response.trips },
        }))
      })
      .catch(() => {
        if (mounted.current) {
          setStates((current) => ({
            ...current,
            [availabilityId]: { status: 'error' },
          }))
        }
      })
      .finally(() => {
        pending.current.delete(availabilityId)
      })

    pending.current.set(availabilityId, request)
    return request
  }, [fetchTrips])

  return { states, loadTrips }
}
