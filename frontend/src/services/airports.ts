export type Airport = Readonly<{
  code: string
  name: string
  city: string
  country: string
  timeZone: string
}>
export type AirportCatalog = Readonly<{ version: string; airports: readonly Airport[] }>

export function validateAirportCatalog(input: unknown): AirportCatalog {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid airport catalog')
  const catalog = input as Record<string, unknown>
  if (typeof catalog.version !== 'string' || !catalog.version.trim()
    || !Array.isArray(catalog.airports) || !catalog.airports.length) throw new Error('Invalid airport catalog')
  const codes = new Set<string>()
  const airports = catalog.airports.map((value): Airport => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid airport record')
    const airport = value as Record<string, unknown>
    if (typeof airport.code !== 'string' || !/^[A-Z]{3}$/.test(airport.code) || codes.has(airport.code)
      || typeof airport.name !== 'string' || !airport.name.trim()
      || typeof airport.city !== 'string'
      || typeof airport.country !== 'string' || !/^[A-Z]{2}$/.test(airport.country)
      || typeof airport.timeZone !== 'string' || !airport.timeZone.trim() || /^[+-]/.test(airport.timeZone)) {
      throw new Error('Invalid airport record')
    }
    codes.add(airport.code)
    return Object.freeze({ code: airport.code, name: airport.name, city: airport.city,
      country: airport.country, timeZone: airport.timeZone })
  })
  return Object.freeze({ version: catalog.version, airports: Object.freeze(airports) })
}

let catalogRequest: Promise<AirportCatalog> | undefined

export function loadAirportCatalog(): Promise<AirportCatalog> {
  if (!catalogRequest) {
    const request = fetch('/api/airports').then(async (response) => {
      if (!response.ok) throw new Error(`Airport lookup failed (HTTP ${response.status})`)
      return validateAirportCatalog(await response.json())
    }).catch((error: unknown) => {
      if (catalogRequest === request) catalogRequest = undefined
      throw new Error('Airport lookup is unavailable. Please try again.', { cause: error })
    })
    catalogRequest = request
  }
  return catalogRequest
}

export function resetAirportCatalogCache() {
  catalogRequest = undefined
}

const normalize = (value: string) => value.normalize('NFKD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim().replace(/\s+/g, ' ')

export function resolveAirport(airports: readonly Airport[], value: string): Airport | undefined {
  const query = normalize(value)
  return airports.find((airport) => airport.code.toLowerCase() === query)
}

export function airportLabel(airport: Airport): string {
  return `${airport.city.trim() || airport.name} · ${airport.code}`
}

export function airportSuggestions(airports: readonly Airport[], value: string): Airport[] {
  const query = normalize(value)
  if (!query) return []
  const tokens = query.split(/\s+/)
  return airports.map((airport) => {
    const code = airport.code.toLowerCase()
    const city = normalize(airport.city)
    const name = normalize(airport.name)
    const search = `${code} ${city} ${name}`
    const rank = code === query ? 0 : code.startsWith(query) ? 1 : city === query ? 2
      : city.startsWith(query) ? 3 : name.startsWith(query) ? 4
        : tokens.every((token) => search.includes(token)) ? 5 : -1
    return { airport, rank }
  }).filter((item) => item.rank >= 0)
    .sort((first, second) => first.rank - second.rank || first.airport.code.localeCompare(second.airport.code))
    .slice(0, 10).map((item) => item.airport)
}
