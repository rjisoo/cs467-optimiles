import type { TripDraft } from '../components/TripEntry'
import { isExactDate } from './trip-date'

export const cabinChoices = ['Economy', 'Premium economy', 'Business', 'First']
export type TripField = Exclude<keyof TripDraft, 'message'>
export type TripFieldErrors = Partial<Record<TripField, string>>

// Structural checks only; airport identity, timezone and provider support still need reference data.
export function validateTripFields(draft: TripDraft): TripFieldErrors {
  const errors: TripFieldErrors = {}
  const origin = draft.origin.trim().toUpperCase()
  const destination = draft.destination.trim().toUpperCase()

  if (!origin) {
    errors.origin = 'Enter a departure airport.'
  }

  if (!destination) {
    errors.destination = 'Enter an arrival airport.'
  } else if (origin === destination) {
    errors.destination = 'Choose a different arrival airport.'
  }

  if (!draft.departureDate) {
    errors.departureDate = 'Enter a departure date.'
  } else if (!isExactDate(draft.departureDate)) {
    errors.departureDate = 'Enter a valid date including the year.'
  }

  if (!/^[1-9]$/.test(draft.adults)) {
    errors.adults = 'Choose 1–9 adults.'
  }

  if (!draft.cabins.length) {
    errors.cabins = 'Choose at least one cabin.'
  } else if (draft.cabins.some((cabin) => !cabinChoices.includes(cabin))) {
    errors.cabins = 'Choose from the listed cabins.'
  }

  return errors
}
