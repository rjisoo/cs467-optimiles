import { useEffect, useRef, useState } from 'react'
import './App.css'

function App() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const navigationRef = useRef<HTMLElement>(null)
  const newTripButtonRef = useRef<HTMLButtonElement>(null)
  const entryHeadingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    // Keep this breakpoint aligned with the shell's CSS media query.
    const mobileViewport = window.matchMedia('(max-width: 48rem)')

    function handleViewportChange(event: MediaQueryListEvent) {
      setIsMenuOpen(false)
      if (event.matches && navigationRef.current?.contains(document.activeElement)) {
        menuButtonRef.current?.focus()
      } else if (!event.matches && document.activeElement === menuButtonRef.current) {
        newTripButtonRef.current?.focus()
      }
    }

    mobileViewport.addEventListener('change', handleViewportChange)
    return () => mobileViewport.removeEventListener('change', handleViewportChange)
  }, [])

  function startNewTrip() {
    setIsMenuOpen(false)
    entryHeadingRef.current?.focus()
  }

  return (
    <div
      className="app-shell"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && isMenuOpen) {
          setIsMenuOpen(false)
          menuButtonRef.current?.focus()
        }
      }}
    >
      <a className="skip-link" href="#trip-entry">Skip to trip</a>
      <header className="brand-bar">
        <span className="brand">OptiMiles</span>
        <button
          className="menu-toggle"
          type="button"
          ref={menuButtonRef}
          aria-expanded={isMenuOpen}
          aria-controls="app-navigation"
          onClick={() => setIsMenuOpen(!isMenuOpen)}
        >
          {isMenuOpen ? 'Close menu' : 'Menu'}
        </button>
      </header>
      <aside
        className="sidebar"
        id="app-navigation"
        ref={navigationRef}
        data-open={isMenuOpen}
      >
        <nav aria-label="Main navigation">
          <button className="new-trip" type="button" ref={newTripButtonRef} onClick={startNewTrip}>
            New trip
          </button>
          <button className="nav-item" type="button" disabled>
            Recent chats <span>Not available yet</span>
          </button>
          <button className="nav-item" type="button" disabled>
            Settings <span>Not available yet</span>
          </button>
          <button className="nav-item" type="button" disabled>
            Help <span>Not available yet</span>
          </button>
        </nav>
      </aside>
      <main className="workspace">
        <section className="entry-panel" aria-labelledby="trip-entry">
          <p className="eyebrow">New trip</p>
          <h1 id="trip-entry" ref={entryHeadingRef} tabIndex={-1}>OptiMiles</h1>
          <p>Placeholder. Search is not available yet.</p>
        </section>
      </main>
    </div>
  )
}

export default App
