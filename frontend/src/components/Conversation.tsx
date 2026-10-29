import { useLayoutEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import AvailabilityResults from './AvailabilityResults'
import Icon from './Icon'
import { cabinOptions } from '../services/availability-prototype'
import { mockComparisons } from '../services/mock-comparisons'
import type { SearchTurn } from '../useMockJourney'

type Props = {
  turns: SearchTurn[]
  lastActionId: number
  pending: boolean
  onRetry: (turn: SearchTurn) => void
  onComparisonChange: (turnId: number, cabins: string[]) => void
}

const statusText = {
  pending: 'Searching award options… Displayed results use local samples.',
  success: 'Sample availability summaries loaded. Backend replies are not displayed.',
  canceled: 'Canceled. Stopped waiting; draft and earlier results retained.',
  failed: 'Request failed. This does not mean no awards exist. Draft and earlier results retained.',
}

function turnStatus(turn: SearchTurn): string {
  if (turn.status === 'failed' && turn.error) {
    return turn.error
  }
  if (turn.source === 'chat' && turn.status === 'success') {
    return 'Message submitted. Backend replies are not displayed; results shown here are samples.'
  }
  return statusText[turn.status]
}

export default function Conversation({ turns, lastActionId, pending, onRetry, onComparisonChange }: Props) {
  const scroller = useRef<HTMLDivElement>(null)
  const following = useRef(true)
  const [hasNewResults, setHasNewResults] = useState(false)
  const lastAction = turns.find((turn) => turn.id === lastActionId) ?? turns[turns.length - 1]

  useLayoutEffect(() => {
    const element = scroller.current
    if (!element) {
      return
    }
    if (following.current) {
      element.scrollTop = element.scrollHeight
    } else {
      setHasNewResults(true)
    }
  }, [turns])

  useLayoutEffect(() => {
    const element = scroller.current
    if (!element) {
      return
    }
    let previousHeight = element.clientHeight
    const observer = new ResizeObserver(() => {
      const wasNearBottom = element.scrollHeight - previousHeight - element.scrollTop <= 80
      previousHeight = element.clientHeight
      if (following.current || wasNearBottom) {
        element.scrollTop = element.scrollHeight
      }
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  function showNewResults() {
    following.current = true
    if (scroller.current) {
      scroller.current.scrollTop = scroller.current.scrollHeight
      scroller.current.focus()
    }
    setHasNewResults(false)
  }

  return (
    <>
      <div
        ref={scroller}
        className="conversation"
        role="region"
        aria-label="Current conversation"
        tabIndex={0}
        onScroll={(event) => {
          const element = event.currentTarget
          following.current = element.scrollHeight - element.clientHeight - element.scrollTop <= 80
          if (following.current) {
            setHasNewResults(false)
          }
        }}
      >
        {turns.map((turn) => {
          const initialCabins = cabinOptions
            .filter((cabin) => turn.criteria.cabins.includes(cabin.label))
            .map((cabin) => cabin.key)
          const canRetry = turn.status === 'failed' || turn.status === 'canceled'

          return (
            <section key={turn.id} className="conversation-turn" aria-label={`Search ${turn.id}`}>
              <p className="conversation-request">{turn.request}</p>
              <div className="conversation-assistant">
                <span><Icon name="aircraft" /></span>
                <strong>OptiMiles</strong>
              </div>
              {turn.status === 'success' && turn.results ? (
                <AvailabilityResults
                  searchId={turn.id}
                  response={turn.results}
                  mockComparisons={mockComparisons}
                  initialCabins={initialCabins}
                  onComparisonCabinsChange={(cabins) => {
                    const labels = cabinOptions
                      .filter((cabin) => cabins.includes(cabin.key))
                      .map((cabin) => cabin.label)
                    onComparisonChange(turn.id, labels)
                  }}
                />
              ) : (
                <div className="conversation-response">
                  <p>{turnStatus(turn)}</p>
                  {turn.status === 'pending' && <progress aria-label="Searching mock awards" />}
                  {canRetry && (
                    <Button disabled={pending} onClick={() => onRetry(turn)}>
                      {turn.status === 'failed' ? 'Retry' : 'Search again'}
                    </Button>
                  )}
                </div>
              )}
            </section>
          )
        })}
      </div>
      <div className="conversation-feedback toolbar">
        <p role="status">{turnStatus(lastAction)}</p>
        {hasNewResults && <Button onClick={showNewResults}>New results</Button>}
      </div>
    </>
  )
}
