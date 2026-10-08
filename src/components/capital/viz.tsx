"use client";

/**
 * Visual instruments for the Capital Desk: plain SVG, drawn to scale, no chart
 * library. Every mark reads a real number from the engine or the feed.
 */
import type { ReactNode } from "react";
import type { Site } from "@/lib/ci-intel";

// ─── fuel ─────────────────────────────────────────────────────────────────────

export type Fuel = "nuclear" | "gas" | "coal" | "hydro" | "solar" | "biomass" | "oil" | "battery" | "wind" | "substation" | "other";

export const FUEL: Record<Fuel, { label: string; color: string; glyph: string }> = {
  nuclear: { label: "Nuclear", color: "#A78BFA", glyph: "☢" },
  gas: { label: "Natural gas", color: "#F97316", glyph: "▲" },
  coal: { label: "Coal", color: "#A8A29E", glyph: "■" },
  hydro: { label: "Hydro / pumped", color: "#38BDF8", glyph: "≈" },
  solar: { label: "Solar", color: "#FACC15", glyph: "✹" },
  biomass: { label: "Biomass", color: "#4ADE80", glyph: "♣" },
  oil: { label: "Petroleum", color: "#F87171", glyph: "●" },
  battery: { label: "Battery", color: "#2DD4BF", glyph: "▮" },
  wind: { label: "Wind", color: "#E2E8F0", glyph: "✣" },
  substation: { label: "Substation", color: "#06B6D4", glyph: "◆" },
  other: { label: "Other", color: "#64748B", glyph: "○" },
};

export function fuelOf(s: Site): Fuel {
  if (s.existingUse === "substation") return "substation";
  const t = (s.name.match(/\(([^)]+)\)\s*$/)?.[1] ?? s.name).toLowerCase();
  if (/nuclear/.test(t)) return "nuclear";
  if (/natural gas|gas/.test(t)) return "gas";
  if (/coal/.test(t)) return "coal";
  if (/hydro|pumped/.test(t)) return "hydro";
  if (/solar/.test(t)) return "solar";
  if (/biomass|wood|landfill/.test(t)) return "biomass";
  if (/petroleum|oil/.test(t)) return "oil";
  if (/batter/.test(t)) return "battery";
  if (/wind/.test(t)) return "wind";
  return "other";
}

/** Plant name without the "(fuel)" suffix. */
export const cleanName = (n: string) => n.replace(/\s*\([^)]*\)\s*$/, "");

export function FuelChip({ fuel }: { fuel: Fuel }) {
  const f = FUEL[fuel];
  return (
    <span className="inline-flex items-center gap-1 rounded-sm px-1.5 py-px font-mono text-[9px] uppercase tracking-wider" style={{ color: f.color, background: `${f.color}1A`, boxShadow: `inset 0 0 0 1px ${f.color}40` }}>
      <span aria-hidden>{f.glyph}</span>
      {f.label}
    </span>
  );
}

// ─── score ring ───────────────────────────────────────────────────────────────

const tone = (v: number) => (v >= 60 ? "#10B981" : v >= 45 ? "#C9A84C" : v >= 30 ? "#06B6D4" : "#64748B");

