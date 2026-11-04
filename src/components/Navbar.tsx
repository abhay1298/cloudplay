"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./Logo";
import { NAV_ITEMS } from "./nav-items";
import { isActive } from "./Sidebar";

/** Top bar + bottom tab bar for small screens. */
export function Navbar() {
  const pathname = usePathname();
  return (
    <>
      <header className="sticky top-0 z-30 flex min-h-14 items-center border-b border-line bg-bg/85 pt-[env(safe-area-inset-top)] pr-[max(1rem,env(safe-area-inset-right))] pl-[max(1rem,env(safe-area-inset-left))] backdrop-blur lg:hidden">
        <Logo />
      </header>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 border-t border-line bg-elev/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[10px] font-medium ${active ? "text-accent" : "text-muted"}`}
            >
              <Icon className="size-5" aria-hidden />
              {"short" in item ? item.short : item.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
