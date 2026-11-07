import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import useChatJourney from './useChatJourney'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail })
  return { promise, resolve, reject }
}

const response = { reply: 'Please provide a departure date.', results: [] }

describe('chat request lifecycle', () => {
  it('accepts chat after invalid form validation and prevents blank or concurrent requests', async () => {
    const request = deferred<Response>()
    vi.mocked(fetch).mockReturnValueOnce(request.promise)
    const { result } = renderHook(useChatJourney)
    act(() => result.current.submit('form'))
    expect(result.current.fieldErrors.origin).toBe('Enter a departure airport.')
    act(() => result.current.submit('chat'))
    expect(fetch).not.toHaveBeenCalled()

    act(() => result.current.setDraft((draft) => ({ ...draft, message: 'Find a trip to Seattle.' })))
    act(() => { result.current.submit('chat'); result.current.submit('chat') })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(result.current.fieldErrors).toEqual({})
    expect(result.current.formAttempt).toBe(0)
    expect(result.current.pending).toBe(true)
    await act(async () => request.resolve(Response.json(response)))
    expect(result.current.draft.message).toBe('')
    expect(result.current.turns[0]).toMatchObject({ status: 'success', response })
  })

  it('keeps a newer draft when a pending request succeeds', async () => {
    const request = deferred<Response>()
    vi.mocked(fetch).mockReturnValueOnce(request.promise)
    const { result } = renderHook(useChatJourney)
    act(() => result.current.setDraft((draft) => ({ ...draft, message: 'First request' })))
    act(() => result.current.submit('chat'))
    act(() => result.current.setDraft((draft) => ({ ...draft, message: 'My next request' })))
    await act(async () => request.resolve(Response.json(response)))
    expect(result.current.turns[0].status).toBe('success')
    expect(result.current.draft.message).toBe('My next request')
  })

  it.each(['cancel', 'reset'] as const)('%s ignores late JSON while a replacement request is pending', async (action) => {
    const body = deferred<typeof response>()
    const oldResponse = Response.json(response)
    vi.spyOn(oldResponse, 'json').mockReturnValueOnce(body.promise)
    const replacement = deferred<Response>()
    vi.mocked(fetch).mockResolvedValueOnce(oldResponse).mockReturnValueOnce(replacement.promise)
    const { result } = renderHook(useChatJourney)
    act(() => result.current.setDraft((draft) => ({ ...draft, message: 'Old request' })))
    await act(async () => result.current.submit('chat'))
    const oldSignal = vi.mocked(fetch).mock.calls[0][1]?.signal
    act(() => result.current[action]())
    expect(oldSignal?.aborted).toBe(true)
    if (action === 'reset') expect(result.current.turns).toHaveLength(0)
    else expect(result.current.turns[0].status).toBe('canceled')
    act(() => result.current.setDraft((draft) => ({ ...draft, message: 'New request' })))
    act(() => result.current.submit('chat'))
    await act(async () => body.resolve(response))
    expect(result.current.turns.at(-1)?.status).toBe('pending')
    expect(result.current.turns.every((turn) => !turn.response)).toBe(true)
    expect(result.current.draft.message).toBe('New request')
    act(() => result.current.submit('chat'))
    expect(fetch).toHaveBeenCalledTimes(2)
    await act(async () => replacement.resolve(Response.json(response)))
    expect(result.current.turns.at(-1)?.response).toEqual(response)
    expect(result.current.pending).toBe(false)
  })

  it('ignores a canceled HTTP rejection without replacing newer success', async () => {
    const canceled = deferred<Response>()
    vi.mocked(fetch).mockReturnValueOnce(canceled.promise).mockResolvedValueOnce(Response.json(response))
    const { result } = renderHook(useChatJourney)
    act(() => result.current.setDraft((draft) => ({ ...draft, message: 'Old request' })))
    act(() => result.current.submit('chat'))
    act(() => result.current.cancel())
    await act(async () => result.current.submit('chat'))
    await act(async () => canceled.reject(new TypeError('Connection lost')))
    expect(result.current.turns.map((turn) => turn.status)).toEqual(['canceled', 'success'])
  })

  it('retries the captured request in place and preserves later results and edits', async () => {
    const retry = deferred<Response>()
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(Response.json(response)).mockReturnValueOnce(retry.promise)
    const { result } = renderHook(useChatJourney)
    act(() => result.current.setDraft((draft) => ({ ...draft, message: 'Original request' })))
    await act(async () => result.current.submit('chat'))
    const failed = result.current.turns[0]
    act(() => result.current.setDraft((draft) => ({ ...draft, message: 'Later request' })))
    await act(async () => result.current.submit('chat'))
    const later = result.current.turns[1]
    act(() => result.current.setDraft((draft) => ({ ...draft, message: 'Keep this edit' })))
    act(() => { result.current.retry(failed); result.current.retry(failed) })
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(vi.mocked(fetch).mock.calls[2][1]?.body).toBe(JSON.stringify({ message: 'Original request' }))
    expect(result.current.turns).toHaveLength(2)
    expect(result.current.lastActionId).toBe(failed.id)
    await act(async () => retry.resolve(Response.json(response)))
    expect(result.current.turns.map((turn) => turn.status)).toEqual(['success', 'success'])
    expect(result.current.turns[1]).toEqual(later)
    expect(result.current.draft.message).toBe('Keep this edit')
  })

  it('aborts a pending request on unmount', async () => {
    const request = deferred<Response>()
    vi.mocked(fetch).mockReturnValueOnce(request.promise)
    const { result, unmount } = renderHook(useChatJourney)
    act(() => result.current.setDraft((draft) => ({ ...draft, message: 'Search' })))
    act(() => result.current.submit('chat'))
    const signal = vi.mocked(fetch).mock.calls[0][1]?.signal
    unmount()
    expect(signal?.aborted).toBe(true)
    await act(async () => request.resolve(Response.json(response)))
  })
})
