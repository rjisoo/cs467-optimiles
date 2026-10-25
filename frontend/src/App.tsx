import { useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import AppNavigation from './components/AppNavigation'
import AwardHelp from './components/AwardHelp'
import TripEntry, { type TripDraft } from './components/TripEntry'
import './App.css'

function createEmptyTripDraft(): TripDraft {
  return {
    message: '',
    origin: '',
    destination: '',
    departureDate: '',
    adults: '1',
    cabins: [],
  }
}

function App() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [draft, setDraft] = useState(createEmptyTripDraft)
  const entryHeadingRef = useRef<HTMLHeadingElement>(null)

  function startNewTrip() {
    setIsMenuOpen(false)
    setDraft(createEmptyTripDraft())
    entryHeadingRef.current?.focus()
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#trip-entry">Skip to trip</a>
      <AppNavigation
        isMenuOpen={isMenuOpen}
        onMenuOpenChange={setIsMenuOpen}
        onNewTrip={startNewTrip}
      />
      <main className="workspace">
        <header className="entry-intro">
          <div>
            <p className="entry-eyebrow">YOUR NEXT JOURNEY</p>
            <h1 id="trip-entry" ref={entryHeadingRef} tabIndex={-1}>Find your next award trip</h1>
          </div>
          <AwardHelp onOpen={() => setIsMenuOpen(false)} />
          <p id="preview-notice">
            <Badge className="preview-badge" variant="secondary">Static preview</Badge>
            Search and prompt interpretation are not connected yet.
          </p>
        </header>
        <TripEntry draft={draft} onDraftChange={setDraft} />
      </main>
    </div>
  )
}

export default App
