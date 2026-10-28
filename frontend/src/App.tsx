import { useLayoutEffect, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import AppNavigation from './components/AppNavigation'
import AwardHelp from './components/AwardHelp'
import TripEntry from './components/TripEntry'
import Conversation from './components/Conversation'
import CurrentTrip from './components/CurrentTrip'
import useMockJourney from './useMockJourney'

type ComparisonSelection = {
  turnId: number
  cabins: string[]
}

function App() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [comparison, setComparison] = useState<ComparisonSelection | null>(null)
  // Existing review links open the same result view as a completed mock search.
  const preview = new URLSearchParams(window.location.search).get('preview')
  const {
    draft,
    setDraft,
    turns,
    notice,
    fieldErrors,
    formAttempt,
    lastActionId,
    pending,
    submit,
    cancel,
    reset,
    retry,
  } = useMockJourney(preview === 'availability' || preview === 'awards')
  const hasConversation = turns.length > 0
  const latestTurn = turns[turns.length - 1]
  const entryHeadingRef = useRef<HTMLHeadingElement>(null)
  const shellRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const viewport = window.visualViewport
    const shell = shellRef.current
    if (!hasConversation || !viewport || !shell) {
      return
    }
    const resize = () => {
      shell.style.setProperty('--workspace-height', `${viewport.height}px`)
    }
    resize()
    viewport.addEventListener('resize', resize)
    return () => {
      viewport.removeEventListener('resize', resize)
      shell.style.removeProperty('--workspace-height')
    }
  }, [hasConversation])

  function startNewTrip() {
    setIsMenuOpen(false)
    setComparison(null)
    const url = new URL(window.location.href)
    url.searchParams.delete('preview')
    window.history.replaceState(null, '', url)
    reset()
    entryHeadingRef.current?.focus()
  }

  function changeComparison(turnId: number, cabins: string[]) {
    if (turnId === latestTurn.id) {
      setComparison({ turnId, cabins })
    }
  }

  return (
    <div ref={shellRef} className={`app-shell${hasConversation ? ' app-shell--conversation' : ''}`}>
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
            <h1 id="trip-entry" ref={entryHeadingRef} tabIndex={-1}>
              {hasConversation ? 'Your award trip' : 'Find your next award trip'}
            </h1>
          </div>
          <AwardHelp onOpen={() => setIsMenuOpen(false)} />
          <p id="preview-notice">
            <Badge className="preview-badge" variant="secondary">Local mock</Badge>
            {hasConversation ? (
              'Normalized mock availability · Expand a row to load trips · No live search.'
            ) : (
              <>
                Try any chat message for JFK → SEA, Oct 31–Nov 6, 2026, or use the form for one date in that range.
                {' '}No live search or text interpretation. Append “Fail once.” to try failure and Retry.
              </>
            )}
          </p>
        </header>
        {notice && <p role="status">{notice}</p>}
        {hasConversation && (
          <>
            <CurrentTrip
              criteria={latestTurn.criteria}
              resolvedCriteria={latestTurn.results?.criteria}
              comparisonCabins={comparison?.turnId === latestTurn.id ? comparison.cabins : undefined}
            />
            <Conversation
              turns={turns}
              lastActionId={lastActionId}
              pending={pending}
              onRetry={retry}
              onComparisonChange={changeComparison}
            />
          </>
        )}
        <TripEntry
          draft={draft}
          onDraftChange={setDraft}
          onSubmit={submit}
          fieldErrors={fieldErrors}
          formAttempt={formAttempt}
          pending={pending}
          onCancel={cancel}
          composerOnly={hasConversation}
        />
      </main>
    </div>
  )
}

export default App
