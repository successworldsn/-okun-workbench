"use client";

/**
 * GOD'S EYE — REAL ESTATE COMMAND. The Deal Desk.
 * SEE (map) → DETECT (missions) → INVESTIGATE (dossier) → CONTACT → FOLLOW UP → DEAL.
 * God's Eye sees. Oracle analyzes. The Deal Desk acts. You close.
 */
import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { MISSIONS, SOURCES, STRATEGY_LABELS, badge, type Badge, type Evidence, type Intel, type MarketContext, type Mission } from "@/lib/re-intel";
import {
  STAGES,
  ACTION_LABELS,
  applyActivity,
  applyCommand,
  buildQueue,
  moneyStats,
  nextAction,
  parseCommand,
  type Activity,
  type ActivityKind,
  type CommandFilter,
  type DeskState,
  type Outcome,
  type Stage,
} from "@/lib/re-desk";
import type { FeedSource } from "@/lib/re-desk-store";
import type { Channel } from "@/lib/re-outreach";
import { askOracle, draftMessage, logTouch } from "@/app/realestate/actions";
import type { Basemap, MapPoint } from "./GodsEyeMap";

const GodsEyeMap = dynamic(() => import("./GodsEyeMap").then((m) => m.GodsEyeMap), { ssr: false, loading: () => <div className="absolute inset-0 grid place-items-center font-mono text-xs text-cyan">ACQUIRING ORBIT…</div> });

type View = "desk" | "pipeline" | "money" | "sources";
type Tab = "OWNER" | "PROPERTY" | "MONEY" | "ZONING" | "COMPS" | "CONTACT" | "ACTION";
const TABS: Tab[] = ["OWNER", "PROPERTY", "MONEY", "ZONING", "COMPS", "CONTACT", "ACTION"];

const money = (v: number | null | undefined) => (v == null || !isFinite(v) ? "—" : (v < 0 ? "−" : "") + "$" + Math.round(Math.abs(v)).toLocaleString("en-US"));
const kmoney = (v: number | null | undefined) =>
  v == null || !isFinite(v) ? "—" : (v < 0 ? "−" : "") + "$" + (Math.abs(v) >= 1e6 ? (Math.abs(v) / 1e6).toFixed(1) + "M" : Math.abs(v) >= 1e3 ? Math.round(Math.abs(v) / 1e3) + "K" : Math.round(Math.abs(v)));
const day = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : "—");

const BADGE_CLS: Record<Badge, string> = {
  VERIFIED: "border-status-green/50 text-status-green",
  INFERRED: "border-status-amber/50 text-status-amber",
  STALE: "border-status-red/50 text-status-red",
};
const BADGE_DOT: Record<Badge, string> = { VERIFIED: "🟢", INFERRED: "🟡", STALE: "🔴" };

function BadgeChip({ b }: { b: Badge }) {
  return <span className={`inline-flex shrink-0 items-center gap-1 rounded border px-1.5 py-px font-mono text-[9px] tracking-widest ${BADGE_CLS[b]}`}>{BADGE_DOT[b]} {b}</span>;
}

function EvidenceLine({ e, now }: { e: Evidence; now: Date }) {
  const b = badge(e, now);
  return (
    <li className="flex items-start gap-2 text-[11px] leading-snug text-ash">
      <BadgeChip b={b} />
      <span className="min-w-0">
        {e.detail}
        <span className="block font-mono text-[10px] text-muted">
          {SOURCES[e.source].label}
          {e.observedAt ? ` · ${day(e.observedAt)}` : ""}
          {e.ref ? ` · ${e.ref}` : ""}
        </span>
      </span>
    </li>
  );
}

function priority(score: number) {
  if (score >= 80) return { label: "🔥 HIGH PRIORITY", cls: "text-status-red" };
  if (score >= 65) return { label: "⚡ PRIORITY", cls: "text-status-amber" };
  if (score >= 45) return { label: "◎ WORK IT", cls: "text-cyan" };
  return { label: "· WATCH", cls: "text-muted" };
}

const missionFocus = (i: Intel, m: Mission | "all") =>
  m === "all" || m === "hot" || m === "new"
    ? i.score
    : m === "equity"
      ? i.engines.equity.score
      : m === "distress"
        ? Math.max(i.engines.distress.score, i.engines.motivation.score)
        : m === "develop"
          ? i.engines.development.score
          : i.engines.motivation.score;

const PRIMARY_ICON: Record<string, string> = { FORECLOSURE: "🔥", PROBATE: "🔥", "TAX DELINQUENT": "🔥", DEVELOPMENT: "🏗", "HIGH EQUITY": "💰", "CODE COMPLAINT": "🏚", ABSENTEE: "🏠", RESEARCH: "◎" };

