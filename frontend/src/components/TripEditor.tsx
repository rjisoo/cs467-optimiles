import type { RefObject } from 'react'
import { Button } from './ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from './ui/dialog'
import TripEntry, { type TripEntryProps } from './TripEntry'

type Props = Omit<TripEntryProps, 'composerOnly' | 'formOnly' | 'onSubmit'> & {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: () => boolean
  returnFocusRef: RefObject<HTMLButtonElement | null>
  resetsFilters?: boolean
}

export default function TripEditor({ open, onOpenChange, onSubmit, returnFocusRef, resetsFilters, ...entryProps }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="trip-editor translate-x-0 translate-y-0" showCloseButton={false} onEscapeKeyDown={(event) => {
        const field = event.target instanceof HTMLElement ? event.target.closest('.trip-field') : null
        if (event.isComposing || field?.querySelector('[role="combobox"][aria-expanded="true"]')) event.preventDefault()
      }} onCloseAutoFocus={(event) => {
        event.preventDefault()
        if (!entryProps.pending) returnFocusRef.current?.focus()
      }}>
        <div className="toolbar trip-editor-heading">
          <DialogTitle>Edit trip</DialogTitle>
          <DialogClose asChild>
            <Button variant="outline" type="button">Close editor</Button>
          </DialogClose>
        </div>
        <DialogDescription>Update your trip, then choose Search awards. Earlier results stay in the conversation.</DialogDescription>
        {resetsFilters && <p>Searching from this form clears chat program and points limits. Use chat to keep or change those limits.</p>}
        <TripEntry {...entryProps} formOnly onSubmit={() => {
          if (onSubmit()) onOpenChange(false)
        }} />
      </DialogContent>
    </Dialog>
  )
}
