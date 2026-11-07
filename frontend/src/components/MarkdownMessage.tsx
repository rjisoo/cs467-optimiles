import Markdown from 'react-markdown'

export default function MarkdownMessage({ children }: { children: string }) {
  return (
    <div className="message-markdown">
      <Markdown skipHtml components={{ img: ({ alt }) => <span>{alt}</span> }}>
        {children}
      </Markdown>
    </div>
  )
}
