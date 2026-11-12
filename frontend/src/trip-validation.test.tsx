import { act, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import App from './App'
import { validateTripFields } from './lib/trip-validation'
import useChatJourney from './useChatJourney'

const validDraft = {
  message: '', origin: 'JFK', destination: 'SEA', departureDate: '2026-12-01', adults: '1', cabins: ['Economy'],
}

describe('structural trip validation', () => {
  it.each(['0', '10', '1.5', '1e0', '', ' 1', '01'])('blocks invalid adults %s without losing the draft', (adults) => {
    const { result } = renderHook(useChatJourney)
    const draft = { ...validDraft, adults, message: 'Keep my request' }
    act(() => result.current.setDraft(draft))
    act(() => result.current.submit('form'))
    expect(result.current.fieldErrors.adults).toBe('Choose 1–9 adults.')
    expect(result.current.draft).toEqual(draft)
    expect(result.current.turns).toEqual([])
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each(['1', '9'])('allows the product adult boundary %s without claiming provider support', (adults) => {
    expect(validateTripFields({ ...validDraft, message: '', adults })).toEqual({})
  })

  it('rejects whitespace, equal normalized endpoints, impossible dates and unknown cabin labels', () => {
    expect(validateTripFields({ ...validDraft, origin: '  ' })).toHaveProperty('origin')
    expect(validateTripFields({ ...validDraft, message: '', origin: ' ord ', destination: 'ORD',
      departureDate: '2026-02-29', cabins: ['Sleeper'] })).toEqual({
      destination: 'Choose a different arrival airport.', departureDate: 'Enter a valid date including the year.',
      cabins: 'Choose from the listed cabins.',
    })
  })

  it('submits a structurally valid route directly without a demo gate', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ message: null, results: [] }))
    const { result } = renderHook(useChatJourney)
    act(() => result.current.setDraft({ ...validDraft, destination: 'LHR' }))
    await act(async () => result.current.submit('form'))
    expect(result.current.fieldErrors).toEqual({})
    expect(fetch).toHaveBeenCalledWith('/api/search', expect.objectContaining({
      body: JSON.stringify({ origin: 'JFK', destination: 'LHR', departure_date: '2026-12-01', passengers: 1, cabins: ['economy'] }),
    }))
  })

  it.each(['New York', 'JFK1', 'JF', '123', 'ＪＦＫ'])('rejects non-code airport input %s', (airport) => {
    expect(validateTripFields({ ...validDraft, origin: airport, destination: airport })).toMatchObject({
      origin: expect.stringContaining('three-letter airport code'), destination: expect.stringContaining('three-letter airport code'),
    })
  })

})

describe('field error recovery', () => {
  it('shows errors together, focuses on submit, rechecks corrections and resets without searching', () => {
    render(<App />)
    const origin = screen.getByRole('textbox', { name: 'From' })
    const destination = screen.getByRole('textbox', { name: 'To' })
    const date = screen.getByLabelText('Departure date')
    const message = screen.getByRole('textbox', { name: 'Your trip request' })
    const economy = screen.getByRole('checkbox', { name: 'Economy' })
    const search = screen.getByRole('button', { name: 'Search awards' })
    fireEvent.change(message, { target: { value: 'Keep this request' } })
    fireEvent.change(origin, { target: { value: ' ' } })
    expect(origin).not.toHaveAttribute('aria-invalid', 'true')
    fireEvent.click(search)
    expect(origin).toHaveFocus()
    expect(origin).toHaveAccessibleDescription('Enter a departure airport.')
    expect(destination).toHaveAccessibleDescription('Enter an arrival airport.')
    expect(date).toHaveAccessibleDescription('Enter a departure date.')
    expect(economy).toHaveAccessibleDescription('Choose at least one cabin.')
    fireEvent.change(origin, { target: { value: ' ord ' } })
    expect(origin).toHaveFocus()
    expect(origin).not.toHaveAttribute('aria-invalid', 'true')
    fireEvent.click(search)
    expect(destination).toHaveFocus()
    fireEvent.change(destination, { target: { value: 'ORD' } })
    expect(destination).toHaveAccessibleDescription('Choose a different arrival airport.')
    origin.focus()
    fireEvent.change(origin, { target: { value: 'SEA' } })
    expect(destination).not.toHaveAttribute('aria-invalid', 'true')
    expect(origin).toHaveFocus()
    fireEvent.click(search)
    expect(date).toHaveFocus()
    fireEvent.change(date, { target: { value: '2027-04-08' } })
    fireEvent.click(search)
    expect(economy).toHaveFocus()
    fireEvent.click(economy)
    expect(economy).not.toHaveAttribute('aria-invalid', 'true')
    expect(message).toHaveValue('Keep this request')
    expect(origin).toHaveValue('SEA')
    expect(fetch).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'New trip' }))
    expect(origin).toHaveValue('')
    expect(origin).not.toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('heading', { name: 'Find your next award trip' })).toHaveFocus()
  })
})