export function DealDesk({
  intel,
  initialStates,
  initialActivity,
  meta,
  market,
  nowIso,
  claudeConfigured,
  totalProperties,
}: {
  intel: Intel[];
  initialStates: Record<string, DeskState>;
  initialActivity: Activity[];
  meta: { example: boolean; generatedAt: string; sources: FeedSource[]; note?: string };
  market: Record<string, MarketContext>;
  nowIso: string;
  claudeConfigured: boolean;
  totalProperties: number;
}) {
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const [states, setStates] = useState(initialStates);
  const [activity, setActivity] = useState(initialActivity);
  const [mission, setMission] = useState<Mission | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<View>("desk");
  const [tab, setTab] = useState<Tab>("ACTION");
  const [cmd, setCmd] = useState("");
  const [filter, setFilter] = useState<CommandFilter | null>(null);
  const [oracle, setOracle] = useState<{ id: string; text: string; by: string } | null>(null);
  const [draft, setDraft] = useState<{ id: string; channel: Channel; text: string; compliance: string; by: string } | null>(null);
  const [basemap, setBasemap] = useState<Basemap>("satellite");
  const [terrain, setTerrain] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();

  const flash = (t: string) => {
    setToast(t);
    setTimeout(() => setToast(null), 2600);
  };

  const byId = useMemo(() => new Map(intel.map((i) => [i.p.id, i])), [intel]);
  const visible = useMemo(() => {
    const base = filter ? applyCommand(intel, filter, states) : intel;
    return mission === "all" ? base : base.filter((i) => i.missions.includes(mission));
  }, [intel, filter, mission, states]);
  const visibleIds = useMemo(() => new Set(visible.map((i) => i.p.id)), [visible]);
  const queue = useMemo(() => buildQueue(filter ? visible : intel, states, now, mission, 60), [intel, visible, filter, states, now, mission]);
  const stats = useMemo(() => moneyStats(intel, states), [intel, states]);
  const sel = selectedId ? byId.get(selectedId) ?? null : null;
  const selState = sel ? states[sel.p.id] : undefined;
  const selAction = sel ? nextAction(sel, selState, now) : null;
  const selActivity = sel ? activity.filter((a) => a.parcelId === sel.p.id) : [];

  const points: MapPoint[] = useMemo(
    () =>
      intel
        .filter((i) => i.p.lat != null && i.p.lng != null)
        .map((i) => ({ id: i.p.id, lat: i.p.lat!, lng: i.p.lng!, score: i.score, focus: missionFocus(i, mission), dim: !visibleIds.has(i.p.id), label: i.p.address })),
    [intel, mission, visibleIds],
  );

  const avgConfidence = intel.length ? Math.round(intel.reduce((s, i) => s + i.confidence, 0) / intel.length) : 0;
  const staleSources = meta.sources.filter((s) => s.maxDate && (now.getTime() - new Date(s.maxDate).getTime()) / 86_400_000 > 60);
  const dataHealth = meta.example ? { label: "EXAMPLE", cls: "text-status-amber" } : staleSources.length ? { label: "AGING", cls: "text-status-amber" } : { label: "HEALTHY", cls: "text-status-green" };

  function select(id: string) {
    setSelectedId(id);
    setView("desk");
    setOracle(null);
    setDraft(null);
    setNote("");
    setTab("ACTION");
  }

  function runCommand(text: string) {
    const f = parseCommand(text);
    if (f.explain) {
      if (!sel) return flash("Select a property first, then ask why.");
      setTab("ACTION");
      return start(async () => setOracle({ id: sel.p.id, ...(await askOracle(sel.p.id, selState?.stage ?? null)) }));
    }
    if (!f.understood.length) return flash("Didn't catch that. Try: distressed within 5 miles of Atlanta with at least $200K equity");
    setFilter(f);
    setView("desk");
    const top = applyCommand(intel, f, states)[0];
    if (top) select(top.p.id);
  }

  function touch(kind: ActivityKind, outcome: Outcome, opts: { stage?: Stage; amount?: number | null; advance?: boolean } = {}) {
    if (!sel) return;
    const id = sel.p.id;
    const optimistic: Activity = { id: `local-${Date.now()}`, parcelId: id, at: new Date().toISOString(), kind, outcome, note: note || undefined, stage: opts.stage, amount: opts.amount ?? null };
    setActivity((a) => [optimistic, ...a]);
    setStates((s) => ({ ...s, [id]: applyActivity(s[id], optimistic) }));
    setNote("");
    start(async () => {
      try {
        const st = await logTouch({ parcelId: id, kind, outcome, note: optimistic.note, stage: opts.stage, amount: opts.amount ?? null });
        setStates((s) => ({ ...s, [id]: st }));
        flash(`${ACTION_LABELS[kind]} logged · ${st.nextFollowUp ? `follow up ${day(st.nextFollowUp)}` : st.stage}`);
      } catch (e) {
        flash(`Not saved: ${(e as Error).message}`);
      }
    });
    if (opts.advance !== false && kind !== "note" && kind !== "stage") {
      const next = queue.find((q) => q.intel.p.id !== id);
      if (next) setTimeout(() => select(next.intel.p.id), 650);
    }
  }

  // ─── Header ───
  const header = (
    <header className="flex h-12 shrink-0 items-center gap-4 border-b border-cyan/20 bg-[#03060D]/95 px-3 font-mono text-[11px] tracking-widest text-ash">
      <Link href="/" className="text-muted hover:text-bone" title="Back to the workbench">
        ←
      </Link>
      <span className="flex items-center gap-2 font-display text-[13px] font-bold tracking-[0.2em] text-bone">
        <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-cyan shadow-[0_0_12px_#06B6D4]" />
        GOD&apos;S EYE <span className="hidden text-cyan sm:inline">REAL ESTATE COMMAND</span>
      </span>
      <span className="hidden md:inline">
        ATLANTA • <span className={meta.example ? "text-status-amber" : "text-status-green"}>{meta.example ? "EXAMPLE DATA" : "LIVE"}</span>
      </span>
      <span className="ml-auto hidden lg:inline">
        INTELLIGENCE <span className="text-bone">{avgConfidence}%</span>
      </span>
      <span className="hidden lg:inline">
        DATA <span className={dataHealth.cls}>{dataHealth.label}</span>
      </span>
      <span>
        QUEUE <span className="text-bone">{queue.length}</span>
      </span>
      <nav className="flex gap-1">
        {(["desk", "pipeline", "money", "sources"] as View[]).map((v) => (
          <button key={v} onClick={() => setView(v)} className={`rounded px-2 py-1 uppercase ${view === v ? "bg-cyan/15 text-cyan" : "hover:text-bone"}`}>
            {v === "desk" ? "Desk" : v === "money" ? "Money" : v === "sources" ? "Data" : "Pipeline"}
          </button>
        ))}
      </nav>
    </header>
  );

  // ─── Left rail: missions + queue ───
  const rail = (
    <aside className="flex min-h-0 w-full flex-col border-r border-cyan/10 bg-[#050912]/90 lg:w-[260px]">
      <div className="border-b border-cyan/10 p-2">
        <div className="mb-1 px-1 font-mono text-[10px] tracking-[0.25em] text-muted">MISSIONS</div>
        <div className="grid grid-cols-3 gap-1 lg:grid-cols-2">
          <button onClick={() => setMission("all")} className={`rounded px-2 py-1.5 text-left font-mono text-[10px] tracking-wider ${mission === "all" ? "bg-cyan/15 text-cyan" : "text-ash hover:bg-elevated"}`}>
            ◉ ALL <span className="text-muted">{intel.length}</span>
          </button>
          {MISSIONS.map((m) => (
            <button key={m.key} onClick={() => setMission(m.key)} className={`rounded px-2 py-1.5 text-left font-mono text-[10px] tracking-wider ${mission === m.key ? "bg-cyan/15 text-cyan" : "text-ash hover:bg-elevated"}`}>
              {m.icon} {m.label.toUpperCase()} <span className="text-muted">{intel.filter((i) => i.missions.includes(m.key)).length}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between px-3 pb-1 pt-2 font-mono text-[10px] tracking-[0.25em] text-muted">
        <span>QUEUE · {queue.length} TODAY</span>
        {queue[0] && (
          <button onClick={() => select(queue[0].intel.p.id)} className="rounded bg-gold/15 px-2 py-0.5 text-gold hover:bg-gold/25">
            START ▸
          </button>
        )}
      </div>
      <ol className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {queue.map((q, n) => {
          const i = q.intel;
          const on = i.p.id === selectedId;
          return (
            <li key={i.p.id}>
              <button onClick={() => select(i.p.id)} className={`mb-1 w-full rounded border px-2 py-1.5 text-left transition-colors ${on ? "border-cyan/60 bg-cyan/10" : "border-transparent hover:border-cyan/20 hover:bg-elevated/60"}`}>
                <div className="flex items-baseline gap-2">
                  <span className="w-4 font-mono text-[10px] text-muted">{n + 1}</span>
                  <span className="font-mono text-[13px] font-bold text-bone">
                    {PRIMARY_ICON[i.primarySignal] ?? "◎"} {i.score}
                  </span>
                  <span className="truncate text-[12px] text-bone">{i.p.address}</span>
                </div>
                <div className="ml-6 flex items-center gap-2 font-mono text-[9px] tracking-wider">
                  <span className="text-ash">{i.primarySignal}</span>
                  <span className={q.due ? "text-gold" : q.action.verb === "CALL NOW" ? "text-status-red" : "text-cyan"}>{q.action.verb}</span>
                  <span className="ml-auto text-muted">{i.confidence}%</span>
                </div>
              </button>
            </li>
          );
        })}
        {!queue.length && <li className="p-3 text-xs text-muted">Nothing due in this mission. Switch missions or clear the command filter.</li>}
      </ol>
    </aside>
  );

  // ─── Dossier ───
  const dossier = sel ? (
    <Dossier
      key={sel.p.id}
      i={sel}
      state={selState}
      action={selAction!}
      acts={selActivity}
      tab={tab}
      setTab={setTab}
      market={(sel.p.zip && market[sel.p.zip]) || undefined}
      now={now}
      oracle={oracle?.id === sel.p.id ? oracle : null}
      draft={draft?.id === sel.p.id ? draft : null}
      pending={pending}
      note={note}
      setNote={setNote}
      claudeConfigured={claudeConfigured}
      onAsk={() => start(async () => setOracle({ id: sel.p.id, ...(await askOracle(sel.p.id, selState?.stage ?? null)) }))}
      onDraft={(c, polish) => start(async () => setDraft({ id: sel.p.id, channel: c, ...(await draftMessage(sel.p.id, c, polish)) }))}
      onTouch={touch}
    />
  ) : (
    <div className="grid h-full place-items-center p-6 text-center">
      <div>
        <div className="font-mono text-[10px] tracking-[0.3em] text-muted">NO TARGET</div>
        <p className="mt-2 text-sm text-ash">Pick a dot on the map or press START on the queue.</p>
        {queue[0] && (
          <button onClick={() => select(queue[0].intel.p.id)} className="mt-4 rounded-control bg-gold/20 px-4 py-2 font-mono text-xs tracking-widest text-gold hover:bg-gold/30">
            OPEN #1 · {queue[0].intel.p.address}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-[#02040A] text-bone">
      {header}
      {(meta.example || meta.note) && (
        <div className="shrink-0 bg-status-amber/10 px-3 py-1 text-center font-mono text-[10px] tracking-wider text-status-amber">
          {meta.note ?? "EXAMPLE DATA"} {meta.example && "· Every address, owner and case number shown is fictional."}
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="order-2 flex max-h-[38vh] min-h-0 lg:order-1 lg:max-h-none">{rail}</div>
        <main className="relative order-1 h-[42vh] min-w-0 flex-1 lg:order-2 lg:h-auto">
          <GodsEyeMap points={points} selectedId={selectedId} onSelect={select} basemap={basemap} terrain={terrain} />
          <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_120px_rgba(2,4,10,0.95)]" />
          <div className="absolute left-2 top-2 flex flex-wrap gap-1 font-mono text-[10px] tracking-wider">
            <button onClick={() => setBasemap(basemap === "satellite" ? "dark" : "satellite")} className="rounded border border-cyan/30 bg-[#03060D]/80 px-2 py-1 text-cyan">
              {basemap === "satellite" ? "◐ SATELLITE" : "◑ DARK"}
            </button>
            <button onClick={() => setTerrain(!terrain)} className={`rounded border px-2 py-1 ${terrain ? "border-cyan/60 bg-cyan/15 text-cyan" : "border-cyan/30 bg-[#03060D]/80 text-ash"}`}>
              ⛰ TERRAIN
            </button>
            {filter && (
              <button onClick={() => setFilter(null)} className="rounded border border-gold/40 bg-[#03060D]/80 px-2 py-1 text-gold">
                ✕ {filter.understood.join(" · ")} ({visible.length})
              </button>
            )}
          </div>
          {sel && (
            <div className="pointer-events-none absolute bottom-3 left-3 right-3 rounded border border-cyan/30 bg-[#03060D]/85 px-3 py-2 font-mono text-[11px] tracking-wider backdrop-blur lg:right-auto">
              <span className="text-bone">{sel.p.address.toUpperCase()}</span>
              <span className="ml-3 text-ash">SCORE</span> <span className="text-bone">{sel.score}</span>
              <span className="ml-3 text-ash">EQUITY</span> <span className="text-bone">{kmoney(sel.value.equity)}</span>
              <span className="ml-3 text-ash">DISTRESS</span> <span className="text-bone">{sel.engines.distress.score >= 50 ? "HIGH" : sel.engines.distress.score >= 25 ? "MED" : "LOW"}</span>
            </div>
          )}
          {view !== "desk" && (
            <div className="absolute inset-0 overflow-y-auto bg-[#02040A]/92 p-4 backdrop-blur-sm">
              {view === "pipeline" && <Pipeline intel={intel} states={states} onOpen={select} />}
              {view === "money" && <MoneyView stats={stats} />}
              {view === "sources" && <SourcesView meta={meta} now={now} shown={intel.length} total={totalProperties} />}
            </div>
          )}
        </main>
        <section className="order-3 min-h-0 border-l border-cyan/10 bg-[#050912]/95 lg:w-[440px]">{dossier}</section>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          runCommand(cmd);
        }}
        className="flex h-12 shrink-0 items-center gap-2 border-t border-cyan/20 bg-[#03060D] px-3"
      >
        <span className="font-mono text-cyan">⌘</span>
        <input
          value={cmd}
          onChange={(e) => setCmd(e.target.value)}
          placeholder="Ask God's Eye anything… e.g. distressed within 5 miles of Atlanta with at least $200K equity"
          className="min-w-0 flex-1 bg-transparent font-mono text-[12px] text-bone placeholder:text-muted focus:outline-none"
          aria-label="Command"
        />
        {selAction && (
          <span className="hidden font-mono text-[10px] tracking-wider text-gold xl:inline">
            NEXT: {selAction.verb} → {selAction.why}
          </span>
        )}
        <button className="rounded bg-cyan/15 px-3 py-1 font-mono text-[10px] tracking-widest text-cyan hover:bg-cyan/25">RUN</button>
      </form>
      {toast && <div className="fixed bottom-16 left-1/2 z-50 -translate-x-1/2 rounded border border-cyan/40 bg-[#03060D] px-4 py-2 font-mono text-[11px] text-cyan shadow-lg">{toast}</div>}
    </div>
  );
}

// ─── Dossier ──────────────────────────────────────────────────────────────────

function Dossier(props: {
  i: Intel;
  state: DeskState | undefined;
  action: { verb: string; why: string };
  acts: Activity[];
  tab: Tab;
  setTab: (t: Tab) => void;
  market: MarketContext | undefined;
  now: Date;
  oracle: { text: string; by: string } | null;
  draft: { channel: Channel; text: string; compliance: string; by: string } | null;
  pending: boolean;
  note: string;
  setNote: (s: string) => void;
  claudeConfigured: boolean;
  onAsk: () => void;
  onDraft: (c: Channel, polish: boolean) => void;
  onTouch: (k: ActivityKind, o: Outcome, opts?: { stage?: Stage; amount?: number | null; advance?: boolean }) => void;
}) {
  const { i, state, action, tab, setTab, now } = props;
  const [closing, setClosing] = useState(false);
  const [closeAmt, setCloseAmt] = useState("");
  const p = i.p;
  const pr = priority(i.score);
  const engines = (["distress", "motivation", "equity", "valueGap", "development", "market", "risk"] as const).map((k) => i.engines[k]);
  const ENGINE_LABEL: Record<string, string> = { distress: "🏚 Distress", motivation: "🧭 Motivation", equity: "💰 Equity", valueGap: "📐 Value gap", development: "🏗 Development", market: "📈 Market", risk: "⚠ Risk" };

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-cyan/10 p-3">
        <div className="font-mono text-[9px] tracking-[0.3em] text-muted">
          PROPERTY DOSSIER · PARCEL {p.id}
          {p.example && <span className="ml-2 rounded bg-status-amber/15 px-1 text-status-amber">EXAMPLE · FICTIONAL</span>}
        </div>
        <h2 className="mt-1 font-display text-lg font-bold leading-tight">{p.address}</h2>
        <div className="text-[11px] text-ash">{[p.neighborhood, p.city, p.zip].filter(Boolean).join(" · ")}</div>
        <div className="mt-2 flex items-end gap-4">
          <div>
            <div className="font-mono text-[9px] tracking-[0.25em] text-muted">OPPORTUNITY</div>
            <div className="font-mono text-3xl font-bold leading-none">
              {i.score}
              <span className="text-sm text-muted">/100</span>
            </div>
          </div>
          <div>
            <div className="font-mono text-[9px] tracking-[0.25em] text-muted">CONFIDENCE</div>
            <div className="font-mono text-xl leading-none text-cyan">{i.confidence}%</div>
          </div>
          <div className={`ml-auto font-mono text-[11px] font-bold tracking-wider ${pr.cls}`}>{pr.label}</div>
        </div>
        <div className="mt-2 flex flex-wrap gap-1 font-mono text-[9px] text-muted">
          <span>{i.why}</span>
          <span>·</span>
          <span>🟢 {i.badges.VERIFIED}</span>
          <span>🟡 {i.badges.INFERRED}</span>
          <span>🔴 {i.badges.STALE}</span>
          <span>· STAGE {state?.stage ?? "DISCOVERED"}</span>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="border-b border-cyan/10 p-3">
          <div className="mb-1 font-mono text-[9px] tracking-[0.25em] text-cyan">WHY THE MACHINE LIKES IT</div>
          <ul className="space-y-0.5 text-[12px]">
            {i.strongest.map((s) => (
              <li key={s}>▸ {s}</li>
            ))}
            {!i.strongest.length && <li className="text-muted">No strong signals on record.</li>}
          </ul>
          <div className="mt-2 grid grid-cols-1 gap-1 text-[11px]">
            {i.conclusions.map((c) => (
              <div key={c.label} className="flex items-center gap-2">
                <span className={c.corroborated ? "text-status-green" : "text-status-amber"}>{c.corroborated ? "✓✓" : "✓·"}</span>
                <span className="text-bone">{c.label}</span>
                <span className="text-muted">
                  {c.independentSources} independent source{c.independentSources === 1 ? "" : "s"}
                  {c.corroborated ? "" : " · needs a 2nd signal"}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-2 text-[11px] text-ash">
            <span className="text-muted">Unknown:</span> {i.unknowns.slice(0, 3).join("; ")}
            <br />
            <span className="text-muted">Next verification:</span> {i.nextVerification}
          </div>
        </div>

        <div className="border-b border-cyan/10 p-3">
          <div className="mb-1 font-mono text-[9px] tracking-[0.25em] text-cyan">INTELLIGENCE ENGINES</div>
          {engines.map((e) => (
            <details key={e.key} className="group">
              <summary className="flex cursor-pointer list-none items-center gap-2 py-0.5 text-[11px]">
                <span className="w-28 text-ash">{ENGINE_LABEL[e.key]}</span>
                <span className="relative h-1.5 flex-1 overflow-hidden rounded bg-elevated">
                  <span className={`absolute inset-y-0 left-0 ${e.key === "risk" ? "bg-status-red" : "bg-cyan"}`} style={{ width: `${e.score}%` }} />
                </span>
                <span className="w-7 text-right font-mono text-bone">{e.score}</span>
              </summary>
              <ul className="mb-2 ml-2 mt-1 space-y-1.5 border-l border-cyan/20 pl-2">
                {e.findings.map((f) => (
                  <li key={f.text}>
                    <div className="text-[11px] text-bone">
                      {f.text} <span className="font-mono text-muted">{f.points > 0 ? `+${f.points}` : f.points}</span>
                    </div>
                    <ul className="mt-0.5 space-y-0.5">
                      {f.evidence.map((ev, n) => (
                        <EvidenceLine key={n} e={ev} now={now} />
                      ))}
                    </ul>
                  </li>
                ))}
                {!e.findings.length && <li className="text-[11px] text-muted">Nothing on record.</li>}
              </ul>
            </details>
          ))}
        </div>

        <div className="sticky top-0 z-[1] flex overflow-x-auto border-b border-cyan/10 bg-[#050912] font-mono text-[10px] tracking-wider">
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`shrink-0 px-2.5 py-2 ${tab === t ? "border-b-2 border-cyan text-cyan" : "text-muted hover:text-bone"}`}>
              {t}
            </button>
          ))}
        </div>
        <div className="p-3 text-[12px]">
          {tab === "OWNER" && (
            <Rows
              rows={[
                ["Owner of record", p.owner ?? "—"],
                ["Tax bill mails to", p.ownerMailing ?? "—"],
                ["Absentee", i.missions.includes("absentee") ? `Yes${p.ownerMailingState && p.ownerMailingState !== "GA" ? ` · out of state (${p.ownerMailingState})` : ""}` : "No / unknown"],
                ["Homestead exemption", p.homesteadExemption == null ? "—" : p.homesteadExemption ? "Yes (owner-occupied)" : "No"],
                ["Last transfer", `${day(p.lastSaleDate)}${p.lastSalePrice ? ` · ${money(p.lastSalePrice)}` : ""}`],
                ["Probate", p.probate ? `Filed ${day(p.probate.filedAt)} ${p.probate.caseNo ?? ""}` : "—"],
              ]}
              foot="County records can lag sales and deaths by months. Confirm ownership before contacting anyone."
            />
          )}
          {tab === "PROPERTY" && (
            <>
              <Rows
                rows={[
                  ["Beds / baths", `${p.beds ?? "—"} / ${p.baths ?? "—"}`],
                  ["Living area", p.sqft ? `${p.sqft.toLocaleString()} sq ft` : "—"],
                  ["Year built", p.yearBuilt ?? "—"],
                  ["Lot", p.lotSqft ? `${p.lotSqft.toLocaleString()} sq ft` : "—"],
                  ["Units", p.existingUnits ?? "—"],
                  ["Flood zone", p.floodZone ?? "—"],
                ]}
              />
              <div className="mt-3 font-mono text-[9px] tracking-[0.25em] text-muted">PERMITS</div>
              <ul className="mt-1 space-y-1 text-[11px]">
                {(p.permits ?? []).map((x) => (
                  <li key={x.id}>
                    <span className="font-mono text-muted">{day(x.issuedAt)}</span> {x.category.replace("_", " ")} · {x.type} {x.value ? `· ${money(x.value)}` : ""}
                  </li>
                ))}
                {!(p.permits ?? []).length && <li className="text-muted">No permits on record.</li>}
              </ul>
              <div className="mt-3 font-mono text-[9px] tracking-[0.25em] text-muted">CODE CASES + COMPLAINTS</div>
              <ul className="mt-1 space-y-1 text-[11px]">
                {(p.codeCases ?? []).map((c) => (
                  <li key={c.id} className="flex gap-2">
                    <BadgeChip b={badge({ source: c.source, detail: "", observedAt: c.openedAt }, now)} />
                    <span>
                      <span className="font-mono text-muted">{day(c.openedAt)}</span> {c.type} {c.status ? `· ${c.status}` : ""}
                    </span>
                  </li>
                ))}
                {!(p.codeCases ?? []).length && <li className="text-muted">None on record.</li>}
              </ul>
            </>
          )}
          {tab === "MONEY" && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Stat k="Estimated value" v={money(i.value.current)} />
                <Stat k="Potential equity" v={money(i.value.equity)} />
                <Stat k="Estimated rent" v={p.rentEstimate ? `${money(p.rentEstimate.value)}/mo` : "—"} />
                <Stat k="Potential ARV" v={money(i.value.arv)} />
              </div>
              <ul className="mt-2 space-y-1 text-[11px] text-ash">
                <li>Value: {i.value.currentBasis}</li>
                <li>ARV: {i.value.arvBasis}</li>
                <li>Debt: {i.value.debtBasis}</li>
              </ul>
              <div className="mt-3 font-mono text-[9px] tracking-[0.25em] text-muted">STRATEGIES</div>
              <table className="mt-1 w-full text-[11px]">
                <tbody>
                  {i.strategies.map((s) => (
                    <tr key={s.key} className="border-b border-elevated/60 align-top">
                      <td className="py-1 pr-2 text-bone">{STRATEGY_LABELS[s.key]}</td>
                      <td className="py-1 pr-2 text-right font-mono text-bone">{s.fit}</td>
                      <td className="py-1 text-ash">{s.economics}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-[10px] text-muted">Screening math with labeled assumptions. Run the full underwriting in Atlanta Deal Intelligence before any offer.</p>
            </>
          )}
          {tab === "ZONING" && (
            <>
              <Rows rows={[["District", p.zoning ?? "—"], ["Lot", p.lotSqft ? `${p.lotSqft.toLocaleString()} sq ft` : "—"], ["Transit", p.transitMi != null ? `${p.transitMi} mi` : "—"], ["Opportunity Zone", p.opportunityZone ? "Yes" : "—"]]} />
              <ul className="mt-2 space-y-1 text-[11px]">
                {i.engines.development.findings.map((f) => (
                  <li key={f.text}>▸ {f.text}</li>
                ))}
              </ul>
              <p className="mt-2 text-[10px] text-muted">The zoning screen uses the ordinance&apos;s minimum lot sizes. It is a lead, not an entitlement: confirm with the Office of Zoning &amp; Development.</p>
            </>
          )}
          {tab === "COMPS" && (
            <>
              {props.market ? (
                <Rows
                  rows={[
                    ["Area", props.market.key],
                    ["Median value / sq ft", money(props.market.medianPpsf)],
                    ["Renovated sales / sq ft", money(props.market.renovatedPpsf)],
                    ["Sales, last 12 mo", props.market.salesLast12 ?? "—"],
                    ["Sales, prior 12 mo", props.market.salesPrior12 ?? "—"],
                    ["Renovation permits, 12 mo", props.market.renovationPermits12 ?? "—"],
                    ["New-construction permits, 12 mo", props.market.newConstructionPermits12 ?? "—"],
                    ["Rent growth", props.market.rentGrowthPct != null ? `${props.market.rentGrowthPct}%` : "—"],
                  ]}
                  foot={`${SOURCES[props.market.source].label}${props.market.asOf ? ` · ${day(props.market.asOf)}` : ""}. Pick 3+ renovated comps by address before setting an ARV.`}
                />
              ) : (
                <p className="text-muted">No market context for this ZIP yet.</p>
              )}
            </>
          )}
          {tab === "CONTACT" && (
            <>
              <div className="flex flex-wrap gap-1">
                {(["script", "sms", "email", "letter"] as const).map((c) => (
                  <button key={c} disabled={props.pending} onClick={() => props.onDraft(c, false)} className="rounded border border-cyan/30 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-cyan hover:bg-cyan/10 disabled:opacity-50">
                    {c === "script" ? "Phone script" : c}
                  </button>
                ))}
                {props.claudeConfigured && props.draft && (
                  <button disabled={props.pending} onClick={() => props.onDraft(props.draft!.channel, true)} className="rounded border border-violet/40 px-2 py-1 font-mono text-[10px] tracking-wider text-violet">
                    ✦ POLISH
                  </button>
                )}
              </div>
              {props.draft && (
                <div className="mt-2">
                  <textarea readOnly value={props.draft.text} rows={10} className="w-full rounded border border-elevated bg-[#02040A] p-2 font-mono text-[11px] text-bone" />
                  <p className="mt-1 text-[10px] text-status-amber">⚖ {props.draft.compliance}</p>
                  <p className="text-[10px] text-muted">Draft only. You review and send it yourself, then log it below.</p>
                </div>
              )}
              <ContactLog acts={props.acts} />
            </>
          )}
          {tab === "ACTION" && (
            <>
              <div className="rounded border border-gold/30 bg-gold/5 p-2">
                <div className="font-mono text-[9px] tracking-[0.25em] text-gold">NEXT ACTION</div>
                <div className="font-mono text-sm font-bold text-bone">{action.verb}</div>
                <div className="text-[11px] text-ash">{action.why}</div>
              </div>
              <button onClick={props.onAsk} disabled={props.pending} className="mt-2 w-full rounded-control bg-cyan/15 py-2 font-mono text-[11px] font-bold tracking-[0.2em] text-cyan hover:bg-cyan/25 disabled:opacity-50">
                {props.pending ? "THINKING…" : "WHAT SHOULD I DO?"}
              </button>
              {props.oracle && (
                <div className="mt-2 whitespace-pre-wrap rounded border border-cyan/20 bg-[#02040A] p-2 text-[11px] leading-relaxed text-bone">
                  {props.oracle.text}
                  <div className="mt-1 font-mono text-[9px] text-muted">{props.oracle.by === "claude" ? "Claude, from the engine's facts only" : "Engine plan (no AI key set)"}</div>
                </div>
              )}
              <textarea value={props.note} onChange={(e) => props.setNote(e.target.value)} placeholder="Note (what they said, what you saw)…" rows={2} className="mt-2 w-full rounded border border-elevated bg-[#02040A] p-2 text-[11px] text-bone placeholder:text-muted" />
              <div className="mt-1 grid grid-cols-3 gap-1 font-mono text-[10px] tracking-wider">
                <Act onClick={() => props.onTouch("call", "no_answer")}>📞 NO ANSWER</Act>
                <Act onClick={() => props.onTouch("call", "left_message")}>📞 LEFT MSG</Act>
                <Act onClick={() => props.onTouch("call", "reached", { advance: false })}>📞 REACHED</Act>
                <Act onClick={() => props.onTouch("call", "interested", { advance: false })}>✅ INTERESTED</Act>
                <Act onClick={() => props.onTouch("call", "not_interested")}>✋ NOT NOW</Act>
                <Act onClick={() => props.onTouch("call", "wrong_number")}>✕ WRONG #</Act>
                <Act onClick={() => props.onTouch("letter", "sent")}>✉ LETTER SENT</Act>
                <Act onClick={() => props.onTouch("email", "sent")}>@ EMAIL SENT</Act>
                <Act onClick={() => props.onTouch("sms", "sent")}>💬 TEXT SENT</Act>
                <Act onClick={() => props.onTouch("verify", "done", { advance: false })}>🔎 VERIFIED</Act>
                <Act onClick={() => props.onTouch("note", null, { advance: false })}>✎ NOTE</Act>
                <Act onClick={() => props.onTouch("skip", null)}>⏭ SKIP 30D</Act>
              </div>
              <div className="mt-2 flex items-center gap-2 text-[11px]">
                <span className="text-muted">Stage</span>
                <select
                  id="ge-stage"
                  value={closing ? "CLOSED" : state?.stage ?? "DISCOVERED"}
                  onChange={(e) => {
                    const st = e.target.value as Stage;
                    if (st === "CLOSED") return setClosing(true);
                    setClosing(false);
                    props.onTouch("stage", null, { stage: st, advance: false });
                  }}
                  className="flex-1 rounded border border-elevated bg-[#02040A] px-2 py-1 font-mono text-[11px] text-bone"
                >
                  {STAGES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </div>
              {closing && (
                <form
                  className="mt-1 flex items-center gap-2 text-[11px]"
                  onSubmit={(e) => {
                    e.preventDefault();
                    setClosing(false);
                    props.onTouch("stage", null, { stage: "CLOSED", amount: Number(closeAmt.replace(/[$,\s]/g, "")) || 0, advance: false });
                  }}
                >
                  <label htmlFor="ge-close-amt" className="text-muted">Closed for $</label>
                  <input id="ge-close-amt" autoFocus inputMode="decimal" value={closeAmt} onChange={(e) => setCloseAmt(e.target.value)} placeholder="assignment fee / profit" className="min-w-0 flex-1 rounded border border-elevated bg-[#02040A] px-2 py-1 font-mono text-bone" />
                  <button className="rounded bg-gold/20 px-2 py-1 font-mono text-[10px] tracking-wider text-gold">LOG CLOSE</button>
                </form>
              )}
              {state?.nextFollowUp && <div className="mt-1 font-mono text-[10px] text-gold">FOLLOW-UP SCHEDULED {day(state.nextFollowUp)}</div>}
              <ContactLog acts={props.acts} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Act({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="rounded border border-elevated bg-elevated/40 px-1 py-1.5 text-ash hover:border-cyan/40 hover:text-bone">
      {children}
    </button>
  );
}

function Rows({ rows, foot }: { rows: [string, React.ReactNode][]; foot?: string }) {
  return (
    <>
      <table className="w-full text-[12px]">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k} className="border-b border-elevated/60">
              <td className="py-1 pr-2 text-muted">{k}</td>
              <td className="py-1 text-right text-bone">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {foot && <p className="mt-2 text-[10px] text-muted">{foot}</p>}
    </>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded border border-elevated bg-[#02040A] p-2">
      <div className="font-mono text-[9px] tracking-[0.2em] text-muted">{k.toUpperCase()}</div>
      <div className="font-mono text-base text-bone">{v}</div>
    </div>
  );
}

function ContactLog({ acts }: { acts: Activity[] }) {
  return (
    <div className="mt-3">
      <div className="font-mono text-[9px] tracking-[0.25em] text-muted">CONTACT LOG</div>
      <ol className="mt-1 space-y-1">
        {acts.map((a) => (
          <li key={a.id} className="text-[11px]">
            <span className="font-mono text-muted">{a.at.slice(5, 16).replace("T", " ")}</span> <span className="text-bone">{ACTION_LABELS[a.kind].toUpperCase()}</span>
            {a.outcome ? <span className="text-ash"> · {a.outcome.replace("_", " ")}</span> : null}
            {a.stage ? <span className="text-cyan"> → {a.stage}</span> : null}
            {a.note ? <div className="ml-4 text-ash">{a.note}</div> : null}
          </li>
        ))}
        {!acts.length && <li className="text-[11px] text-muted">🟡 Not contacted yet.</li>}
      </ol>
    </div>
  );
}

// ─── Pipeline / Money / Sources ───────────────────────────────────────────────

function Pipeline({ intel, states, onOpen }: { intel: Intel[]; states: Record<string, DeskState>; onOpen: (id: string) => void }) {
  const cols = STAGES.filter((s) => s !== "DEAD");
  return (
    <div>
      <h2 className="mb-3 font-mono text-[11px] tracking-[0.3em] text-cyan">DEAL PIPELINE</h2>
      <div className="flex gap-2 overflow-x-auto pb-2">
        {cols.map((s) => {
          const items = intel.filter((i) => (states[i.p.id]?.stage ?? "DISCOVERED") === s);
          return (
            <div key={s} className="w-48 shrink-0 rounded border border-cyan/15 bg-[#050912] p-2">
              <div className="mb-2 flex justify-between font-mono text-[10px] tracking-wider text-ash">
                <span>{s}</span>
                <span className="text-bone">{items.length}</span>
              </div>
              <ul className="space-y-1">
                {items.slice(0, s === "DISCOVERED" ? 12 : 50).map((i) => (
                  <li key={i.p.id}>
                    <button onClick={() => onOpen(i.p.id)} className="w-full rounded bg-elevated/50 px-2 py-1 text-left text-[11px] hover:bg-elevated">
                      <span className="font-mono text-cyan">{i.score}</span> {i.p.address}
                    </button>
                  </li>
                ))}
                {s === "DISCOVERED" && items.length > 12 && <li className="text-[10px] text-muted">+{items.length - 12} more in the queue</li>}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MoneyView({ stats }: { stats: ReturnType<typeof moneyStats> }) {
  const tiles: [string, string][] = [
    ["Opportunities", stats.opportunities.toLocaleString()],
    ["High priority", stats.highPriority.toLocaleString()],
    ["Estimated equity", kmoney(stats.estimatedEquity)],
    ["Potential deal value", kmoney(stats.potentialDealValue)],
    ["Active conversations", String(stats.activeConversations)],
    ["Contracts", String(stats.contracts)],
    ["Closed", stats.closed ? `${stats.closed} · ${money(stats.closedValue)}` : "0"],
  ];
  const max = Math.max(1, stats.funnel[0].count);
  return (
    <div>
      <h2 className="mb-3 font-mono text-[11px] tracking-[0.3em] text-cyan">WHERE IS THE MONEY?</h2>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {tiles.map(([k, v]) => (
          <div key={k} className="rounded border border-cyan/15 bg-[#050912] p-3">
            <div className="font-mono text-[9px] tracking-[0.25em] text-muted">{k.toUpperCase()}</div>
            <div className="mt-1 font-mono text-2xl font-bold text-bone">{v}</div>
          </div>
        ))}
      </div>
      <div className="mt-5 font-mono text-[9px] tracking-[0.25em] text-muted">FUNNEL</div>
      <div className="mt-2 space-y-1">
        {stats.funnel.map((f) => (
          <div key={f.label} className="flex items-center gap-2 text-[12px]">
            <span className="w-28 text-ash">{f.label}</span>
            <span className="h-4 rounded-sm bg-cyan/70" style={{ width: `${Math.max(2, (f.count / max) * 70)}%` }} />
            <span className="font-mono text-bone">{f.count}</span>
          </div>
        ))}
      </div>
      <p className="mt-4 text-[10px] text-muted">Equity and deal value are screening estimates (see each dossier&apos;s MONEY tab for the basis). Closed $ is what you entered when moving a deal to CLOSED.</p>
    </div>
  );
}

function SourcesView({ meta, now, shown, total }: { meta: { example: boolean; generatedAt: string; sources: FeedSource[] }; now: Date; shown: number; total: number }) {
  const ROADMAP: [string, string][] = [
    ["Permits + Building Complaints", "Live layer · renovation, new construction, demolition, current complaints"],
    ["ATL311 service requests", "Layer or CSV export (--atl311) · condition requests only, a 2nd independent distress signal"],
    ["Deeds + security deeds", "Clerk's index export, GSCCCA or records request (--deeds) · transfers, open loans, cancellations → real equity"],
    ["FEMA flood zones", "NFHL layer 28, point-in-polygon on every parcel (risk engine)"],
    ["Opportunity Zones", "Federal tract polygons (development engine) · set the layer URL via --discover"],
    ["MARTA rail stations", "MARTA GTFS stops.txt → distance to the nearest station"],
    ["DeKalb, Cobb, Gwinnett, Clayton", "Each county's parcel layer, swept by ZIP (--county dekalb:30032)"],
    ["Tax delinquency, foreclosure notices, probate", "Records-request lists (--tax, --foreclosure, --probate)"],
  ];
  return (
    <div>
      <h2 className="mb-1 font-mono text-[11px] tracking-[0.3em] text-cyan">DATA FRESHNESS + PROVENANCE</h2>
      <p className="mb-3 text-[11px] text-ash">
        {meta.example ? "Example data: no feed has run yet." : `Feed generated ${meta.generatedAt.slice(0, 16).replace("T", " ")} UTC.`} Showing {shown.toLocaleString()} of {total.toLocaleString()} properties (top by score). Badges: 🟢 VERIFIED government record within its freshness window · 🟡 INFERRED by an engine rule or derived · 🔴 STALE record or history-only dataset.
      </p>
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-left font-mono text-[9px] tracking-wider text-muted">
            <th className="py-1">SOURCE</th>
            <th>RECORDS</th>
            <th>RECORD DATES</th>
            <th>PULLED</th>
            <th>STATUS</th>
          </tr>
        </thead>
        <tbody>
          {meta.sources.map((s) => {
            const age = s.maxDate ? Math.round((now.getTime() - new Date(s.maxDate).getTime()) / 86_400_000) : null;
            return (
              <tr key={s.id} className="border-t border-elevated/60 align-top">
                <td className="py-1 pr-2 text-bone">
                  {s.label}
                  {s.unmapped?.length ? <div className="text-[10px] text-status-amber">unmapped: {s.unmapped.join(", ")}</div> : null}
                </td>
                <td className="font-mono">{s.records.toLocaleString()}</td>
                <td className="font-mono text-ash">{s.minDate ? `${day(s.minDate)} → ${day(s.maxDate)}` : "—"}</td>
                <td className="font-mono text-ash">{day(s.pulledAt)}</td>
                <td>{age == null ? <BadgeChip b="VERIFIED" /> : age > 60 ? <BadgeChip b="STALE" /> : <BadgeChip b="VERIFIED" />}</td>
              </tr>
            );
          })}
          {!meta.sources.length && (
            <tr>
              <td colSpan={5} className="py-2 text-muted">
                Run <code className="text-cyan">node tools/atlanta-intel/atlanta-feed.mjs --discover</code>, set the layer URLs, then run the feed.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <div className="mt-5 font-mono text-[9px] tracking-[0.25em] text-muted">FREE SOURCES WIRED INTO THE FEED</div>
      <ul className="mt-1 space-y-1 text-[11px]">
        {ROADMAP.map(([k, v]) => (
          <li key={k}>
            <span className="text-bone">{k}</span> <span className="text-ash">· {v}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
