import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('trip entry', () => {
  it('lets travelers select and remove cabins independently', async () => {
    const user = userEvent.setup()
    render(<App />)
    const economy = screen.getByRole('checkbox', { name: 'Economy' })
    const business = screen.getByRole('checkbox', { name: 'Business' })

    await user.click(economy)
    await user.click(business)

    expect(economy).toBeChecked()
    expect(business).toBeChecked()

    await user.click(economy)

    expect(economy).not.toBeChecked()
    expect(business).toBeChecked()
  })

  it('clears the draft and focuses the heading when starting a new trip', async () => {
    const user = userEvent.setup()
    render(<App />)
    const message = screen.getByRole('textbox', { name: 'Your trip request' })
    const origin = screen.getByRole('textbox', { name: 'From' })
    const destination = screen.getByRole('textbox', { name: 'To' })
    const departureDate = screen.getByLabelText('Departure date')
    const adults = screen.getByRole('combobox', { name: 'Adults' })
    const business = screen.getByRole('checkbox', { name: 'Business' })

    await user.type(message, 'Two adults flying from ORD to SEA')
    await user.type(origin, 'ORD')
    await user.type(destination, 'SEA')
    fireEvent.change(departureDate, { target: { value: '2027-04-08' } })
    await user.selectOptions(adults, '2')
    await user.click(business)

    expect(message).toHaveValue('Two adults flying from ORD to SEA')
    expect(origin).toHaveValue('ORD')
    expect(destination).toHaveValue('SEA')
    expect(departureDate).toHaveValue('2027-04-08')
    expect(adults).toHaveValue('2')
    expect(business).toBeChecked()

    await user.click(screen.getByRole('button', { name: 'New trip' }))

    expect(message).toHaveValue('')
    expect(origin).toHaveValue('')
    expect(destination).toHaveValue('')
    expect(departureDate).toHaveValue('')
    expect(adults).toHaveValue('1')
    expect(business).not.toBeChecked()
    expect(screen.getByRole('heading', { name: 'Find your next award trip' })).toHaveFocus()
  })

  it('opens award help and returns focus to its trigger after Escape', async () => {
    const user = userEvent.setup()
    render(<App />)
    const helpButton = screen.getByRole('button', { name: 'Award help' })

    await user.click(helpButton)

    expect(screen.getByRole('dialog', { name: 'What is an award flight?' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Close help' })).toHaveFocus()

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(helpButton).toHaveFocus()
  })
})
