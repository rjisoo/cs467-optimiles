import { describe, expect, it, vi } from 'vitest'
import { validateChatResponse } from './chat-response'
import { sendChatMessage } from './chat-api'

const result = {
  airline: 'AA, AS', cabin: 'economy', cash_fees_usd: 11.2, cents_per_point: null,
  departure_date: '2026-12-01', destination: 'SEA', origin: 'JFK', points_cost: 12500,
  program: 'American AAdvantage', seats_available: 2,
}

describe('actual chat response boundary', () => {
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
    { cash_fees_usd: Infinity }, { seats_available: -1 }, { cabin: 'suite' },
    { departure_date: '2026-02-30' }, { origin: '' }, { program: null },
  ])('rejects malformed result fields %j', (overrides) => {
    expect(() => validateChatResponse({ reply: 'Reply', results: [{ ...result, ...overrides }] })).toThrow('Invalid chat response')
  })

  it.each([{}, { reply: 7, results: [] }, { reply: 'Reply', results: null }])('rejects malformed envelopes %j', (payload) => {
    expect(() => validateChatResponse(payload)).toThrow('Invalid chat response')
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
