import type { ReactNode } from "react";
import type { HealthStatus } from "@/lib/types";

export function Page({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <main className="relative z-[1] mx-auto max-w-2xl px-4 py-6 pb-24">
      <h1 className="font-display text-xl font-bold tracking-tight text-bone">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-ash">{subtitle}</p>}
      <div className="mt-5">{children}</div>
    </main>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  const bg = /\bbg-/.test(className) ? "" : "bg-surface";
  const border = /\bborder-\w/.test(className) ? "" : "border-elevated";
  return (
    <div
      className={`rounded-card border p-4 transition-[border-color,transform] duration-200 hover:border-cyan/40 ${bg} ${border} ${className}`}
    >
      {children}
    </div>
  );
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-ash">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

// Reserved for status meaning only — never used decoratively elsewhere.
const badgeColors: Record<string, string> = {
  pending: "bg-status-amber/15 text-status-amber",
  bought: "bg-status-green/15 text-status-green",
  passed: "bg-status-gray/15 text-ash",
  acquired: "bg-cyan/15 text-cyan",
  at_shop: "bg-violet/15 text-violet",
  listed: "bg-violet/15 text-violet",
  sold: "bg-status-green/15 text-status-green",
  shipped: "bg-cyan/15 text-cyan",
  returned: "bg-status-red/15 text-status-red",
  confirmed: "bg-status-green/15 text-status-green",
  single_source: "bg-status-amber/15 text-status-amber",
  not_started: "bg-status-gray/15 text-ash",
  packed: "bg-violet/15 text-violet",
  in_transit: "bg-cyan/15 text-cyan",
  delivered_signed: "bg-status-green/15 text-status-green",
  exception: "bg-status-red/15 text-status-red",
  shop: "bg-status-gray/15 text-ash",
  home: "bg-status-gray/15 text-ash",
  storage: "bg-status-gray/15 text-ash",
  transit: "bg-cyan/15 text-cyan",
};

export function Badge({ value }: { value?: string | null }) {
  if (!value) return <span className="text-muted">—</span>;
  const cls = badgeColors[value] ?? "bg-status-gray/15 text-ash";
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{value.replace("_", " ")}</span>;
}

export function Button({
  children,
  variant = "primary",
  ...props
}: { children: ReactNode; variant?: "primary" | "danger" | "ghost" | "gold" } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const variants = {
    primary: "bg-cyan text-obsidian hover:bg-cyan/80",
    danger: "bg-status-red/15 text-status-red hover:bg-status-red/25",
    ghost: "bg-elevated text-bone hover:bg-elevated/70",
    gold: "bg-gold text-obsidian hover:bg-gold/80",
  };
  return (
    <button
      {...props}
      className={`rounded-control px-4 py-2 text-sm font-semibold transition-colors duration-200 disabled:opacity-40 ${variants[variant]} ${props.className ?? ""}`}
    >
      {children}
    </button>
  );
}

export const usd = (n?: number | null): string =>
  n === undefined || n === null ? "—" : (n < 0 ? "-$" : "$") + Math.round(Math.abs(n)).toLocaleString();

export const countdown = (iso: string): string => {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "closed";
  const h = ms / 3_600_000;
  if (h < 1) return `${Math.round(ms / 60_000)}m`;
  if (h < 24) return `${h.toFixed(1)}h`;
  return `${Math.floor(h / 24)}d ${Math.round(h % 24)}h`;
};

// ─── System Health status pill (Part 2 of the v3.1 spec) ──────────────────

const healthDot: Record<HealthStatus, string> = {
  active: "bg-status-green",
  attention: "bg-status-amber",
  not_set_up: "bg-status-gray",
  error: "bg-status-red",
};

const healthLabel: Record<HealthStatus, string> = {
  active: "Active",
  attention: "Needs attention",
  not_set_up: "Not set up",
  error: "Error",
};

const healthPulse: Record<HealthStatus, string> = {
  active: "",
  attention: "animate-pulse",
  not_set_up: "",
  error: "animate-pulse",
};

export function StatusPill({ status, label }: { status: HealthStatus; label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-elevated bg-surface px-2.5 py-1 text-[11px] font-medium text-ash">
      <span className={`h-1.5 w-1.5 rounded-full ${healthDot[status]} ${healthPulse[status]}`} />
      {label ?? healthLabel[status]}
    </span>
  );
}
