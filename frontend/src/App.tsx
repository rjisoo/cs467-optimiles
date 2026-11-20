import { useLayoutEffect, useRef, useState } from 'react'
import AppNavigation from './components/AppNavigation'
import AwardHelp from './components/AwardHelp'
import TripEntry from './components/TripEntry'
import TripEditor from './components/TripEditor'
import Conversation from './components/Conversation'
import CurrentTrip from './components/CurrentTrip'
import useChatJourney from './useChatJourney'

function App() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
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
    confirm,
    retrySearch,
    airportCatalog,
    airportStatus,
    loadAirports,
    currentCriteria,
    prepareEdit,
  } = useChatJourney()
  const hasConversation = turns.length > 0
  const latestTurn = turns[turns.length - 1]
  const entryHeadingRef = useRef<HTMLHeadingElement>(null)
  const shellRef = useRef<HTMLDivElement>(null)
  const editButtonRef = useRef<HTMLButtonElement>(null)
  const entryProps = { draft, onDraftChange: setDraft, fieldErrors, formAttempt, pending,
    airportCatalog, airportStatus, onLoadAirports: loadAirports }

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
    setIsEditing(false)
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
            <CurrentTrip results={latestTurn.response?.results ?? []}
              criteria={currentCriteria} pending={pending} editButtonRef={editButtonRef}
              onEdit={() => {
                prepareEdit()
                void loadAirports()
                setIsMenuOpen(false)
                setIsEditing(true)
              }} />
            <TripEditor {...entryProps} open={isEditing} onOpenChange={setIsEditing}
              resetsFilters={!!(currentCriteria?.programs?.length || currentCriteria?.max_points)}
              returnFocusRef={editButtonRef} onSubmit={() => submit('form')} />
            <Conversation
              turns={turns}
              lastActionId={lastActionId}
              pending={pending}
              onRetry={retry}
              onConfirm={confirm}
              onRetrySearch={retrySearch}
            />
          </>
        )}
        <TripEntry
          {...entryProps}
          onSubmit={submit}
          onCancel={cancel}
          composerOnly={hasConversation}
        />
      </main>
    </div>
  )
}

export default App
