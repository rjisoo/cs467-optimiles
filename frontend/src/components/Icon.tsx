import {
  ArrowUp,
  CircleHelp,
  Coins,
  History,
  Menu,
  MessageSquare,
  Navigation,
  Plane,
  Plus,
  Search,
  SlidersHorizontal,
  Timer,
  Trophy,
  Waves,
} from 'lucide-react'

const icons = {
  arrowUp: ArrowUp,
  plane: Navigation,
  aircraft: Plane,
  plus: Plus,
  chat: MessageSquare,
  clock: History,
  menu: Menu,
  search: Search,
  info: CircleHelp,
  settings: SlidersHorizontal,
  coins: Coins,
  timer: Timer,
  trophy: Trophy,
  waves: Waves,
}

function Icon({ name }: { name: keyof typeof icons }) {
  const LucideIcon = icons[name]
  return <LucideIcon className="icon" size={18} strokeWidth={1.7} aria-hidden="true" focusable="false" />
}

export default Icon