export function ScoreRing({ value, size = 56, stroke = 5, label, sub }: { value: number; size?: number; stroke?: number; label?: string; sub?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const col = tone(value);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label ?? "Score"} ${value} of 100`} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1E293B" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={col} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${(c * Math.max(0, Math.min(100, value))) / 100} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ filter: `drop-shadow(0 0 4px ${col}80)` }} />
      <text x="50%" y={sub ? "47%" : "50%"} textAnchor="middle" dominantBaseline="central" fill="#F8FAFC" fontFamily="var(--font-data)" fontWeight={700} fontSize={size * 0.3}>
        {value}
      </text>
      {sub && (
        <text x="50%" y="70%" textAnchor="middle" fill="#64748B" fontFamily="var(--font-data)" fontSize={size * 0.12} letterSpacing="1">
          {sub}
        </text>
      )}
    </svg>
  );
}

// ─── radar ────────────────────────────────────────────────────────────────────

export function Radar({ axes, size = 220 }: { axes: { label: string; value: number }[]; size?: number }) {
  const pad = 44;
  const cx = size / 2, cy = size / 2, R = size / 2 - pad;
  const pt = (i: number, v: number) => {
    const a = (Math.PI * 2 * i) / axes.length - Math.PI / 2;
    return [cx + Math.cos(a) * R * (v / 100), cy + Math.sin(a) * R * (v / 100)] as const;
  };
  const poly = axes.map((x, i) => pt(i, Math.max(3, x.value)).join(",")).join(" ");
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="h-auto w-full max-w-[240px]" role="img" aria-label={axes.map((a) => `${a.label} ${a.value}`).join(", ")}>
      {[25, 50, 75, 100].map((g) => (
        <polygon key={g} points={axes.map((_, i) => pt(i, g).join(",")).join(" ")} fill={g === 100 ? "#06B6D40A" : "none"} stroke="#1E293B" strokeWidth={1} />
      ))}
      {axes.map((_, i) => (
        <line key={i} x1={cx} y1={cy} x2={pt(i, 100)[0]} y2={pt(i, 100)[1]} stroke="#1E293B" strokeWidth={1} />
      ))}
      <polygon points={poly} fill="#C9A84C33" stroke="#C9A84C" strokeWidth={1.5} strokeLinejoin="round" style={{ filter: "drop-shadow(0 0 6px #C9A84C66)" }} />
      {axes.map((x, i) => {
        const [px, py] = pt(i, Math.max(3, x.value));
        const [lx, ly] = pt(i, 116);
        const anchor = Math.abs(lx - cx) < 4 ? "middle" : lx > cx ? "start" : "end";
        return (
          <g key={x.label}>
            <circle cx={px} cy={py} r={2.5} fill="#F8FAFC" />
            <text x={lx} y={ly} textAnchor={anchor} dominantBaseline="central" fontFamily="var(--font-data)" fontSize={8.5} letterSpacing=".5">
              <tspan fill="#94A3B8">{x.label.toUpperCase()} </tspan>
              <tspan fill="#F8FAFC" fontWeight={700}>
                {x.value}
              </tspan>
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ─── donut ────────────────────────────────────────────────────────────────────

export function Donut({ slices, size = 132, center, unit }: { slices: { label: string; value: number; color: string }[]; size?: number; center: string; unit: string }) {
  const total = slices.reduce((t, s) => t + s.value, 0) || 1;
  const r = size / 2 - 10, sw = 14, c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={slices.map((s) => `${s.label} ${s.value}`).join(", ")} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1E293B" strokeWidth={sw} />
      {slices.map((s) => {
        const len = (c * s.value) / total;
        const el = <circle key={s.label} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color} strokeWidth={sw} strokeDasharray={`${Math.max(0, len - 1.5)} ${c}`} strokeDashoffset={-acc} transform={`rotate(-90 ${size / 2} ${size / 2})`} />;
        acc += len;
        return el;
      })}
      <text x="50%" y="46%" textAnchor="middle" dominantBaseline="central" fill="#F8FAFC" fontFamily="var(--font-data)" fontWeight={700} fontSize={size * 0.16}>
        {center}
      </text>
      <text x="50%" y="62%" textAnchor="middle" fill="#64748B" fontFamily="var(--font-data)" fontSize={size * 0.075} letterSpacing="1.5">
        {unit}
      </text>
    </svg>
  );
}

export function Legend({ items }: { items: { label: string; value: string; color: string }[] }) {
  return (
    <ul className="grid min-w-0 flex-1 gap-1 text-[10px]">
      {items.map((x) => (
        <li key={x.label} className="flex items-center gap-1.5">
          <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: x.color }} />
          <span className="truncate text-ash">{x.label}</span>
          <span className="ml-auto font-mono tabular-nums text-bone">{x.value}</span>
        </li>
      ))}
    </ul>
  );
}

// ─── bars + histogram ─────────────────────────────────────────────────────────

export function HBars({ rows, unit, color = "#C9A84C" }: { rows: { label: string; value: number; color?: string }[]; unit: string; color?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="grid gap-1.5">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[88px_1fr_54px] items-center gap-2 text-[10px]">
          <span className="truncate text-ash">{r.label}</span>
          <span className="relative h-2 overflow-hidden rounded-sm bg-elevated/70">
            <span className="absolute inset-y-0 left-0 rounded-sm" style={{ width: `${(r.value / max) * 100}%`, background: `linear-gradient(90deg, ${r.color ?? color}55, ${r.color ?? color})` }} />
          </span>
          <span className="text-right font-mono tabular-nums text-bone">
            {r.value.toLocaleString()}
            <span className="text-muted"> {unit}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Score distribution: ten 10-point bins, 0–100, bar height to scale. */
export function Histogram({ values, highlight }: { values: number[]; highlight?: number | null }) {
  const bins = Array.from({ length: 10 }, (_, i) => values.filter((v) => (i === 9 ? v >= 90 : v >= i * 10 && v < i * 10 + 10)).length);
  const max = Math.max(1, ...bins);
  const W = 240, H = 76, bw = W / 10;
  return (
    <svg viewBox={`0 0 ${W} ${H + 14}`} className="h-auto w-full" role="img" aria-label={`Score distribution: ${bins.join(", ")}`}>
      {[0.5, 1].map((g) => (
        <line key={g} x1={0} x2={W} y1={H - H * g} y2={H - H * g} stroke="#1E293B" strokeDasharray="2 3" />
      ))}
      {bins.map((n, i) => {
        const h = (n / max) * (H - 4);
        const hot = highlight != null && Math.min(9, Math.floor(highlight / 10)) === i;
        return (
          <g key={i}>
            <rect x={i * bw + 2} y={H - h} width={bw - 4} height={h} rx={1.5} fill={hot ? "#C9A84C" : tone(i * 10 + 5)} opacity={hot ? 1 : 0.7} />
            {n > 0 && (
              <text x={i * bw + bw / 2} y={H - h - 3} textAnchor="middle" fill="#94A3B8" fontFamily="var(--font-data)" fontSize={7.5}>
                {n}
              </text>
            )}
          </g>
        );
      })}
      <line x1={0} x2={W} y1={H} y2={H} stroke="#334155" />
      {[0, 50, 100].map((t) => (
        <text key={t} x={t === 100 ? W : (t / 100) * W} y={H + 11} textAnchor={t === 0 ? "start" : t === 100 ? "end" : "middle"} fill="#64748B" fontFamily="var(--font-data)" fontSize={8}>
          {t}
        </text>
      ))}
    </svg>
  );
}

// ─── constellation graph ──────────────────────────────────────────────────────

export function ConstellationGraph({ site, slots }: { site: string; slots: { role: string; label: string; filledBy: string | null }[] }) {
  const W = 300, H = 210, cx = W / 2, cy = H / 2 + 4, rx = 112, ry = 74;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={slots.map((s) => `${s.label}: ${s.filledBy ?? "gap"}`).join("; ")}>
      {slots.map((s, i) => {
        const a = (Math.PI * 2 * i) / slots.length - Math.PI / 2;
        const x = cx + Math.cos(a) * rx, y = cy + Math.sin(a) * ry;
        const ok = !!s.filledBy;
        return (
          <g key={s.role}>
            <line x1={cx} y1={cy} x2={x} y2={y} stroke={ok ? "#10B981" : "#EF4444"} strokeWidth={ok ? 1.6 : 1} strokeDasharray={ok ? undefined : "3 4"} opacity={ok ? 0.9 : 0.6} />
            <circle cx={x} cy={y} r={ok ? 9 : 8} fill={ok ? "#10B98126" : "#0A0E1A"} stroke={ok ? "#10B981" : "#EF4444"} strokeWidth={1.4} strokeDasharray={ok ? undefined : "2 2"} />
            <text x={x} y={y + 0.5} textAnchor="middle" dominantBaseline="central" fill={ok ? "#10B981" : "#EF4444"} fontSize={9} fontFamily="var(--font-data)">
              {ok ? "✓" : "?"}
            </text>
            <text x={x} y={y + (y < cy ? -15 : 19)} textAnchor="middle" fill="#94A3B8" fontFamily="var(--font-data)" fontSize={8} letterSpacing=".6">
              {s.label.toUpperCase()}
            </text>
            <text x={x} y={y + (y < cy ? -25 : 29)} textAnchor="middle" fill={ok ? "#F8FAFC" : "#EF4444"} fontSize={8.5}>
              {(s.filledBy ?? "GAP").slice(0, 26)}
            </text>
          </g>
        );
      })}
      <circle cx={cx} cy={cy} r={20} fill="#C9A84C1F" stroke="#C9A84C" strokeWidth={1.5} style={{ filter: "drop-shadow(0 0 8px #C9A84C88)" }} />
      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fill="#C9A84C" fontSize={8} fontFamily="var(--font-data)" letterSpacing="1">
        SITE
      </text>
      <title>{site}</title>
    </svg>
  );
}

// ─── satellite frame ──────────────────────────────────────────────────────────

const Corner = ({ c }: { c: string }) => <span aria-hidden className={`pointer-events-none absolute h-4 w-4 border-gold/80 ${c}`} />;

export function SatFrame({ site, className = "", children, compact }: { site: Site; className?: string; children?: ReactNode; compact?: boolean }) {
  const src = site.media?.sat;
  return (
    <div className={`relative overflow-hidden bg-[#050B14] ${className}`} style={{ aspectRatio: "16 / 10", maxWidth: "100%" }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={`Satellite view of ${cleanName(site.name)}`} className="absolute inset-0 h-full w-full object-cover" style={{ filter: "saturate(.85) contrast(1.08)" }} loading="lazy" />
      ) : (
        <NoImagery />
      )}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(2,4,10,.75))]" />
      {!compact && (
        <>
          <div className="ge-scan pointer-events-none absolute inset-x-0 h-px bg-cyan/50 shadow-[0_0_12px_#06B6D4]" />
          <Corner c="left-2 top-2 border-l-2 border-t-2" />
          <Corner c="right-2 top-2 border-r-2 border-t-2" />
          <Corner c="bottom-2 left-2 border-b-2 border-l-2" />
          <Corner c="bottom-2 right-2 border-b-2 border-r-2" />
          <svg aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2" viewBox="0 0 40 40">
            <circle cx="20" cy="20" r="11" fill="none" stroke="#C9A84C" strokeWidth="1" opacity=".9" />
            <path d="M20 0v12M20 28v12M0 20h12M28 20h12" stroke="#C9A84C" strokeWidth="1" opacity=".9" />
          </svg>
          <div className="absolute left-3 top-3 font-mono text-[9px] tracking-wider text-bone/90 [text-shadow:0_1px_2px_#000]">
            {site.lat.toFixed(4)}°N {Math.abs(site.lng).toFixed(4)}°W
          </div>
          {src && <div className="absolute bottom-1.5 right-3 font-mono text-[8px] text-bone/60 [text-shadow:0_1px_2px_#000]">{site.media?.credit}</div>}
        </>
      )}
      {children}
    </div>
  );
}

