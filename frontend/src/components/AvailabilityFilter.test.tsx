import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import AvailabilityFilter from './AvailabilityFilter'

function CabinFilter() {
  const [values, setValues] = useState(['economy'])

  return (
    <AvailabilityFilter
      label="Cabins"
      allLabel="All cabins"
      values={values}
      options={[
        { value: 'economy', label: 'Economy' },
        { value: 'business', label: 'Business' },
      ]}
      onChange={setValues}
    />
  )
}

describe('availability filter', () => {
  it('keeps individual choices, select-all state and the trigger label in sync', async () => {
    const user = userEvent.setup()
    render(<CabinFilter />)

    await user.click(screen.getByRole('button', { name: 'Cabins: Economy' }))
    const all = screen.getByRole('checkbox', { name: 'All cabins' })
    const economy = screen.getByRole('checkbox', { name: 'Economy' })
    const business = screen.getByRole('checkbox', { name: 'Business' })
    expect(all).toBePartiallyChecked()
    expect(economy).toBeChecked()
    expect(business).not.toBeChecked()

    await user.click(all)
    expect(all).toBeChecked()
    expect(all).not.toBePartiallyChecked()
    expect(economy).toBeChecked()
    expect(business).toBeChecked()
    expect(screen.getByRole('button', { name: 'Cabins: All cabins' })).toHaveAttribute('data-active', 'false')

    await user.click(all)
    expect(all).not.toBeChecked()
    expect(all).not.toBePartiallyChecked()
    expect(economy).not.toBeChecked()
    expect(business).not.toBeChecked()
    expect(screen.getByRole('button', { name: 'Cabins: None selected' })).toHaveTextContent('Cabins (0)')

    await user.click(business)
    expect(all).toBePartiallyChecked()
    await user.click(economy)
    expect(all).toBeChecked()
    await user.click(economy)
    expect(all).toBePartiallyChecked()
    expect(screen.getByRole('button', { name: 'Cabins: Business' })).toHaveTextContent('Cabins (1)')

    await user.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cabins: Business' }))
    expect(screen.getByRole('checkbox', { name: 'Business' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Economy' })).not.toBeChecked()
  })

  it('opens from the keyboard and restores trigger focus after Escape', async () => {
    const user = userEvent.setup()
    render(<CabinFilter />)

    await user.tab()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('checkbox', { name: 'All cabins' })).toBeVisible()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cabins: Economy' })).toHaveFocus()
  })
})
