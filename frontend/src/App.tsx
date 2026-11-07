import { useLayoutEffect, useRef, useState } from 'react'
import AppNavigation from './components/AppNavigation'
import AwardHelp from './components/AwardHelp'
import TripEntry from './components/TripEntry'
import Conversation from './components/Conversation'
import CurrentTrip from './components/CurrentTrip'
import useChatJourney from './useChatJourney'

function App() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const {
    draft,
    setDraft,
    turns,
    fieldErrors,
    formAttempt,
    lastActionId,
    pending,
    submit,
    cancel,
    reset,
    retry,
  } = useChatJourney()
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
    reset()
    entryHeadingRef.current?.focus()
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
        </header>
        {hasConversation && (
          <>
            <CurrentTrip results={latestTurn.response?.results ?? []} />
            <Conversation
              turns={turns}
              lastActionId={lastActionId}
              pending={pending}
              onRetry={retry}
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
