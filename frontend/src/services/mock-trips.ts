import type { TripsResponse } from './availability-api'
import { tripsFixtures } from './availability-fixtures'

// Local substitute for GET /api/availability/{availability_id}/trips.
// Return every cabin in one response; the result view paginates locally.
export async function fetchMockTrips(availabilityId: string): Promise<TripsResponse> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 350)
  })

  const response = tripsFixtures[availabilityId]
  if (!response) {
    throw new Error('Trip details are unavailable for this result')
  }

  return structuredClone(response)
}
