import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import App from './App'

const offer = {
  airline: 'AA, AS', cabin: 'economy', cash_fees_usd: 11.2, cents_per_point: null,
  departure_date: '2026-12-01', destination: 'SEA', origin: 'JFK', points_cost: 12500,
  program: 'American AAdvantage', seats_available: 2,
}
const response = {
  reply: 'Here are your **award options**:\n\n* **American AAdvantage:** 12,500 points',
  results: [offer, { ...offer, program: 'Alaska Mileage Plan', points_cost: 17500 }],
}
function pendingRequest() {
  let resolve!: (response: Response) => void
  vi.mocked(fetch).mockReturnValueOnce(new Promise((accept) => { resolve = accept }))
  return resolve
}
async function complete(resolve: ReturnType<typeof pendingRequest>) {
  await act(async () => resolve(Response.json(response)))
}
function send(message: string, initial = false) {
  fireEvent.change(screen.getByRole('textbox', { name: initial ? 'Your trip request' : 'Continue your search' }), {
    target: { value: message },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Send request' }))
}

describe('chat conversation controls', () => {
  it('renders returned Markdown inside the assistant bubble and keeps result filters independent', async () => {
    const user = userEvent.setup()
    const first = pendingRequest()
    const second = pendingRequest()
    render(<App />)
    send('JFK to SEA December 1', true)
    await complete(first)
    const bubble = screen.getByRole('region', { name: 'Assistant message' })
    expect(within(bubble).getByText('award options', { selector: 'strong' })).toBeVisible()
    expect(within(bubble).getByRole('listitem')).toHaveTextContent('American AAdvantage: 12,500 points')
    const earlierResults = within(screen.getByRole('region', { name: 'Award search results' }))
    await user.click(earlierResults.getByRole('button', { name: 'Programs: All programs' }))
    await user.click(screen.getByRole('checkbox', { name: 'Alaska Mileage Plan' }))
    await user.click(screen.getByRole('button', { name: 'Done' }))
    expect(within(earlierResults.getByRole('table')).queryByText('Alaska Mileage Plan')).not.toBeInTheDocument()
    send('Compare another date')
    await complete(second)
    const tables = screen.getAllByRole('table')
    expect(tables).toHaveLength(2)
    expect(within(tables[0]).queryByText('Alaska Mileage Plan')).not.toBeInTheDocument()
    expect(within(tables[1]).getByText('Alaska Mileage Plan')).toBeVisible()
    expect(screen.getAllByRole('textbox', { name: 'Continue your search' })).toHaveLength(1)
  })

  it('announces an earlier retry and cancellation while preserving newer results', async () => {
    const failure = pendingRequest()
    const success = pendingRequest()
    pendingRequest()
    render(<App />)
    send('First request', true)
    await act(async () => failure(new Response(null, { status: 503 })))
    send('Later request')
    await complete(success)
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(screen.getByText(/Searching award options/, { selector: '[role="status"]' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Cancel search' })).toHaveFocus()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel search' }))
    expect(screen.getByText(/Canceled/, { selector: '[role="status"]' })).toBeVisible()
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(vi.mocked(fetch).mock.calls[2][1]?.body).toBe(JSON.stringify({ message: 'First request' }))
  })

  it('preserves an earlier reading position and follows new content near the bottom', async () => {
    const first = pendingRequest()
    const second = pendingRequest()
    render(<App />)
    send('First request', true)
    const conversation = screen.getByRole('region', { name: 'Current conversation' })
    Object.defineProperties(conversation, {
      scrollHeight: { value: 2000, configurable: true }, clientHeight: { value: 500 },
    })
    conversation.scrollTop = 200
    fireEvent.scroll(conversation)
    await complete(first)
    expect(conversation.scrollTop).toBe(200)
    fireEvent.click(screen.getByRole('button', { name: 'New results' }))
    expect(conversation.scrollTop).toBe(2000)
    expect(conversation).toHaveFocus()
    conversation.scrollTop = 1450
    fireEvent.scroll(conversation)
    send('Search again')
    Object.defineProperty(conversation, 'scrollHeight', { value: 4000 })
    await complete(second)
    expect(conversation.scrollTop).toBe(4000)
    expect(screen.queryByRole('button', { name: 'New results' })).not.toBeInTheDocument()
  })

  it('handles Enter, Shift+Enter and IME safely and restores the draft after Cancel', () => {
    pendingRequest()
    render(<App />)
    const entry = screen.getByRole('textbox', { name: 'Your trip request' })
    expect(screen.getByRole('button', { name: 'Send request' })).toBeDisabled()
    fireEvent.change(entry, { target: { value: '   ' } })
    fireEvent.keyDown(entry, { key: 'Enter' })
    expect(fetch).not.toHaveBeenCalled()
    fireEvent.change(entry, { target: { value: 'Find a flight to Seattle' } })
    expect(fireEvent.keyDown(entry, { key: 'Enter', shiftKey: true })).toBe(true)
    fireEvent.keyDown(entry, { key: 'Enter', isComposing: true })
    fireEvent.keyDown(entry, { key: 'Enter', keyCode: 229 })
    expect(fetch).not.toHaveBeenCalled()
    fireEvent.keyDown(entry, { key: 'Enter' })
    expect(fetch).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel search' }))
    expect(screen.getByRole('textbox', { name: 'Continue your search' })).toHaveValue('Find a flight to Seattle')
    expect(screen.getByRole('textbox', { name: 'Continue your search' })).toHaveFocus()
  })

  it.each(['chat', 'form'])('reaches returned results through %s and prevents competing submissions', async (source) => {
    const request = pendingRequest()
    render(<App />)
    if (source === 'chat') send('JFK to SEA December 1', true)
    else {
      fireEvent.change(screen.getByRole('textbox', { name: 'From' }), { target: { value: 'JFK' } })
      fireEvent.change(screen.getByRole('textbox', { name: 'To' }), { target: { value: 'SEA' } })
      fireEvent.change(screen.getByLabelText('Departure date'), { target: { value: '2026-12-01' } })
      fireEvent.change(screen.getByRole('combobox', { name: 'Adults' }), { target: { value: '2' } })
      fireEvent.click(screen.getByRole('checkbox', { name: 'Economy' }))
      fireEvent.click(screen.getByRole('button', { name: 'Search awards' }))
    }
    expect(screen.getByRole('textbox', { name: 'Continue your search' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel search' })).toHaveFocus()
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Continue your search' }), { key: 'Enter' })
    expect(fetch).toHaveBeenCalledTimes(1)
    await act(async () => request(Response.json(source === 'chat' ? response : { message: null, results: response.results })))
    const table = screen.getByRole('table')
    expect(within(table).getByText('Alaska Mileage Plan')).toBeVisible()
    fireEvent.click(within(table).getByText('Alaska Mileage Plan'))
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('tablist', { name: 'Flight cabin' })).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Continue your search' })).toBeEnabled()
    expect(screen.getByRole('textbox', { name: 'Continue your search' })).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Send request' })).toBeDisabled()
  })
})
