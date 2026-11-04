import { Home, PlayCircle, ArrowRightLeft, Library, History, Settings } from "lucide-react";

export const NAV_ITEMS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/player", label: "Universal Player", short: "Player", icon: PlayCircle },
  { href: "/convert", label: "Convert", icon: ArrowRightLeft },
  { href: "/library", label: "My Library", short: "Library", icon: Library },
  { href: "/history", label: "History", icon: History },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;
