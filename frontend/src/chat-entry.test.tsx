import { act, fireEvent, render, screen } from '@testing-library/react'
import { flushSync } from 'react-dom'
import { describe, expect, it, vi } from 'vitest'
import App from './App'
import TripEntry from './components/TripEntry'
import { mockAirportCatalog } from './test-airports'

describe('main-page chat entry', () => {
  it('does not submit the retained draft when cancellation immediately enables Send', () => {
    const onSubmit = vi.fn()
    const props = {
      draft: { message: 'Keep this draft', origin: '', destination: '', originCodes: [], destinationCodes: [],
        departureDate: '', adults: '1', cabins: [] },
      onDraftChange: vi.fn(), onSubmit, fieldErrors: {}, formAttempt: 0,
      composerOnly: true, airportStatus: 'idle' as const, onLoadAirports: vi.fn(),
    }
    const onCancel = vi.fn(() => flushSync(() => rerender(<TripEntry {...props} pending={false} />)))
    const { rerender } = render(<TripEntry {...props} pending onCancel={onCancel} />)

    fireEvent.click(screen.getByRole('button', { name: 'Cancel search' }))

    expect(onCancel).toHaveBeenCalledOnce()
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByRole('textbox')).toHaveValue('Keep this draft')
    expect(screen.getByRole('button', { name: 'Send request' })).toBeEnabled()
  })

  it.each([
    { action: 'Send', invalidFormAttempt: false },
    { action: 'Enter', invalidFormAttempt: false },
    { action: 'Send', invalidFormAttempt: true },
    { action: 'Enter', invalidFormAttempt: true },
  ])('opens results using $action with invalid form attempt: $invalidFormAttempt', async ({ action, invalidFormAttempt }) => {
    let resolve!: (response: Response) => void
    if (invalidFormAttempt) mockAirportCatalog()
    vi.mocked(fetch).mockReturnValueOnce(new Promise((accept) => { resolve = accept }))
    render(<App />)
    const request = 'Find flights from New York to Seattle'
    const origin = screen.getByRole('combobox', { name: 'From' })
    expect(origin).toHaveValue('')
    expect(screen.getByRole('combobox', { name: 'To' })).toHaveValue('')
    expect(screen.getByLabelText('Departure date')).toHaveValue('')
    expect(screen.getByRole('checkbox', { name: 'Economy' })).not.toBeChecked()

    if (invalidFormAttempt) {
      await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Search awards' })))
      expect(origin).toHaveAccessibleDescription('Choose at least one departure airport.')
      expect(screen.getByRole('checkbox', { name: 'Economy' })).not.toHaveAttribute('aria-invalid', 'true')
    }

    const message = screen.getByRole('textbox', { name: 'Your trip request' })
    fireEvent.change(message, { target: { value: request } })
    if (action === 'Send') {
      fireEvent.click(screen.getByRole('button', { name: 'Send request' }))
    } else {
      fireEvent.keyDown(message, { key: 'Enter' })
    }

    expect(screen.getByRole('heading', { name: 'Your award trip' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Cancel search' })).toHaveFocus()
    expect(screen.queryByText('Check the highlighted trip fields.')).not.toBeInTheDocument()
    expect(screen.queryByText('Choose at least one departure airport.')).not.toBeInTheDocument()
    await act(async () => resolve(Response.json({ reply: 'What departure date would you like?', results: [] })))
    expect(screen.getByText('What departure date would you like?')).toBeVisible()
    expect(screen.getByText(request)).toBeVisible()
    expect(screen.getByRole('textbox', { name: 'Continue your search' })).toBeEnabled()
  })
})
