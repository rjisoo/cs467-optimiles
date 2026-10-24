import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import Icon from './Icon'

type AppNavigationProps = {
  isMenuOpen: boolean
  onMenuOpenChange: (open: boolean) => void
  onNewTrip: () => void
}

const mobileQuery = '(max-width: 56.25rem)'

function AppNavigation({ isMenuOpen, onMenuOpenChange, onNewTrip }: AppNavigationProps) {
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const navigationRef = useRef<HTMLElement>(null)
  const newTripButtonRef = useRef<HTMLButtonElement>(null)

  const subscribeToViewport = useCallback((notify: () => void) => {
    // Keep this breakpoint aligned with the shell's CSS media query.
    const mobileViewport = window.matchMedia(mobileQuery)
    let focusFrame = 0

    function handleViewportChange(event: MediaQueryListEvent) {
      const focusInNavigation = navigationRef.current?.contains(document.activeElement)
      const focusOnMenu = document.activeElement === menuButtonRef.current
      onMenuOpenChange(false)
      notify()
      cancelAnimationFrame(focusFrame)
      if (event.matches && focusInNavigation) {
        menuButtonRef.current?.focus()
      } else if (!event.matches && focusOnMenu) {
        // The desktop navigation must mount before its button can receive focus.
        focusFrame = requestAnimationFrame(() => newTripButtonRef.current?.focus())
      }
    }

    mobileViewport.addEventListener('change', handleViewportChange)
    return () => {
      mobileViewport.removeEventListener('change', handleViewportChange)
      cancelAnimationFrame(focusFrame)
    }
  }, [onMenuOpenChange])

  const isDesktop = useSyncExternalStore(subscribeToViewport, () => !window.matchMedia(mobileQuery).matches)

  useEffect(() => {
    if (!isMenuOpen) return
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        onMenuOpenChange(false)
        menuButtonRef.current?.focus()
      }
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [isMenuOpen, onMenuOpenChange])

  return (
    <Collapsible className="app-navigation" open={isDesktop || isMenuOpen} onOpenChange={onMenuOpenChange}>
      <header className="brand-bar">
        <span className="brand"><span className="brand-mark"><Icon name="plane" /></span>OptiMiles</span>
        <CollapsibleTrigger asChild>
          <Button className="menu-toggle" variant="ghost" type="button" ref={menuButtonRef} aria-label={isMenuOpen ? 'Close menu' : 'Menu'}>
            <Icon name="menu" />
          </Button>
        </CollapsibleTrigger>
      </header>
      <CollapsibleContent asChild>
        <aside className="sidebar" ref={navigationRef} data-open={isMenuOpen}>
          <nav aria-label="Main navigation">
            <Button className="new-trip" variant="outline" type="button" ref={newTripButtonRef}
              onClick={onNewTrip}>
              <Icon name="plus" /> New trip
            </Button>
            <Button className="nav-item" variant="ghost" type="button" disabled>
              <Icon name="clock" /><span>Recent chats <small>Not available yet</small></span>
            </Button>
            <Button className="nav-item" variant="ghost" type="button" disabled>
              <Icon name="settings" /><span>Settings <small>Not available yet</small></span>
            </Button>
          </nav>
          <p className="sidebar-note">Award travel,<br />made clearer.<span>Explore the OptiMiles preview.</span></p>
        </aside>
      </CollapsibleContent>
    </Collapsible>
  )
}

export default AppNavigation
