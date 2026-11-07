import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import AvailabilityPagination from './AvailabilityPagination'

const defaults = { label: 'Daily options pagination', unit: 'date / program rows', page: 1, pageSize: 5, total: 13 }

describe('availability pagination', () => {
  it('navigates boundaries, announces ranges, and distinguishes pointer from keyboard navigation', async () => {
    const user = userEvent.setup(), onPageChange = vi.fn(), onPageSizeChange = vi.fn()
    const { rerender } = render(<AvailabilityPagination {...defaults} onPageChange={onPageChange} onPageSizeChange={onPageSizeChange} />)
    expect(screen.getByRole('navigation', { name: defaults.label })).toBeVisible()
    expect(screen.getByRole('status')).toHaveTextContent('1–5 of 13 date / program rows · Page 1 of 3')
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Page 1' })).toHaveAttribute('aria-current', 'page')
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(onPageChange).toHaveBeenLastCalledWith(2, true)
    rerender(<AvailabilityPagination {...defaults} page={3} onPageChange={onPageChange} onPageSizeChange={onPageSizeChange} />)
    expect(screen.getByRole('status')).toHaveTextContent('11–13 of 13 date / program rows · Page 3 of 3')
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
    screen.getByRole('button', { name: 'Previous' }).focus()
    await user.keyboard('{Enter}')
    expect(onPageChange).toHaveBeenLastCalledWith(2, false)
    expect(screen.getByRole('button', { name: 'Previous' })).toHaveFocus()
  })

  it('keeps hundreds of pages bounded with numbered navigation and no page-jump input', async () => {
    const user = userEvent.setup(), onPageChange = vi.fn()
    render(<AvailabilityPagination {...defaults} page={100} total={5000} onPageChange={onPageChange} onPageSizeChange={vi.fn()} />)
    expect(screen.getAllByRole('button', { name: /^Page / })).toHaveLength(5)
    expect(screen.getByRole('button', { name: 'Page 1000' })).toBeVisible()
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Go' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Page 1000' }))
    expect(onPageChange).toHaveBeenLastCalledWith(1000, true)
  })

  it('omits pagination for empty or small sets and hides navigation when one larger page fits', async () => {
    const user = userEvent.setup(), onPageSizeChange = vi.fn()
    const { rerender } = render(<AvailabilityPagination {...defaults} total={0} onPageChange={vi.fn()} onPageSizeChange={onPageSizeChange} />)
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
    rerender(<AvailabilityPagination {...defaults} total={4} onPageChange={vi.fn()} onPageSizeChange={onPageSizeChange} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    rerender(<AvailabilityPagination {...defaults} pageSize={25} onPageChange={vi.fn()} onPageSizeChange={onPageSizeChange} />)
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Page/ })).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('1–13 of 13')
    expect(screen.getByRole('status')).not.toHaveTextContent('Page 1 of 1')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Rows per page' }), '5')
    expect(onPageSizeChange).toHaveBeenLastCalledWith(5)
  })
})
