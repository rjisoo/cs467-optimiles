import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import Icon from './Icon'

type AwardHelpProps = {
  onOpen: () => void
}

function AwardHelp({ onOpen }: AwardHelpProps) {
  return (
    <Dialog onOpenChange={(open) => {
      if (open) onOpen()
    }}>
      <DialogTrigger asChild>
        <Button className="help-toggle" variant="outline" type="button">
          <Icon name="info" />Award help
        </Button>
      </DialogTrigger>
      <DialogContent className="award-help" showCloseButton={false}>
        <div className="help-header toolbar">
          <span className="section-icon"><Icon name="info" /></span>
          <DialogClose asChild>
            <Button className="help-close" variant="outline" type="button">Close help</Button>
          </DialogClose>
        </div>
        <DialogTitle>What is an award flight?</DialogTitle>
        <DialogDescription>
          <strong>Award flights</strong> are booked with airline points or miles. Taxes and fees may still apply.
          A <strong>booking program</strong> is the loyalty program whose points you use to book the flight.
        </DialogDescription>
        <p>
          Describe your trip in the chat box, or enter your route, date, adults, and cabin choices
          in the form. These inputs are not linked in this preview.
        </p>
        <p>Your draft resets when you reload this page or choose New trip.</p>
      </DialogContent>
    </Dialog>
  )
}

export default AwardHelp
