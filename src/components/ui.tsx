import type { ReactNode } from "react";
import type { ProviderId, CapabilityStatus } from "@/types/provider";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

const PROVIDER_STYLE: Record<ProviderId, { label: string; cls: string }> = {
  diskwala: { label: "Diskwala", cls: "bg-orange-500/15 text-orange-400 ring-orange-500/30" },
  terabox: { label: "TeraBox", cls: "bg-sky-500/15 text-sky-400 ring-sky-500/30" },
  direct: { label: "Direct file", cls: "bg-emerald-500/15 text-emerald-400 ring-emerald-500/30" },
};

export function ProviderBadge({ provider }: { provider: ProviderId }) {
  const s = PROVIDER_STYLE[provider];
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${s.cls}`}>{s.label}</span>;
}

const STATUS_STYLE: Record<CapabilityStatus, { label: string; cls: string }> = {
  supported: { label: "Available", cls: "bg-success/15 text-success" },
  unsupported: { label: "Unavailable", cls: "bg-danger/15 text-danger" },
  "requires-credentials": { label: "Needs API credentials", cls: "bg-warning/15 text-warning" },
  unverified: { label: "Not integrated", cls: "bg-warning/15 text-warning" },
};

export function StatusPill({ status }: { status: CapabilityStatus }) {
  const s = STATUS_STYLE[status];
  return <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${s.cls}`}>{s.label}</span>;
}

export function Button({
  variant = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" }) {
  const v = {
    primary: "brand-gradient text-white shadow-lg shadow-violet-900/25 hover:brightness-110",
    secondary: "bg-surface-2 text-fg ring-1 ring-line hover:bg-line/60",
    ghost: "text-muted hover:bg-surface-2 hover:text-fg",
    danger: "bg-danger/15 text-danger hover:bg-danger/25",
  }[variant];
  return (
    <button
      {...props}
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${v} ${className}`}
    />
  );
}

export const linkButton = {
  primary:
    "brand-gradient inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-white shadow-lg shadow-violet-900/25 transition hover:brightness-110",
  secondary:
    "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-surface-2 px-4 text-sm font-semibold text-fg ring-1 ring-line transition hover:bg-line/60",
};

export function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-2 px-6 py-10 text-center">
      <div className="text-muted">{icon}</div>
      <p className="font-semibold">{title}</p>
      {children && <div className="max-w-md text-sm text-muted">{children}</div>}
    </div>
  );
}
