import { describe, expect, it } from 'vitest'
import { arrivalDayOffset, formatUpdatedAt, isExactDate } from './trip-date'

describe('exact calendar dates', () => {
  it.each(['2028-02-29', '2000-02-29', '2026-12-31', '0099-01-01'])('accepts %s', (value) => {
    expect(isExactDate(value)).toBe(true)
  })

  it.each([
    '',
    '2026-2-01',
    '2026-02-29',
    '1900-02-29',
    '2026-04-31',
    '2026-13-01',
    '2026-00-01',
    '2026-01-00',
    '0000-01-01',
    '2026-01-01T00:00:00Z',
    ' 2026-01-01',
  ])('rejects %s', (value) => {
    expect(isExactDate(value)).toBe(false)
  })
})

describe('trip time presentation', () => {
  it.each([
    ['2026-12-06T22:05:00', '2026-12-07T06:30:00', 1],
    ['2026-12-31T22:05:00', '2027-01-01T06:30:00', 1],
    ['2028-02-28T22:05:00', '2028-03-01T06:30:00', 2],
    ['2026-11-01T01:30:00', '2026-11-02T02:30:00', 1],
    ['2026-12-07T06:00:00', '2026-12-06T23:00:00', -1],
    ['2026-12-06T07:05:00', '2026-12-06T15:30:00', 0],
    ['Not reported', '2026-12-06T15:30:00', 0],
  ])('compares local calendar dates for %s → %s', (departure, arrival, expected) => {
    expect(arrivalDayOffset(departure, arrival)).toBe(expected)
  })

  it.each([
    ['2026-11-02T19:38:11.562677Z', 'America/Los_Angeles', 'Nov 2, 2026, 11:38 PST'],
    ['2026-11-02T19:38:11.562677Z', 'Asia/Tokyo', 'Nov 3, 2026, 04:38 GMT+9'],
    ['2026-11-01T08:30:00Z', 'America/Los_Angeles', 'Nov 1, 2026, 01:30 PDT'],
    ['2026-11-01T10:30:00Z', 'America/Los_Angeles', 'Nov 1, 2026, 02:30 PST'],
  ])('converts update time %s to %s', (value, zone, expected) => {
    expect(formatUpdatedAt(value, zone)).toBe(expected)
  })

  it('keeps missing and invalid update times unreported', () => {
    expect(formatUpdatedAt(null)).toBe('Not reported')
    expect(formatUpdatedAt('invalid')).toBe('Not reported')
  })
})
