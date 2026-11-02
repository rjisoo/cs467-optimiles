import {
  ArrowRight,
  ArrowUp,
  CircleHelp,
  ChevronDown,
  Coins,
  History,
  Menu,
  MessageSquare,
  Navigation,
  Pencil,
  Plane,
  Plus,
  Search,
  SlidersHorizontal,
  Timer,
  Trophy,
  Waves,
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
  coins: Coins,
  timer: Timer,
  trophy: Trophy,
  waves: Waves,
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
