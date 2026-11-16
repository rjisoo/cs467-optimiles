import { expect, vi } from 'vitest'
import type { Airport, AirportCatalog } from './services/airports'

export const testAirports: readonly Airport[] = [
  { code: 'JFK', name: 'John F. Kennedy International Airport', city: 'New York', country: 'US', timeZone: 'America/New_York' },
  { code: 'LGA', name: 'LaGuardia Airport', city: 'New York', country: 'US', timeZone: 'America/New_York' },
  { code: 'SEA', name: 'Seattle-Tacoma International Airport', city: 'Seattle', country: 'US', timeZone: 'America/Los_Angeles' },
  { code: 'LAX', name: 'Los Angeles International Airport', city: 'Los Angeles', country: 'US', timeZone: 'America/Los_Angeles' },
  { code: 'ORD', name: "Chicago O'Hare International Airport", city: 'Chicago', country: 'US', timeZone: 'America/Chicago' },
  { code: 'LHR', name: 'London Heathrow Airport', city: 'London', country: 'GB', timeZone: 'Europe/London' },
  { code: 'HND', name: 'Tokyo Haneda Airport', city: 'Tokyo', country: 'JP', timeZone: 'Asia/Tokyo' },
  { code: 'GRU', name: 'Guarulhos International Airport', city: 'São Paulo', country: 'BR', timeZone: 'America/Sao_Paulo' },
]
export const testAirportCatalog: AirportCatalog = { version: 'test-airports-v1', airports: testAirports }

export function mockAirportCatalog() {
  vi.mocked(fetch).mockImplementationOnce(async (url) => {
    expect(url).toBe('/api/airports')
    return Response.json(testAirportCatalog)
  })
}
