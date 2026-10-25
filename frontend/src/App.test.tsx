import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import App from './App'

describe('trip entry', () => {
  it('collapses navigation at 900px and preserves focus across menu and viewport changes', async () => {
    const user = userEvent.setup()
    const listeners = new Set<(event: MediaQueryListEvent) => void>()
    let viewportWidth = 900
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
      matches: query.includes('max-width') && viewportWidth <= Number(query.match(/[\d.]+/)?.[0]) * 16,
      media: query,
      addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.add(listener),
      removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener),
    })))
    render(<App />)
    const menu = screen.getByRole('button', { name: 'Menu' })
    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).not.toBeInTheDocument()

    await user.click(menu)
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeVisible()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).not.toBeInTheDocument()
    expect(menu).toHaveFocus()

    viewportWidth = 1201
    act(() => listeners.forEach((listener) => listener({ matches: false } as MediaQueryListEvent)))
    const newTrip = screen.getByRole('button', { name: 'New trip' })
    await waitFor(() => expect(newTrip).toHaveFocus())

    viewportWidth = 900
    act(() => listeners.forEach((listener) => listener({ matches: true } as MediaQueryListEvent)))
    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).not.toBeInTheDocument()
    expect(menu).toHaveFocus()
  })

  it.each([901, 1024, 1200, 1280])('keeps desktop navigation visible before and after leaving the preview at %ipx', async (width) => {
    const user = userEvent.setup()
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
      matches: query.includes('max-width') && width <= Number(query.match(/[\d.]+/)?.[0]) * 16,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })))
    window.history.replaceState(null, '', '/?preview=awards')
    try {
      render(<App />)
      expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeVisible()
      await user.click(screen.getByRole('button', { name: 'New trip' }))

      expect(screen.queryByRole('region', { name: 'Fictional static award preview' })).not.toBeInTheDocument()
      expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeVisible()
      expect(screen.getByRole('button', { name: 'New trip' })).not.toHaveAttribute('aria-current')
      expect(screen.getByRole('heading', { name: 'Find your next award trip' })).toHaveFocus()
    } finally {
      window.history.replaceState(null, '', '/')
    }
  })

  it('leaves the preview through the collapsed menu at 768px with search still disabled', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
      matches: query.includes('max-width') && 768 <= Number(query.match(/[\d.]+/)?.[0]) * 16,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })))
    window.history.replaceState(null, '', '/?preview=awards')
    try {
      render(<App />)
      expect(screen.getByRole('region', { name: 'Fictional static award preview' })).toBeInTheDocument()
      expect(screen.queryByRole('navigation', { name: 'Main navigation' })).not.toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Menu' }))
      await user.click(screen.getByRole('button', { name: 'New trip' }))

      expect(screen.queryByRole('region', { name: 'Fictional static award preview' })).not.toBeInTheDocument()
      expect(screen.queryByRole('navigation', { name: 'Main navigation' })).not.toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Find your next award trip' })).toHaveFocus()
      expect(screen.getByRole('button', { name: 'Search awards' })).toBeDisabled()
    } finally {
      window.history.replaceState(null, '', '/')
    }
  })

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
