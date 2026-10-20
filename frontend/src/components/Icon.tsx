import {
  ArrowUp,
  CircleHelp,
  History,
  MessageSquare,
  Navigation,
  Plus,
  Search,
  SlidersHorizontal,
} from 'lucide-react'

const icons = {
  arrowUp: ArrowUp,
  plane: Navigation,
  plus: Plus,
  chat: MessageSquare,
  clock: History,
  search: Search,
  info: CircleHelp,
  settings: SlidersHorizontal,
}

function Icon({ name }: { name: keyof typeof icons }) {
  const LucideIcon = icons[name]
  return <LucideIcon className="icon" size={18} strokeWidth={1.7} aria-hidden="true" focusable="false" />
}

export default Icon
