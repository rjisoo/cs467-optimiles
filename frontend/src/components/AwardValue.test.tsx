import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import AwardValue from './AwardValue'
import AwardCard from './AwardCard'
import type { CabinFare } from './award-display'
import { awardFixtures } from './award-fixtures'

describe('illustrative value explanation', () => {
  it('keeps decimal, zero and unknown fees distinct across the card and explanation', async () => {
    const user = userEvent.setup()
    render(<>{awardFixtures.map((award) => <AwardCard key={award.id} award={award} />)}</>)
    const meridian = within(screen.getByRole('article', { name: 'Meridian Air' }))
    const harbor = within(screen.getByRole('article', { name: 'Harbor Air' }))
    const atlas = within(screen.getByRole('article', { name: 'Airline unavailable' }))
    expect(meridian.getByRole('region', { name: 'Business' })).toHaveTextContent('+ USD 80.45')
    expect(atlas.getByRole('region', { name: 'Business' })).toHaveTextContent('+ USD 0.00')
    expect(harbor.getByRole('region', { name: 'Business' })).toHaveTextContent('Fees unknown')
    expect(harbor.getByRole('region', { name: 'Business' })).not.toHaveTextContent('USD 0.00')
    await user.click(meridian.getByRole('button', { name: /Business: Good value/ }))
    expect(await screen.findByRole('dialog', { name: 'How value is calculated' })).toHaveTextContent('Award cash fees: USD 80.45')
  })

  it('withdraws the supplied value and explanation when zero fees become unknown', async () => {
    const user = userEvent.setup()
    const fare: CabinFare = {
      status: 'available', points: 50000, fees: 0,
      previewValue: { cpp: '2.00', cashFare: 1000, rating: 'Good' },
    }
    const { rerender } = render(<AwardValue cabin="Business" fare={fare} />)

    await user.click(screen.getByRole('button', { name: /Business: Good value/ }))
    expect(await screen.findByRole('dialog', { name: 'How value is calculated' })).toHaveTextContent('Award cash fees: USD 0.00')

    rerender(<AwardValue cabin="Business" fare={{ ...fare, fees: null }} />)

    expect(screen.getByText('Value unavailable')).toBeVisible()
    expect(screen.queryByText('2.00¢')).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  // JSDOM verifies focus and lifecycle; actual keyboard scrolling is checked in a browser.
  it('opens with Enter, focuses the explanation and returns focus after Escape', async () => {
    const user = userEvent.setup()
    render(<AwardValue cabin="Business" fare={awardFixtures[0].cabins.Business} />)

    await user.tab()
    const trigger = screen.getByRole('button')
    expect(trigger).toHaveFocus()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await user.keyboard('{Enter}')

    const explanation = await screen.findByRole('dialog', { name: 'How value is calculated' })
    expect(explanation).toHaveFocus()
    expect(explanation).toHaveTextContent('Business · Per person · One way')
    expect(explanation).toHaveTextContent('2,600 − USD 80.45')
    await user.keyboard('{ArrowDown}')
    fireEvent.scroll(explanation)
    expect(explanation).toHaveFocus()
    expect(explanation).toBeInTheDocument()
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('opens on click, supports keyboard closing and dismisses on an outside click', async () => {
    const user = userEvent.setup()
    render(<><AwardValue cabin="Economy" fare={awardFixtures[0].cabins.Economy} /><button>Outside</button></>)

    const trigger = screen.getByRole('button', { name: /Economy: Fair value/ })
    await user.click(trigger)

    expect(await screen.findByRole('dialog')).toHaveTextContent('Fictional fares; ratings are illustrative')
    await user.tab()
    expect(screen.getByRole('button', { name: 'Close value explanation' })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
    await user.click(trigger)
    await user.click(screen.getByRole('button', { name: 'Outside' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
