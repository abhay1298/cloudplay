import Link from "next/link";
import { Play } from "lucide-react";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5" aria-label="CloudPlay home">
      <span className="brand-gradient grid size-9 place-items-center rounded-xl shadow-lg shadow-violet-900/30">
        <Play className="size-4 fill-white text-white" aria-hidden />
      </span>
      {!compact && (
        <span className="leading-tight">
          <span className="block text-[15px] font-extrabold tracking-[0.18em]">CLOUDPLAY</span>
          <span className="block text-[11px] text-muted">Your Cloud Videos. One Place.</span>
        </span>
      )}
    </Link>
  );
}
