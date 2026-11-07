import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import App from './App'

describe('main-page chat entry', () => {
  it.each([
    { action: 'Send', invalidFormAttempt: false },
    { action: 'Enter', invalidFormAttempt: false },
    { action: 'Send', invalidFormAttempt: true },
    { action: 'Enter', invalidFormAttempt: true },
  ])('opens results using $action with invalid form attempt: $invalidFormAttempt', async ({ action, invalidFormAttempt }) => {
    let resolve!: (response: Response) => void
    vi.mocked(fetch).mockReturnValueOnce(new Promise((accept) => { resolve = accept }))
    render(<App />)
    const request = 'Find flights from New York to Seattle'
    const origin = screen.getByRole('textbox', { name: 'From' })
    expect(origin).toHaveValue('')
    expect(screen.getByRole('textbox', { name: 'To' })).toHaveValue('')
    expect(screen.getByLabelText('Departure date')).toHaveValue('')
    expect(screen.getByRole('checkbox', { name: 'Economy' })).not.toBeChecked()

    if (invalidFormAttempt) {
      fireEvent.click(screen.getByRole('button', { name: 'Search awards' }))
      expect(origin).toHaveAccessibleDescription('Enter a departure airport.')
      expect(screen.getByText('Choose at least one cabin.')).toBeVisible()
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
    expect(screen.queryByText('Enter a departure airport.')).not.toBeInTheDocument()
    expect(screen.queryByText('Choose at least one cabin.')).not.toBeInTheDocument()
    await act(async () => resolve(Response.json({ reply: 'What departure date would you like?', results: [] })))
    expect(screen.getByText('What departure date would you like?')).toBeVisible()
    expect(screen.getByText(request)).toBeVisible()
    expect(screen.getByRole('textbox', { name: 'Continue your search' })).toBeEnabled()
  })
})
