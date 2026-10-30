import { useLayoutEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import Icon from './Icon'
import { demoRequest } from '../services/mock-search'
import { cabinChoices, type TripField, type TripFieldErrors } from '../lib/trip-validation'

export type TripDraft = {
  message: string
  origin: string
  destination: string
  departureDate: string
  adults: string
  cabins: string[]
}

type TripEntryProps = {
  draft: TripDraft
  onDraftChange: (draft: TripDraft) => void
  onSubmit: (source: 'chat' | 'form') => void
  fieldErrors: TripFieldErrors
  formAttempt: number
  pending?: boolean
  onCancel?: () => void
  composerOnly?: boolean
}

function TripEntry({
  draft,
  onDraftChange,
  onSubmit,
  fieldErrors,
  formAttempt,
  pending = false,
  onCancel,
  composerOnly = false,
}: TripEntryProps) {
  const messageRef = useRef<HTMLTextAreaElement>(null)
  const actionRef = useRef<HTMLButtonElement>(null)
  const formRef = useRef<HTMLFormElement>(null)

  useLayoutEffect(() => {
    if (formAttempt > 0) {
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
    }
  }, [formAttempt])

  function errorProps(field: TripField) {
    return {
      'aria-invalid': !!fieldErrors[field],
      'aria-describedby': fieldErrors[field] ? `${field}-error` : undefined,
    }
  }

  function fieldError(field: TripField) {
    return fieldErrors[field] && (
      <span className="field-error" id={`${field}-error`}>
        {fieldErrors[field]}
      </span>
    )
  }

  useLayoutEffect(() => {
    const shouldRestoreComposerFocus = composerOnly && (
      document.activeElement === actionRef.current || document.activeElement === document.body
    )

    if (pending) {
      actionRef.current?.focus()
    } else if (shouldRestoreComposerFocus) {
      messageRef.current?.focus()
    }
  }, [pending, composerOnly])

  useLayoutEffect(() => {
    function resizeComposer() {
      const textarea = messageRef.current
      const panel = textarea?.closest<HTMLElement>('.entry-choices')
      const workspace = textarea?.closest<HTMLElement>('.workspace')
      const intro = workspace?.querySelector<HTMLElement>('.entry-intro')
      if (!textarea || !panel) {
        return
      }

      const previousScroll = textarea.scrollTop
      const textareaStyle = getComputedStyle(textarea)
      const minHeight = parseFloat(textareaStyle.minHeight) || 80
      let maxHeight = parseFloat(textareaStyle.maxHeight) || 224
      if (composerOnly) {
        const viewportHeight = window.visualViewport?.height ?? window.innerHeight
        maxHeight = Math.min(maxHeight, viewportHeight * 0.25)
      }

      textarea.style.height = `${minHeight}px`
      // Reserve room for the full form and balanced outer padding on desktop.
      if (!composerOnly && workspace && intro && window.matchMedia('(width > 56.25rem)').matches) {
        const style = getComputedStyle(workspace)
        const introHeight = intro.offsetHeight + parseFloat(getComputedStyle(intro).marginBottom)
        const fixedContent = introHeight + panel.offsetHeight - textarea.offsetHeight
        const availableHeight = window.innerHeight - fixedContent
          - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)
        maxHeight = Math.min(maxHeight, availableHeight)
      }
      maxHeight = Math.max(minHeight, maxHeight)
      const height = Math.min(Math.max(minHeight, textarea.scrollHeight + 2), maxHeight)
      textarea.style.height = `${height}px`
      textarea.style.overflowY = textarea.scrollHeight > height - 2 ? 'auto' : 'hidden'
      const cursorIsAtEnd = document.activeElement === textarea
        && textarea.selectionEnd === textarea.value.length
      textarea.scrollTop = cursorIsAtEnd ? textarea.scrollHeight : previousScroll
    }

    resizeComposer()
    const panel = messageRef.current?.closest<HTMLElement>('.entry-choices')
    let previousWidth: number | undefined
    const observer = new ResizeObserver(([entry]) => {
      // Height changes come from this effect; react only to container width changes.
      const width = entry.contentRect.width
      if (width === previousWidth) {
        return
      }
      previousWidth = width
      resizeComposer()
    })
    if (panel) {
      observer.observe(panel)
    }
    window.addEventListener('resize', resizeComposer)
    window.visualViewport?.addEventListener('resize', resizeComposer)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', resizeComposer)
      window.visualViewport?.removeEventListener('resize', resizeComposer)
    }
  }, [draft.message, composerOnly, pending])

  function toggleCabin(cabin: string) {
    const cabins = draft.cabins.includes(cabin)
      ? draft.cabins.filter((selectedCabin) => selectedCabin !== cabin)
      : [...draft.cabins, cabin]
    onDraftChange({ ...draft, cabins })
  }

  return (
    <Card className={`surface entry-choices${composerOnly ? ' journey-composer' : ''}`}>
      <form
        className="entry-card chat-entry"
        aria-labelledby="chat-title"
        aria-describedby="preview-notice"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          if (!pending) {
            onSubmit('chat')
          }
        }}
      >
        <h2 id="chat-title">
          <span className="section-icon"><Icon name="chat" /></span>
          {composerOnly ? 'Continue your search' : 'Describe your trip'}
        </h2>
        <Label className="visually-hidden" htmlFor="trip-message">
          {composerOnly ? 'Continue your search' : 'Your trip request'}
        </Label>
        <div className="composer-row">
          <Textarea
            id="trip-message"
            ref={messageRef}
            rows={2}
            value={draft.message}
            disabled={pending}
            placeholder={composerOnly ? undefined : demoRequest}
            onKeyDown={(event) => {
              const isSubmitKey = event.key === 'Enter'
                && !event.shiftKey
                && !event.nativeEvent.isComposing
                && event.keyCode !== 229

              if (!isSubmitKey) {
                return
              }

              event.preventDefault()
              if (!pending && draft.message.trim()) {
                onSubmit('chat')
              }
            }}
            onChange={(event) => onDraftChange({ ...draft, message: event.target.value })}
          />
          <Button
            ref={actionRef}
            className={`preview-action send-request${pending ? ' cancel-request' : ''}`}
            type={pending ? 'button' : 'submit'}
            aria-label={pending ? 'Cancel search' : 'Send request'}
            disabled={!pending && !draft.message.trim()}
            onClick={pending ? onCancel : undefined}
          >
            {pending ? 'Cancel search' : <Icon name="arrowUp" />}
          </Button>
        </div>
      </form>

      {!composerOnly && (
        <>
          <div className="entry-divider">
            <Separator />
            <span>Or</span>
            <Separator />
          </div>

          <form
            ref={formRef}
            className="entry-card details-entry"
            aria-labelledby="form-title"
            aria-describedby="preview-notice"
            noValidate
            onSubmit={(event) => {
              event.preventDefault()
              if (!pending) {
                onSubmit('form')
              }
            }}
          >
            <h2 id="form-title">
              <span className="section-icon"><Icon name="search" /></span>
              Enter trip details
            </h2>
            <p id="form-modes">One-way, exact dates for now. Round-trip and flexible dates come later.</p>
            <p role="status" className="visually-hidden">
              {Object.keys(fieldErrors).length ? 'Check the highlighted trip fields.' : ''}
            </p>
            <div className="trip-fields route-fields">
              <div className="trip-field">
                <Label htmlFor="origin">From</Label>
                <Input
                  id="origin"
                  type="text"
                  placeholder="City or airport code"
                  value={draft.origin}
                  {...errorProps('origin')}
                  onChange={(event) => onDraftChange({ ...draft, origin: event.target.value })}
                />
                {fieldError('origin')}
              </div>
              <div className="trip-field">
                <Label htmlFor="destination">To</Label>
                <Input
                  id="destination"
                  type="text"
                  placeholder="City or airport code"
                  value={draft.destination}
                  {...errorProps('destination')}
                  onChange={(event) => onDraftChange({ ...draft, destination: event.target.value })}
                />
                {fieldError('destination')}
              </div>
            </div>
            <div className="trip-fields detail-fields">
              <Label htmlFor="trip-type">
                Trip type
                <NativeSelect id="trip-type" defaultValue="one-way" aria-describedby="form-modes">
                  <NativeSelectOption value="one-way">One-way</NativeSelectOption>
                  <NativeSelectOption value="round-trip" disabled>Round-trip (later)</NativeSelectOption>
                </NativeSelect>
              </Label>
              <div className="trip-field">
                <Label htmlFor="departure-date">Departure date</Label>
                <Input
                  id="departure-date"
                  type="date"
                  value={draft.departureDate}
                  {...errorProps('departureDate')}
                  onChange={(event) => onDraftChange({ ...draft, departureDate: event.target.value })}
                />
                {fieldError('departureDate')}
              </div>
              <div className="trip-field">
                <Label htmlFor="adults">Adults</Label>
                <NativeSelect
                  id="adults"
                  value={draft.adults}
                  {...errorProps('adults')}
                  onChange={(event) => onDraftChange({ ...draft, adults: event.target.value })}
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((count) => (
                    <NativeSelectOption key={count} value={count}>
                      {count} {count === 1 ? 'adult' : 'adults'}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                {fieldError('adults')}
              </div>
            </div>
            <div className="form-end">
              <fieldset className="cabin-choices">
                <legend>Cabin <span>· choose one or more</span></legend>
                <div className="cabin-options">
                  {cabinChoices.map((cabin) => (
                    <Label key={cabin} htmlFor={`cabin-${cabin.replaceAll(' ', '-')}`}>
                      <Checkbox
                        id={`cabin-${cabin.replaceAll(' ', '-')}`}
                        value={cabin}
                        checked={draft.cabins.includes(cabin)}
                        {...errorProps('cabins')}
                        onCheckedChange={() => toggleCabin(cabin)}
                      />
                      {cabin}
                    </Label>
                  ))}
                </div>
                {fieldError('cabins')}
              </fieldset>
              <div className="form-footer">
                <span>Only the disclosed demo scenario is supported.</span>
                <Button className="preview-action" type="submit" disabled={pending}>
                  <Icon name="search" />
                  Search awards
                </Button>
              </div>
            </div>
          </form>
        </>
      )}
    </Card>
  )
}

export default TripEntry