function NoImagery() {
  return (
    <svg viewBox="0 0 160 100" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full" aria-hidden>
      <rect width="160" height="100" fill="#050B14" />
      {Array.from({ length: 9 }, (_, i) => (
        <line key={`v${i}`} x1={i * 20} x2={i * 20} y1={0} y2={100} stroke="#0E2A38" strokeWidth=".4" />
      ))}
      {Array.from({ length: 6 }, (_, i) => (
        <line key={`h${i}`} y1={i * 20} y2={i * 20} x1={0} x2={160} stroke="#0E2A38" strokeWidth=".4" />
      ))}
      {[14, 28, 42].map((r) => (
        <circle key={r} cx="80" cy="50" r={r} fill="none" stroke="#06B6D4" strokeOpacity=".22" strokeWidth=".5" />
      ))}
      <g className="ge-sweep" style={{ transformOrigin: "80px 50px" }}>
        <path d="M80 50 L80 8 A42 42 0 0 1 116 29 Z" fill="#06B6D4" fillOpacity=".14" />
      </g>
      <text x="80" y="93" textAnchor="middle" fill="#64748B" fontSize="4.5" fontFamily="monospace" letterSpacing=".6">
        NO PHOTO YET · REFRESHES WITH THE WEEKLY FEED
      </text>
    </svg>
  );
}
