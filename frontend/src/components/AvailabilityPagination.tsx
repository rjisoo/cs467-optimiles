import { useRef } from 'react'
import { getPageNumbers } from '../services/availability-presentation'

type Props = {
  label: string
  unit: string
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number, scroll?: boolean) => void
  onPageSizeChange?: (size: number) => void
}

export default function AvailabilityPagination({
  label,
  unit,
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: Props) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const current = Math.max(1, Math.min(page, pageCount))
  const jumpInput = useRef<HTMLInputElement>(null)
  const pointerJump = useRef(false)
  if (total <= 5) {
    return null
  }
  const Container = pageCount > 1 ? 'nav' : 'div'

  return (
    <Container className="availability-pagination" aria-label={pageCount > 1 ? label : undefined}>
      <p role="status">
        {total ? (current - 1) * pageSize + 1 : 0}–{Math.min(current * pageSize, total)} of {total} {unit}
        {pageCount > 1 && <span> · Page {current} of {pageCount}</span>}
      </p>
      {pageCount > 1 && (
        <div className="availability-page-controls">
          <button
            className="compact-button compact-button--outline"
            type="button"
            disabled={current === 1}
            onClick={(event) => onPageChange(current - 1, event.detail > 0)}
          >
            Previous
          </button>
          {getPageNumbers(current, pageCount).map((number, index) => {
            if (number === 'ellipsis') {
              return <span key={`gap-${index}`} aria-hidden="true">…</span>
            }
            return (
              <button
                className="compact-button compact-button--outline"
                type="button"
                key={number}
                aria-label={`Page ${number}`}
                aria-current={number === current ? 'page' : undefined}
                disabled={!total}
                onClick={(event) => onPageChange(number, event.detail > 0)}
              >
                {number}
              </button>
            )
          })}
          <button
            className="compact-button compact-button--outline"
            type="button"
            disabled={current === pageCount}
            onClick={(event) => onPageChange(current + 1, event.detail > 0)}
          >
            Next
          </button>
        </div>
      )}
      {onPageSizeChange && (
        <label className="availability-page-size">
          Rows per page
          <select
            className="compact-control"
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
          >
            {[5, 10, 25].map((size) => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
        </label>
      )}
      {pageCount > 5 && (
        <form
          className="availability-page-jump"
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              pointerJump.current = false
            }
          }}
          onSubmit={(event) => {
            event.preventDefault()
            const input = jumpInput.current
            if (!input?.reportValidity()) {
              return
            }
            const next = input.valueAsNumber
            if (Number.isInteger(next) && next >= 1 && next <= pageCount) {
              onPageChange(next, pointerJump.current)
            }
          }}
        >
          <label>
            Go to page
            <input
              ref={jumpInput}
              type="number"
              min={1}
              max={pageCount}
              step={1}
              required
              placeholder={String(current)}
            />
          </label>
          <button
            className="compact-button compact-button--outline"
            type="submit"
            onClick={(event) => {
              pointerJump.current = event.detail > 0
            }}
          >
            Go
          </button>
        </form>
      )}
    </Container>
  )
}
