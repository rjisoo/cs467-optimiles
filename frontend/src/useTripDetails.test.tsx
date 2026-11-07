import { StrictMode, type PropsWithChildren } from 'react'
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import useTripDetails from './useTripDetails'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((accept) => { resolve = accept })
  return { promise, resolve }
}

const empty = { availability_id: 'availability-1', booking_links: [], trips: [] }

describe('per-search trip loading', () => {
  it('loads only on demand and reuses pending and successful empty responses', async () => {
    const request = deferred<Response>()
    vi.mocked(fetch).mockReturnValueOnce(request.promise)
    const { result } = renderHook(useTripDetails, {
      wrapper: ({ children }: PropsWithChildren) => <StrictMode>{children}</StrictMode>,
    })
    expect(fetch).not.toHaveBeenCalled()
    act(() => { void result.current.load('availability-1'); void result.current.load('availability-1') })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(result.current.states['availability-1'].status).toBe('pending')
    await act(async () => request.resolve(Response.json(empty)))
    expect(result.current.states['availability-1']).toEqual({ status: 'success', response: empty })
    await act(async () => result.current.load('availability-1'))
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('retries a failed response without discarding other cached availability', async () => {
    const other = { ...empty, availability_id: 'other' }
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(other))
      .mockResolvedValueOnce(new Response(null, { status: 503 })).mockResolvedValueOnce(Response.json(empty))
    const { result } = renderHook(useTripDetails)
    await act(async () => result.current.load('other'))
    await act(async () => result.current.load('availability-1'))
    expect(result.current.states['availability-1']).toMatchObject({ status: 'failed', error: expect.stringContaining('503') })
    await act(async () => result.current.load('availability-1'))
    expect(result.current.states['other']).toEqual({ status: 'success', response: other })
    expect(result.current.states['availability-1']).toEqual({ status: 'success', response: empty })
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('aborts pending JSON on unmount and keeps a new search with the same ID independent', async () => {
    const body = deferred<typeof empty>()
    const firstResponse = Response.json(empty)
    vi.spyOn(firstResponse, 'json').mockReturnValueOnce(body.promise)
    vi.mocked(fetch).mockResolvedValueOnce(firstResponse).mockResolvedValueOnce(Response.json(empty))
    const first = renderHook(useTripDetails)
    await act(async () => { void first.result.current.load('availability-1') })
    const signal = vi.mocked(fetch).mock.calls[0][1]?.signal
    first.unmount()
    expect(signal?.aborted).toBe(true)
    const second = renderHook(useTripDetails)
    await act(async () => second.result.current.load('availability-1'))
    await act(async () => body.resolve(empty))
    expect(first.result.current.states['availability-1'].status).toBe('pending')
    expect(second.result.current.states['availability-1']).toEqual({ status: 'success', response: empty })
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})
