import type { AwardDisplay } from './award-display'

// Only the three approved fictional examples; values and categories are supplied, not computed.
export const awardPreviewTrip = { origin: 'ORD', destination: 'LHR', awardDate: '2026-11-16' }
export const awardFixtures: AwardDisplay[] = [
  {
    ...awardPreviewTrip, id: 'meridian', airline: 'Meridian Air', airlineMark: 'plane', program: 'Meridian Rewards',
    schedule: {
      departure: '6:00 pm', departureZone: 'CST', arrival: '8:00 am', arrivalZone: 'GMT', arrivalDate: '2026-11-17',
      dayOffset: '+1 day', duration: '8h 00m', stops: 'Nonstop',
    },
    cabins: {
      Economy: { status: 'available', points: 30000, fees: 80.45, previewValue: { cpp: '1.90', cashFare: 650, rating: 'Fair' } },
      Premium: { status: 'available', points: 50000, fees: 80.45, previewValue: { cpp: '2.54', cashFare: 1350, rating: 'Good' } },
      Business: { status: 'available', points: 70000, fees: 80.45, previewValue: { cpp: '3.60', cashFare: 2600, rating: 'Good' } },
      First: { status: 'available', points: 110000, fees: 120.75, previewValue: { cpp: '4.25', cashFare: 4800, rating: 'Good' } },
    },
    seatNote: 'Business: 2 seats reported',
    checked: { dateTime: '2026-10-20T09:15:00-05:00', label: 'Tue, Oct 20, 9:15 am CDT' },
    previewCategories: ['The best value', 'Shortest journey'],
  },
  {
    ...awardPreviewTrip, id: 'harbor', airline: 'Harbor Air', airlineMark: 'waves', program: 'Harbor Club',
    schedule: {
      departure: '8:00 pm', departureZone: 'CST', arrival: '2:00 pm', arrivalZone: 'GMT', arrivalDate: '2026-11-17',
      dayOffset: '+1 day', duration: '12h 00m', stops: '1 stop · BOS',
    },
    cabins: {
      Economy: { status: 'available', points: 28000, fees: 60.25, previewValue: null },
      Premium: { status: 'Not reported' },
      Business: { status: 'available', points: 62000, fees: null, previewValue: null },
      First: { status: 'No award' },
    },
    seatNote: 'Seats for 2 unverified in all cabins', checked: null, previewCategories: [],
  },
  {
    ...awardPreviewTrip, id: 'atlas', airline: null, airlineMark: 'aircraft', program: 'Atlas Rewards', schedule: null,
    cabins: {
      Economy: { status: 'available', points: 25000, fees: 0, previewValue: null },
      Premium: { status: 'Not reported' },
      Business: { status: 'available', points: 58000, fees: 0, previewValue: null },
      First: { status: 'No award' },
    },
    seatNote: 'Seats for 2 unverified in all cabins',
    checked: { dateTime: '2026-10-20T08:40:00-05:00', label: 'Tue, Oct 20, 8:40 am CDT' },
    previewCategories: ['Lowest points'],
  },
]
