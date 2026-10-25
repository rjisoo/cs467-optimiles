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
import './TripEntry.css'

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
}

function TripEntry({ draft, onDraftChange }: TripEntryProps) {
  const messageRef = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    function resizeComposer() {
      const textarea = messageRef.current
      const panel = textarea?.closest<HTMLElement>('.entry-choices')
      const workspace = textarea?.closest<HTMLElement>('.workspace')
      const intro = workspace?.querySelector<HTMLElement>('.entry-intro')
      if (!textarea || !panel) return

      const previousScroll = textarea.scrollTop
      const textareaStyle = getComputedStyle(textarea)
      const minHeight = parseFloat(textareaStyle.minHeight) || 80
      let maxHeight = parseFloat(textareaStyle.maxHeight) || 224
      textarea.style.height = `${minHeight}px`
      // Reserve room for the full form and balanced outer padding on desktop.
      if (workspace && intro && window.matchMedia('(width > 56.25rem)').matches) {
        const style = getComputedStyle(workspace)
        const fixedContent = intro.offsetHeight + parseFloat(getComputedStyle(intro).marginBottom)
          + panel.offsetHeight - textarea.offsetHeight
        maxHeight = Math.min(maxHeight, window.innerHeight - fixedContent
          - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom))
      }
      maxHeight = Math.max(minHeight, maxHeight)
      const height = Math.min(Math.max(minHeight, textarea.scrollHeight + 2), maxHeight)
      textarea.style.height = `${height}px`
      textarea.style.overflowY = textarea.scrollHeight > height - 2 ? 'auto' : 'hidden'
      textarea.scrollTop = document.activeElement === textarea && textarea.selectionEnd === textarea.value.length
        ? textarea.scrollHeight : previousScroll
    }

    resizeComposer()
    const panel = messageRef.current?.closest<HTMLElement>('.entry-choices')
    let previousWidth: number | undefined
    const observer = new ResizeObserver(([entry]) => {
      // Height changes come from this effect; react only to container width changes.
      const width = entry.contentRect.width
      if (width === previousWidth) return
      previousWidth = width
      resizeComposer()
    })
    if (panel) observer.observe(panel)
    window.addEventListener('resize', resizeComposer)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', resizeComposer)
    }
  }, [draft.message])

  function toggleCabin(cabin: string) {
    const cabins = draft.cabins.includes(cabin)
      ? draft.cabins.filter((selectedCabin) => selectedCabin !== cabin)
      : [...draft.cabins, cabin]
    onDraftChange({ ...draft, cabins })
  }

  return (
    <Card className="entry-choices">
      <form className="entry-card chat-entry" aria-labelledby="chat-title" aria-describedby="preview-notice"
        noValidate onSubmit={(event) => event.preventDefault()}>
        <h2 id="chat-title"><span className="section-icon"><Icon name="chat" /></span>Describe your trip</h2>
        <Label className="visually-hidden" htmlFor="trip-message">Your trip request</Label>
        <div className="composer-row">
          <Textarea id="trip-message" ref={messageRef} rows={2} value={draft.message}
            placeholder="Round trip ORD–SEA, Apr 8–12, 2027, 2 adults, economy."
            onChange={(event) => onDraftChange({ ...draft, message: event.target.value })} />
          <Button className="preview-action send-request" type="submit" aria-label="Send request" disabled><Icon name="arrowUp" /></Button>
        </div>
      </form>

      <div className="entry-divider"><Separator /><span>Or</span><Separator /></div>

      <form className="entry-card details-entry" aria-labelledby="form-title" aria-describedby="preview-notice"
        noValidate onSubmit={(event) => event.preventDefault()}>
        <h2 id="form-title"><span className="section-icon"><Icon name="search" /></span>Enter trip details</h2>
        <p id="form-modes">One-way, exact dates for now. Round-trip and flexible dates come later.</p>
        <div className="trip-fields route-fields">
          <Label htmlFor="origin">From
            <Input id="origin" type="text" placeholder="City or airport code" value={draft.origin}
              onChange={(event) => onDraftChange({ ...draft, origin: event.target.value })} />
          </Label>
          <Label htmlFor="destination">To
            <Input id="destination" type="text" placeholder="City or airport code" value={draft.destination}
              onChange={(event) => onDraftChange({ ...draft, destination: event.target.value })} />
          </Label>
        </div>
        <div className="trip-fields detail-fields">
          <Label htmlFor="trip-type">Trip type
            <NativeSelect id="trip-type" defaultValue="one-way" aria-describedby="form-modes">
              <NativeSelectOption value="one-way">One-way</NativeSelectOption>
              <NativeSelectOption value="round-trip" disabled>Round-trip (later)</NativeSelectOption>
            </NativeSelect>
          </Label>
          <Label htmlFor="departure-date">Departure date
            <Input id="departure-date" type="date" value={draft.departureDate}
              onChange={(event) => onDraftChange({ ...draft, departureDate: event.target.value })} />
          </Label>
          <Label htmlFor="adults">Adults
            <NativeSelect id="adults" value={draft.adults}
              onChange={(event) => onDraftChange({ ...draft, adults: event.target.value })}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((count) => (
                <NativeSelectOption key={count} value={count}>{count} {count === 1 ? 'adult' : 'adults'}</NativeSelectOption>
              ))}
            </NativeSelect>
          </Label>
        </div>
        <div className="form-end">
          <fieldset className="cabin-choices">
            <legend>Cabin <span>· choose one or more</span></legend>
            <div className="cabin-options">
              {['Economy', 'Premium economy', 'Business', 'First'].map((cabin) => (
                <Label key={cabin} htmlFor={`cabin-${cabin.replaceAll(' ', '-')}`}>
                  <Checkbox id={`cabin-${cabin.replaceAll(' ', '-')}`} value={cabin}
                    checked={draft.cabins.includes(cabin)} onCheckedChange={() => toggleCabin(cabin)} />
                  {cabin}
                </Label>
              ))}
            </div>
          </fieldset>
          <div className="form-footer">
            <span>Search is unavailable in this preview.</span>
            <Button className="preview-action" type="submit" disabled><Icon name="search" />Search awards</Button>
          </div>
        </div>
      </form>
    </Card>
  )
}

export default TripEntry
