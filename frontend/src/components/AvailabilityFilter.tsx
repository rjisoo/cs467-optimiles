import { useId, useState } from 'react'
import { Popover } from 'radix-ui'
import Icon from './Icon'

type Props = {
  label: string
  allLabel: string
  values: string[]
  options: {
    value: string
    label: string
  }[]
  onChange: (values: string[]) => void
}

export default function AvailabilityFilter({ label, allLabel, values, options, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const titleId = useId()
  const allSelected = values.length === options.length
  const selectedLabels = options
    .filter((option) => values.includes(option.value))
    .map((option) => option.label)
    .join(', ')
  const current = allSelected ? allLabel : selectedLabels || 'None selected'

  function toggleAll() {
    const nextValues = allSelected ? [] : options.map((option) => option.value)
    onChange(nextValues)
  }

  function toggleOption(value: string, checked: boolean) {
    if (checked) {
      onChange([...values, value])
    } else {
      onChange(values.filter((selectedValue) => selectedValue !== value))
    }
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          className="compact-button compact-button--filter availability-filter"
          data-active={!allSelected}
          aria-label={`${label}: ${current}`}
          title={`${label}: ${current}`}
        >
          <span>{label}{!allSelected && ` (${values.length})`}</span>
          <Icon name="chevronDown" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="popover-surface availability-filter-menu"
          align="start"
          sideOffset={6}
          collisionPadding={12}
          aria-labelledby={titleId}
        >
          <div className="toolbar">
            <strong id={titleId}>{label}</strong>
            <Popover.Close
              className="compact-button compact-button--icon availability-filter-close"
              aria-label={`Close ${label.toLowerCase()} filter`}
            >
              ×
            </Popover.Close>
          </div>
          <fieldset>
            <legend className="visually-hidden">{label}</legend>
            <label>
              <input
                type="checkbox"
                checked={allSelected}
                ref={(input) => {
                  if (input) {
                    input.indeterminate = values.length > 0 && !allSelected
                  }
                }}
                onChange={toggleAll}
              />
              {allLabel}
            </label>
            {options.map((option) => (
              <label key={option.value}>
                <input
                  type="checkbox"
                  value={option.value}
                  checked={values.includes(option.value)}
                  onChange={(event) => toggleOption(option.value, event.target.checked)}
                />
                {option.label}
              </label>
            ))}
          </fieldset>
          <Popover.Close className="compact-button compact-button--soft availability-filter-done">
            Done
          </Popover.Close>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
