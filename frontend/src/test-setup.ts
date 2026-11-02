import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'

beforeEach(() => {
  // Keep preview tests offline; request tests replace this chat-only stub.
  vi.stubGlobal('fetch', vi.fn((url: string) => url === '/api/chat'
    ? Promise.resolve(new Response(null, { status: 204 }))
    : Promise.reject(new Error(`Unexpected request: ${url}`))))

  // JSDOM does not evaluate media queries. Tests default to desktop navigation.
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })))

  // Radix measures checkbox controls with ResizeObserver; JSDOM has no layout.
  vi.stubGlobal('ResizeObserver', class {
    observe = vi.fn()
    unobserve = vi.fn()
    disconnect = vi.fn()
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
