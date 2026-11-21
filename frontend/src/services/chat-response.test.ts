import { describe, expect, it, vi } from 'vitest'
import { validateChatResponse } from './chat-response'
import { sendChatMessage } from './chat-api'
import { validateSearchResponse } from './search-api'

const result = {
  airline: 'AA, AS', cabin: 'economy', cash_fees_usd: 11.2, cents_per_point: null,
  departure_date: '2026-12-01', destination: 'SEA', origin: 'JFK', points_cost: 12500,
  program: 'American AAdvantage', seats_available: 2,
}

describe('actual chat response boundary', () => {
  it('preserves fare provenance, warnings and rating metadata in both search and chat', () => {
    const valued = { ...result, source: 'american', search_passengers: 2, cash_fare_usd: 245.6,
      value_rating: 'good', value_warning: 'Load trip details to compare value.' }
    expect(validateChatResponse({ reply: '', results: [valued] }).results[0]).toEqual(valued)
    expect(validateSearchResponse({ results: [valued], message: null }).results[0]).toEqual(valued)
  })

  it('drops malformed optional value evidence without discarding a usable award', () => {
    const invalidValue = { source: 12, search_passengers: 0, cash_fare_usd: Infinity, value_rating: 'best', value_warning: {} }
    expect(validateChatResponse({ reply: '', results: [{ ...result, ...invalidValue }] }).results[0])
      .toEqual({ ...result, source: null, search_passengers: null, cash_fare_usd: null, value_rating: null, value_warning: null })
  })

  it('keeps an award when legacy optional fees or CPP are malformed', () => {
    for (const value of [Infinity, NaN, true, '2.50', {}, -1]) {
      expect(validateChatResponse({ reply: '', results: [{ ...result, cash_fees_usd: value }] }).results[0].cash_fees_usd).toBeNull()
      if (value !== -1) expect(validateChatResponse({ reply: '', results: [{ ...result, cents_per_point: value }] })
        .results[0].cents_per_point).toBeNull()
    }
  })

  it.each([{ partial: false, warnings: [] }, { partial: true, warnings: ['Some dates were not checked.'] },
    { partial: true }, { warnings: ['Cached availability may have changed.'] }, {}])('preserves optional coverage in both envelopes %j', (coverage) => {
    const chat = { reply: '', results: [], ...coverage }
    const search = { message: null, results: [], ...coverage }
    expect(validateChatResponse(chat)).toEqual(chat)
    expect(validateSearchResponse(search)).toEqual(search)
  })

  it.each([{ partial: null }, { partial: 'true' }, { partial: 1 }, { warnings: null },
    { warnings: 'Incomplete' }, { warnings: [7] }, { warnings: [''] }, { warnings: ['  '] }])(
    'rejects malformed coverage in both envelopes %j', (coverage) => {
      expect(() => validateChatResponse({ reply: '', results: [], ...coverage })).toThrow('Invalid response')
      expect(() => validateSearchResponse({ message: null, results: [], ...coverage })).toThrow('Invalid response')
    },
  )

  it('preserves provider availability identity without inventing IDs for older results', () => {
    for (const availability_id of ['provider-123', null]) {
      expect(validateChatResponse({ reply: '', results: [{ ...result, availability_id }] }).results[0].availability_id).toBe(availability_id)
    }
    expect(validateChatResponse({ reply: '', results: [result] }).results[0]).not.toHaveProperty('availability_id')
    expect(() => validateChatResponse({ reply: '', results: [{ ...result, availability_id: '../path' }] })).toThrow('availability_id')
  })

  it('reads and validates returned JSON while preserving the message-only request', async () => {
    const payload = { reply: '**Available options**', results: [result] }
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(payload))
    const signal = new AbortController().signal
    expect(await sendChatMessage('JFK to SEA December 1, 2026', signal)).toEqual(payload)
    expect(fetch).toHaveBeenCalledWith('/api/chat', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ message: 'JFK to SEA December 1, 2026' }), signal,
    }))
  })

  it('keeps empty replies/results, null values and known zeros without sample fallback', () => {
    expect(validateChatResponse({ reply: '', results: [] })).toEqual({ reply: '', results: [] })
    const zero = { ...result, cash_fees_usd: 0, cents_per_point: 0, seats_available: 0, points_cost: 0 }
    expect(validateChatResponse({ reply: 'None', results: [zero] }).results).toEqual([zero])
    expect(validateChatResponse({ reply: 'Negative value', results: [{ ...result, cents_per_point: -0.2 }] }).results[0].cents_per_point).toBe(-0.2)
    expect(validateChatResponse({ reply: 'Fees unknown', results: [{ ...result, cash_fees_usd: null }] }).results[0].cash_fees_usd).toBeNull()
  })

  it.each([
    { points_cost: -1 }, { points_cost: '12500' }, { points_cost: 1.5 },
    { seats_available: -1 }, { cabin: 'suite' },
    { departure_date: '2026-02-30' }, { origin: '' }, { program: null },
  ])('rejects malformed result fields %j', (overrides) => {
    expect(() => validateChatResponse({ reply: 'Reply', results: [{ ...result, ...overrides }] })).toThrow('Invalid response')
  })

  it.each([{}, { reply: 7, results: [] }, { reply: 'Reply', results: null }])('rejects malformed envelopes %j', (payload) => {
    expect(() => validateChatResponse(payload)).toThrow('Invalid response')
  })

  it('rejects invalid JSON and schema instead of substituting a successful example', async () => {
    for (const response of [new Response('not JSON'), Response.json({ reply: 'Missing results' })]) {
      vi.mocked(fetch).mockResolvedValueOnce(response)
      await expect(sendChatMessage('Search', new AbortController().signal)).rejects.toThrow('invalid response')
    }
  })

  it.each([400, 429, 503])('retains HTTP error handling for %i', async (status) => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status }))
    await expect(sendChatMessage('Search', new AbortController().signal)).rejects.toMatchObject({ status })
  })
})
