import { useLayoutEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import AvailabilityResults from './AvailabilityResults'
import MarkdownMessage from './MarkdownMessage'
import Icon from './Icon'
import type { SearchTurn } from '../useChatJourney'
import type { ChatResponse } from '../services/chat-response'
import { criteriaLabel } from '../services/chat-context'

type Props = {
  turns: SearchTurn[]
  lastActionId: number
  pending: boolean
  onRetry: (turn: SearchTurn) => void
  onConfirm?: (turn: SearchTurn) => void
  onRetrySearch?: (turn: SearchTurn, index: number) => void
}

const statusText = {
  pending: 'Searching award options…',
  success: null,
  canceled: 'Canceled. Stopped waiting; draft and earlier results retained.',
  failed: 'Request failed. This does not mean no awards exist. Draft and earlier results retained.',
}

function turnStatus(turn: SearchTurn): string | null {
  if (turn.status === 'failed' && turn.error) {
    return turn.error
  }
  if (turn.status === 'success' && turn.response && 'reply' in turn.response) {
    const status = turn.response.status
    if (status === 'clarification') return 'More trip details needed.'
    if (status === 'confirmation') return 'Confirm your trip before searching.'
    if (status === 'partial') return 'Search partly completed. Some options could not be checked.'
    if (status === 'empty') return 'No matching options in the searched data.'
  }
  return statusText[turn.status]
}

function ChatOutcome({ response, turnId, pending, onRetrySearch }: {
  response: ChatResponse; turnId: number; pending: boolean; onRetrySearch?: (index: number) => void
}) {
  if (!response.status && (response.results.length || response.partial || response.warnings?.length)) {
    return <AvailabilityResults searchId={turnId} response={response}
      message={<MarkdownMessage>{response.reply}</MarkdownMessage>} />
  }
  return <>
    <section className="conversation-message-bubble" aria-label="Assistant message">
      <MarkdownMessage>{response.reply}</MarkdownMessage>
      {response.status === 'failed' && <p>Request failed. This does not mean no awards exist.</p>}
      {response.status === 'partial' && <p>Search partly completed. Successful searches are retained below.</p>}
      {!!response.missing_fields?.length && <p>Details to resolve: {response.missing_fields.join(', ')}.</p>}
      {response.status === 'confirmation' && response.criteria && <p>{criteriaLabel(response.criteria)}</p>}
    </section>
    {response.warnings?.map((warning, index) => <p key={index} className="availability-list-note">{warning}</p>)}
    {response.searches?.map((search, index) => <section key={index} aria-label={`Search details ${index + 1}`}>
      <p className="availability-list-note">{criteriaLabel(search.criteria)}</p>
      {search.status === 'failed' ? <>
        <p>{search.message || 'This search failed. No availability conclusion can be drawn.'}</p>
        {response.status === 'partial' && search.failure?.retryable && onRetrySearch && (
          <Button disabled={pending} onClick={() => onRetrySearch(index)}>Retry this search</Button>
        )}
      </>
        : <AvailabilityResults searchId={`${turnId}-${index}`} response={search}
          message={search.message ? <p>{search.message}</p> : undefined} />}
    </section>)}
  </>
}

export default function Conversation({ turns, lastActionId, pending, onRetry, onConfirm, onRetrySearch }: Props) {
  const scroller = useRef<HTMLDivElement>(null)
  const following = useRef(true)
  const [hasNewResults, setHasNewResults] = useState(false)
  const lastAction = turns.find((turn) => turn.id === lastActionId) ?? turns[turns.length - 1]
  const lastStatus = lastAction ? turnStatus(lastAction) : null

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
          const chat = turn.response && 'reply' in turn.response ? turn.response : undefined
          const canRetry = (turn.status === 'failed' && chat?.failure?.retryable !== false) || turn.status === 'canceled'
          const message = turn.response && ('reply' in turn.response ? turn.response.reply : turn.response.message)
          const status = turnStatus(turn)

          return (
            <section key={turn.id} className="conversation-turn" aria-label={`Search ${turn.id}`}>
              <p className="conversation-request">{turn.request}</p>
              <div className="conversation-assistant">
                <span><Icon name="aircraft" /></span>
                <strong>OptiMiles</strong>
              </div>
              {chat ? <ChatOutcome response={chat} turnId={turn.id} pending={pending}
                onRetrySearch={onRetrySearch ? (index) => onRetrySearch(turn, index) : undefined} /> : turn.status === 'success' && turn.response ? (
                <AvailabilityResults
                  searchId={turn.id}
                  response={turn.response}
                  message={message ? (turn.source === 'chat'
                    ? <MarkdownMessage>{message}</MarkdownMessage> : <p>{message}</p>) : undefined}
                />
              ) : status ? (
                <div className="conversation-response">
                  <p>{status}</p>
                  {turn.status === 'pending' && <progress aria-label="Searching awards" />}
                </div>
              ) : null}
              {canRetry && <Button disabled={pending} onClick={() => onRetry(turn)}>
                {turn.status === 'failed' ? 'Retry' : 'Search again'}
              </Button>}
              {chat?.status === 'confirmation' && turn.id === turns.at(-1)?.id && onConfirm && (
                <Button disabled={pending} onClick={() => onConfirm(turn)}>Confirm and search</Button>
              )}
            </section>
          )
        })}
      </div>
      {(lastStatus || hasNewResults) && <div className="conversation-feedback toolbar">
        {lastStatus && <p role="status">{lastStatus}</p>}
        {hasNewResults && <Button onClick={showNewResults}>New results</Button>}
      </div>}
    </>
  )
}
