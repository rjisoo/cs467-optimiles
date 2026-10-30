import {
  ArrowRight,
  ArrowUp,
  CircleHelp,
  ChevronDown,
  History,
  Menu,
  MessageSquare,
  Navigation,
  Pencil,
  Plane,
  Plus,
  Search,
  SlidersHorizontal,
} from 'lucide-react'

const icons = {
  arrowRight: ArrowRight,
  arrowUp: ArrowUp,
  pencil: Pencil,
  plane: Navigation,
  aircraft: Plane,
  plus: Plus,
  chat: MessageSquare,
  clock: History,
  menu: Menu,
  search: Search,
  info: CircleHelp,
  settings: SlidersHorizontal,
  chevronDown: ChevronDown,
}

function Icon({ name }: { name: keyof typeof icons }) {
  const LucideIcon = icons[name]
  return (
    <LucideIcon
      className="icon"
      size={18}
      strokeWidth={1.7}
      aria-hidden="true"
      focusable="false"
    />
  )
}

export default Icon
