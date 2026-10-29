function failureMessage(status: number | null): string {
  if (status === null) {
    return 'Could not reach the chat service. Check your connection and try again.'
  }
  if (status === 400) {
    return 'The chat service rejected this message. Check your text and try again.'
  }
  if (status === 429) {
    return 'Too many requests. Wait a moment before trying again.'
  }
  if (status >= 500) {
    return 'The chat service is unavailable. Try again later.'
  }
  return `The chat request failed (HTTP ${status}). Please try again.`
}

export class ChatRequestError extends Error {
  readonly status: number | null

  constructor(status: number | null) {
    super(failureMessage(status))
    this.name = 'ChatRequestError'
    this.status = status
  }
}

export async function sendChatMessage(message: string, signal: AbortSignal): Promise<void> {
  let response: Response
  try {
    response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
      signal,
    })
  } catch (error) {
    if (signal.aborted) {
      throw error
    }
    throw new ChatRequestError(null)
  }

  if (!response.ok) {
    throw new ChatRequestError(response.status)
  }
}
