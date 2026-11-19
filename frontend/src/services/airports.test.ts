import { expect, it, vi } from 'vitest'
import { airportLabel, airportSuggestions, loadAirportCatalog,
  resolveAirport, validateAirportCatalog, type Airport } from './airports'

const airport = (code: string, city = 'New York', name = `${city} Airport`): Airport => ({
  code, city, name, country: 'US', timeZone: 'America/New_York',
})
const airports = [airport('LGA', 'New York', 'LaGuardia Airport'),
  airport('JFK', 'New York', 'John F. Kennedy International Airport'),
  airport('AAA', 'Another City', 'New York Regional Airport'), airport('NEW', 'New Orleans')]
const payload = { version: 'pinned-revision', airports }

it('loads only when requested and shares pending and successful catalog loads', async () => {
  let resolve!: (value: Response) => void
  vi.mocked(fetch).mockReturnValueOnce(new Promise((accept) => { resolve = accept }))
  expect(fetch).not.toHaveBeenCalled()
  const first = loadAirportCatalog()
  expect(loadAirportCatalog()).toBe(first)
  expect(fetch).toHaveBeenCalledExactlyOnceWith('/api/airports')
  resolve(Response.json(payload))
  const catalog = await first
  expect(catalog).toEqual(payload)
  expect(await loadAirportCatalog()).toBe(catalog)
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(Object.isFrozen(catalog)).toBe(true)
  expect(Object.isFrozen(catalog.airports)).toBe(true)
  expect(Object.isFrozen(catalog.airports[0])).toBe(true)
})

it.each(['network', 'http', 'json', 'schema'])('allows explicit retry after a %s failure', async (failure) => {
  if (failure === 'network') vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Offline'))
  else vi.mocked(fetch).mockResolvedValueOnce(failure === 'http' ? new Response(null, { status: 503 })
    : failure === 'json' ? new Response('not JSON') : Response.json({ airports: [] }))
  await expect(loadAirportCatalog()).rejects.toThrow('Airport lookup is unavailable')
  expect(fetch).toHaveBeenCalledTimes(1)
  vi.mocked(fetch).mockResolvedValueOnce(Response.json(payload))
  expect(await loadAirportCatalog()).toEqual(payload)
  expect(fetch).toHaveBeenCalledTimes(2)
})

it.each([null, [], {}, { ...payload, version: '' }, { ...payload, airports: [] },
  { ...payload, airports: [...airports, airports[0]] },
  ...[{ code: 'jfk' }, { code: 'JFK1' }, { name: '' }, { city: null }, { country: 'USA' },
    { timeZone: '' }, { timeZone: '+09:00' }].map((changes) => ({ ...payload, airports: [{ ...airports[0], ...changes }] })),
])('rejects incomplete or ambiguous catalog data %j', (value) => {
  expect(() => validateAirportCatalog(value)).toThrow('Invalid airport')
})

it('resolves only exact codes and keeps ambiguous cities and full names unselected', () => {
  expect(resolveAirport(airports, ' jFk ')?.code).toBe('JFK')
  for (const query of ['New York', 'John F. Kennedy International Airport', 'Kennedy', 'ZZZ', '']) {
    expect(resolveAirport(airports, query)).toBeUndefined()
  }
  expect(airportLabel(airports[1])).toBe('New York · JFK')
  expect(airportLabel(airport('XXX', '', 'Remote Airfield'))).toBe('Remote Airfield · XXX')
})

it('ranks exact codes and code/city prefixes before name matches with deterministic ties', () => {
  expect(airportSuggestions(airports, 'new').map((item) => item.code)).toEqual(['NEW', 'JFK', 'LGA', 'AAA'])
  expect(airportSuggestions(airports, 'jfk')[0].code).toBe('JFK')
  expect(airportSuggestions([...airports].reverse(), 'new').map((item) => item.code)).toEqual(['NEW', 'JFK', 'LGA', 'AAA'])
  expect(airportSuggestions(airports, 'kennedy york').map((item) => item.code)).toEqual(['JFK'])
  expect(airportSuggestions([airport('GRU', 'São Paulo')], 'SAO PAULO')[0].code).toBe('GRU')
  expect(airportSuggestions(airports, 'unknown place')).toEqual([])
  expect(airportSuggestions(airports, '   ')).toEqual([])
  const many = Array.from({ length: 12 }, (_, index) => airport(`AA${String.fromCharCode(65 + index)}`))
  expect(airportSuggestions(many.reverse(), 'new york').map((item) => item.code)).toEqual(
    Array.from({ length: 10 }, (_, index) => `AA${String.fromCharCode(65 + index)}`),
  )
})

