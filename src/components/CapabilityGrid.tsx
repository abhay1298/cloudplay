import { CAPABILITIES } from "@/services/providers/registry";
import type { Capability } from "@/types/provider";
import { StatusPill } from "./ui";

const ROWS: Array<[string, (c: (typeof CAPABILITIES)["direct"]) => Capability]> = [
  ["In-app playback", (c) => c.inAppPlayback],
  ["Official API", (c) => c.officialApi],
  ["Automatic download", (c) => c.download],
  ["Automatic upload", (c) => c.upload],
  ["Share-link creation", (c) => c.shareLinkCreation],
  ["Open in provider", (c) => c.externalOpen],
];

export function CapabilityGrid({ providers = ["diskwala", "terabox", "direct"] as const }: { providers?: ReadonlyArray<keyof typeof CAPABILITIES> }) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {providers.map((id) => {
        const c = CAPABILITIES[id];
        return (
          <div key={id} className="card p-4">
            <h3 className="font-semibold">{c.displayName}</h3>
            <ul className="mt-3 space-y-2">
              {ROWS.filter(([, get]) => !(id === "direct" && (get(c) === c.upload || get(c) === c.shareLinkCreation))).map(([label, get]) => {
                const cap = get(c);
                return (
                  <li key={label} className="flex items-start justify-between gap-3 text-sm" title={cap.reason}>
                    <span className="text-muted">{label}</span>
                    <StatusPill status={cap.status} />
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
