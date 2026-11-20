import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import App from './App'
import { testAirportCatalog } from './test-airports'

const empty = { message: 'No matching cached awards.', results: [] }

function prepareRequests() {
  vi.mocked(fetch).mockImplementation(async (url) => {
    if (url === '/api/airports') return Response.json(testAirportCatalog)
    return Response.json(empty)
  })
}

function searches() {
  return vi.mocked(fetch).mock.calls.filter(([url]) => url === '/api/search')
}

async function startTrip() {
  const origin = screen.getByRole('combobox', { name: 'From' })
  await act(async () => origin.focus())
  fireEvent.change(origin, { target: { value: 'JFK' } })
  fireEvent.keyDown(origin, { key: 'Enter' })
  const destination = screen.getByRole('combobox', { name: 'To' })
  fireEvent.change(destination, { target: { value: 'SEA' } })
  fireEvent.keyDown(destination, { key: 'Enter' })
  fireEvent.change(screen.getByLabelText('Departure date'), { target: { value: '2026-12-01' } })
  fireEvent.click(screen.getByRole('checkbox', { name: 'Business' }))
  fireEvent.click(screen.getByRole('button', { name: 'Search awards' }))
  await screen.findByText(empty.message)
}

it('shares the trip draft, traps focus, and retains unsent edits when closed', async () => {
  const user = userEvent.setup()
  prepareRequests()
  render(<App />)
  await startTrip()
  const edit = screen.getByRole('button', { name: 'Edit trip' })
  await user.click(edit)
  const dialog = screen.getByRole('dialog', { name: 'Edit trip' })
  const form = within(dialog)
  expect(form.queryByRole('textbox')).not.toBeInTheDocument()
  expect(form.getByLabelText('Departure date')).toHaveValue('2026-12-01')
  expect(form.getByRole('checkbox', { name: 'Business' })).toBeChecked()
  const close = form.getByRole('button', { name: 'Close editor' })
  expect(close).toHaveFocus()
  await user.tab({ shift: true })
  expect(form.getByRole('button', { name: 'Search awards' })).toHaveFocus()
  await user.tab()
  expect(close).toHaveFocus()
  await user.selectOptions(form.getByRole('combobox', { name: 'Adults' }), '3')
  expect(searches()).toHaveLength(1)
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await waitFor(() => expect(edit).toHaveFocus())
  expect(screen.getByRole('region', { name: 'Current trip' })).toHaveTextContent('1 adult')
  await user.click(edit)
  expect(screen.getByRole('combobox', { name: 'Adults' })).toHaveValue('3')
  expect(searches()).toHaveLength(1)
})

it('searches edited criteria once, preserves prior results, and blocks editing while pending', async () => {
  const user = userEvent.setup()
  prepareRequests()
  render(<App />)
  await startTrip()
  await user.click(screen.getByRole('button', { name: 'Edit trip' }))
  fireEvent.change(screen.getByLabelText('Departure date'), { target: { value: '2026-12-05' } })
  let resolve!: (response: Response) => void
  vi.mocked(fetch).mockImplementationOnce(() => new Promise<Response>((accept) => { resolve = accept }))
  await user.click(screen.getByRole('button', { name: 'Search awards' }))
  expect(searches()).toHaveLength(2)
  expect(JSON.parse(String(searches()[1][1]?.body))).toMatchObject({
    origin: 'JFK', destination: 'SEA', departure_date: '2026-12-05', cabins: ['business'], passengers: 1,
  })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByText(empty.message)).toBeVisible()
  expect(screen.getByRole('button', { name: 'Edit trip' })).toBeDisabled()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel search' })).toHaveFocus())
  await act(async () => resolve(Response.json({ ...empty, message: 'No awards for the revised date.' })))
  expect(screen.getByText(empty.message)).toBeVisible()
  expect(screen.getByText('No awards for the revised date.')).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Edit trip' }))
  expect(screen.getByLabelText('Departure date')).toHaveValue('2026-12-05')
})

it('keeps the editor open and focuses invalid fields without starting a search', async () => {
  const user = userEvent.setup()
  prepareRequests()
  render(<App />)
  await startTrip()
  await user.click(screen.getByRole('button', { name: 'Edit trip' }))
  const departure = screen.getByLabelText('Departure date')
  fireEvent.change(departure, { target: { value: '' } })
  await user.click(screen.getByRole('button', { name: 'Search awards' }))
  expect(screen.getByRole('dialog', { name: 'Edit trip' })).toBeVisible()
  expect(departure).toHaveAttribute('aria-invalid', 'true')
  expect(departure).toHaveFocus()
  expect(searches()).toHaveLength(1)
})

it('offers the shared form when chat has no complete trip yet', async () => {
  const user = userEvent.setup()
  prepareRequests()
  vi.mocked(fetch).mockResolvedValueOnce(Response.json({ reply: 'Which route and date?', results: [] }))
  render(<App />)
  await user.type(screen.getByRole('textbox', { name: 'Your trip request' }), 'Find an award')
  await user.click(screen.getByRole('button', { name: 'Send request' }))
  await screen.findByText('Which route and date?')
  await user.click(screen.getByRole('button', { name: 'Edit trip' }))
  expect(screen.getByRole('dialog', { name: 'Edit trip' })).toBeVisible()
  expect(screen.getByLabelText('Departure date')).toHaveValue('')
  expect(screen.getByRole('combobox', { name: 'Adults' })).toHaveValue('1')
  expect(searches()).toHaveLength(0)
})

it('closes the airport picker before the editor when Escape is pressed', async () => {
  const user = userEvent.setup()
  prepareRequests()
  render(<App />)
  await startTrip()
  await user.click(screen.getByRole('button', { name: 'Edit trip' }))
  await user.click(screen.getByRole('combobox', { name: 'From' }))
  expect(screen.getByRole('dialog', { name: 'From airport selection' })).toBeVisible()
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('dialog', { name: 'From airport selection' })).not.toBeInTheDocument()
  expect(screen.getByRole('dialog', { name: 'Edit trip' })).toBeVisible()
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('dialog', { name: 'Edit trip' })).not.toBeInTheDocument()
})
