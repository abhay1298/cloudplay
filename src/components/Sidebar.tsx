"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./Logo";
import { NAV_ITEMS } from "./nav-items";

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-line bg-elev px-4 py-6 pt-[max(1.5rem,env(safe-area-inset-top))] lg:flex">
      <div className="px-2">
        <Logo />
      </div>
      <nav className="mt-8 flex flex-col gap-1" aria-label="Main">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                active ? "bg-accent/15 text-fg" : "text-muted hover:bg-surface-2 hover:text-fg"
              }`}
            >
              <Icon className={`size-[18px] ${active ? "text-accent" : ""}`} aria-hidden />
              {label}
            </Link>
          );
        })}
      </nav>
      <p className="mt-auto px-3 text-xs leading-relaxed text-muted">
        CloudPlay never bypasses provider logins, passwords or DRM. Unsupported features are labeled as such.
      </p>
    </aside>
  );
}
