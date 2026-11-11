import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import MarkdownMessage from './MarkdownMessage'

describe('reply Markdown', () => {
  it('renders structured text, formatting and safe links as semantic elements', () => {
    const { container } = render(<MarkdownMessage>{[
      '### Award options',
      '**Bold** and *emphasis* with `inline code`.',
      '1. First option\n2. [Program details](https://example.com/awards)',
      '> Check the dates.',
      '```text\nJFK -> SEA\n```',
    ].join('\n\n')}</MarkdownMessage>)
    expect(screen.getByRole('heading', { name: 'Award options', level: 3 })).toBeVisible()
    expect(screen.getByText('Bold', { selector: 'strong' })).toBeVisible()
    expect(screen.getByText('emphasis', { selector: 'em' })).toBeVisible()
    expect(screen.getByText('inline code', { selector: 'code' })).toBeVisible()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByRole('link', { name: 'Program details' })).toHaveAttribute('href', 'https://example.com/awards')
    expect(container.querySelector('blockquote')).toHaveTextContent('Check the dates.')
    expect(container.querySelector('pre code')).toHaveTextContent('JFK -> SEA')
  })

  it('does not execute HTML, expose unsafe link URLs or load remote images', () => {
    const { container } = render(<MarkdownMessage>{[
      '<script>alert(1)</script>',
      '<iframe src="https://example.com/embed"></iframe>',
      '[Unsafe link](javascript:alert%281%29)',
      '![Image description](https://example.com/tracking.png)',
    ].join('\n\n')}</MarkdownMessage>)
    expect(container.querySelector('script, iframe, img')).toBeNull()
    expect(screen.getByText('Unsafe link')).not.toHaveAttribute('href', 'javascript:alert%281%29')
    expect(screen.getByText('Image description')).toBeVisible()
    expect(fetch).not.toHaveBeenCalled()
  })
})
