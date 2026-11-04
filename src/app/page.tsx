import Link from "next/link";
import { ArrowRightLeft, Clock, ExternalLink, PlayCircle, ShieldCheck } from "lucide-react";
import { LinkInput } from "@/components/LinkInput";
import { CapabilityGrid } from "@/components/CapabilityGrid";
import { VideoCard } from "@/components/VideoCard";
import { HistoryList } from "@/components/HistoryList";
import { EmptyState } from "@/components/ui";
import { listConversions, listRecentlyWatched } from "@/lib/database";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const watched = listRecentlyWatched(4);
  const conversions = listConversions(3);
  return (
    <div className="space-y-12">
      <section className="hero-glow -mx-4 rounded-none px-4 py-10 sm:mx-0 sm:rounded-3xl sm:px-10 sm:py-14">
        <p className="text-sm font-semibold tracking-[0.25em] text-accent">CLOUDPLAY</p>
        <h1 className="mt-3 max-w-2xl text-3xl font-extrabold tracking-tight sm:text-5xl">
          <span className="brand-text">Your Cloud Videos.</span> One Place.
        </h1>
        <p className="mt-4 max-w-2xl text-muted">
          Paste a Diskwala, TeraBox or direct video link. CloudPlay plays what can legitimately be played, organizes your links, and
          tells you plainly when a provider doesn&apos;t allow something.
        </p>
        <div className="mt-8 max-w-3xl">
          <LinkInput />
        </div>
      </section>

      <section aria-labelledby="quick-access">
        <h2 id="quick-access" className="mb-4 text-lg font-semibold">
          Quick access
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <a href="https://www.diskwala.com/" target="_blank" rel="noopener noreferrer" className="card flex items-center gap-3 p-4 hover:border-orange-500/40">
            <span className="grid size-10 place-items-center rounded-xl bg-orange-500/15 font-bold text-orange-400">D</span>
            <span className="flex-1">
              <span className="block font-semibold">Diskwala</span>
              <span className="text-xs text-muted">Official site</span>
            </span>
            <ExternalLink className="size-4 text-muted" />
          </a>
          <a href="https://www.terabox.com/" target="_blank" rel="noopener noreferrer" className="card flex items-center gap-3 p-4 hover:border-sky-500/40">
            <span className="grid size-10 place-items-center rounded-xl bg-sky-500/15 font-bold text-sky-400">T</span>
            <span className="flex-1">
              <span className="block font-semibold">TeraBox</span>
              <span className="text-xs text-muted">Official site</span>
            </span>
            <ExternalLink className="size-4 text-muted" />
          </a>
          <Link href="/player" className="card flex items-center gap-3 p-4 hover:border-accent/40">
            <PlayCircle className="size-10 text-accent" />
            <span>
              <span className="block font-semibold">Universal Player</span>
              <span className="text-xs text-muted">Links or local files</span>
            </span>
          </Link>
          <Link href="/convert" className="card flex items-center gap-3 p-4 hover:border-accent/40">
            <ArrowRightLeft className="size-10 text-accent-2" />
            <span>
              <span className="block font-semibold">Convert</span>
              <span className="text-xs text-muted">Diskwala → TeraBox</span>
            </span>
          </Link>
        </div>
      </section>

      <section aria-labelledby="recent-watched">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="recent-watched" className="text-lg font-semibold">
            Recently watched
          </h2>
          <Link href="/library" className="text-sm text-accent hover:underline">
            My Library
          </Link>
        </div>
        {watched.length ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {watched.map((w) => (
              <VideoCard key={w.url} v={{ ...w, when: w.updatedAt }} />
            ))}
          </div>
        ) : (
          <EmptyState icon={<Clock className="size-8" />} title="Nothing watched yet">
            Videos you play appear here so you can resume them.
          </EmptyState>
        )}
      </section>

      <section aria-labelledby="recent-conv">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="recent-conv" className="text-lg font-semibold">
            Recently converted files
          </h2>
          <Link href="/history" className="text-sm text-accent hover:underline">
            View history
          </Link>
        </div>
        {conversions.length ? (
          <HistoryList items={conversions} />
        ) : (
          <EmptyState icon={<ArrowRightLeft className="size-8" />} title="No transfers yet" />
        )}
      </section>

      <section aria-labelledby="availability">
        <h2 id="availability" className="mb-1 flex items-center gap-2 text-lg font-semibold">
          <ShieldCheck className="size-5 text-success" /> Feature availability
        </h2>
        <p className="mb-4 text-sm text-muted">
          Based on official documentation we could verify. Hover an item for details. See TECHNICAL_FEASIBILITY.md.
        </p>
        <CapabilityGrid />
      </section>
    </div>
  );
}
