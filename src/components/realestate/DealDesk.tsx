"use client";

/**
 * GOD'S EYE — REAL ESTATE COMMAND. The Deal Desk.
 * SEE (map) → DETECT (missions) → INVESTIGATE (dossier) → CONTACT → FOLLOW UP → DEAL.
 * God's Eye sees. Oracle analyzes. The Deal Desk acts. You close.
 */
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { MISSIONS, SOURCES, STRATEGY_LABELS, TIMELINE_LABELS, analyze, badge, chooseRent, type FieldNotes, type Badge, type Evidence, type Intel, type MarketContext, type Mission } from "@/lib/re-intel";
import {
  STAGES,
  ACTION_LABELS,
  applyActivity,
  applyCommand,
  buildQueue,
  moneyStats,
  nextAction,
  parseCommand,
  todayBrief,
  type Activity,
  type ActivityKind,
  type CommandFilter,
  type DeskState,
  type Outcome,
  type Stage,
} from "@/lib/re-desk";
import type { FeedSource } from "@/lib/re-desk-store";
import type { Channel } from "@/lib/re-outreach";
import { askOracle, draftMessage, logTouch, saveBuyer, importBuyers, saveContract, saveFieldwork, addPhoto, deletePhoto } from "@/app/realestate/actions";
import { CATALOG, GUIDE, ISSUES, REASONS, applyFieldwork, blankNotes, blankScope, computeScope, type Fieldwork, type Level, type Photo, type ScopeLine } from "@/lib/re-field";
import { buildOffer, offerLetter, DEFAULT_OFFER, type OfferSettings } from "@/lib/re-offer";
import { newContract, deadlines, progress, upcomingDeadlines, type Contract, type Severity } from "@/lib/re-contract";
import { matchBuyers, dealSheet, PROP_TYPE_LABELS, BUYER_STRATEGIES, type Buyer, type BuyerMatch, type PropType } from "@/lib/re-buyers";
import type { Basemap, MapPoint } from "./GodsEyeMap";

const GodsEyeMap = dynamic(() => import("./GodsEyeMap").then((m) => m.GodsEyeMap), { ssr: false, loading: () => <div className="absolute inset-0 grid place-items-center font-mono text-xs text-cyan">ACQUIRING ORBIT…</div> });

type View = "today" | "desk" | "pipeline" | "buyers" | "money" | "sources";
type Tab = "OWNER" | "PROPERTY" | "TALK" | "WALK" | "MONEY" | "OFFER" | "ZONING" | "COMPS" | "CONTACT" | "BUYERS" | "CONTRACT" | "ACTION";
const TABS: Tab[] = ["ACTION", "TALK", "WALK", "OFFER", "BUYERS", "CONTRACT", "OWNER", "PROPERTY", "MONEY", "ZONING", "COMPS", "CONTACT"];
const SEV_CLS: Record<Severity, string> = { done: "text-status-green", overdue: "text-status-red", red: "text-status-red", amber: "text-status-amber", ok: "text-ash" };
const OFFER_KEY = "godseye-offer-settings-v1";

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
  intel: intelIn,
  initialStates,
  initialActivity,
  initialBuyers,
  initialContracts,
  initialFieldwork,
  meta,
  market,
  nowIso,
  claudeConfigured,
  totalProperties,
}: {
  intel: Intel[];
  initialStates: Record<string, DeskState>;
  initialActivity: Activity[];
  initialBuyers: Buyer[];
  initialContracts: Contract[];
  initialFieldwork: Record<string, Fieldwork>;
  meta: { example: boolean; generatedAt: string; sources: FeedSource[]; note?: string };
  market: Record<string, MarketContext>;
  nowIso: string;
  claudeConfigured: boolean;
  totalProperties: number;
}) {
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const [states, setStates] = useState(initialStates);
  const [fieldwork, setFieldwork] = useState(initialFieldwork);
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  // Field work saved this session re-scores that property on the spot (comps reused from the server's pass).
  const intel = useMemo(
    () =>
      (dirty.size ? intelIn.map((i) => (dirty.has(i.p.id) ? analyze(applyFieldwork({ ...i.p, rehabBudget: null, fieldNotes: null }, fieldwork[i.p.id]), market, now, null, i.comps) : i)) : [...intelIn]).sort(
        (a, b) => b.score - a.score || b.confidence - a.confidence,
      ),
    [intelIn, dirty, fieldwork, market, now],
  );
  const [activity, setActivity] = useState(initialActivity);
  const [buyers, setBuyers] = useState(initialBuyers);
  const [contracts, setContracts] = useState(initialContracts);
  const [offerSettings, setOfferSettingsState] = useState<OfferSettings>(DEFAULT_OFFER);
  useEffect(() => {
    // Loaded after mount so the server render and the first client render match.
    try {
      setOfferSettingsState({ ...DEFAULT_OFFER, ...JSON.parse(localStorage.getItem(OFFER_KEY) ?? "{}") });
    } catch {
      /* storage unavailable: defaults */
    }
  }, []);
  const setOfferSettings = (o: OfferSettings) => {
    setOfferSettingsState(o);
    try {
      localStorage.setItem(OFFER_KEY, JSON.stringify(o));
    } catch {
      /* storage unavailable: settings last for this visit */
    }
  };
  const contractFor = useMemo(() => new Map(contracts.map((c) => [c.parcelId, c])), [contracts]);
  const dueSoon = useMemo(() => upcomingDeadlines(contracts, now, 7), [contracts, now]);
  const [mission, setMission] = useState<Mission | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<View>("today");
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
  const brief = useMemo(() => todayBrief(intel, states, activity, now), [intel, states, activity, now]);
  const buyerMatches = useMemo(() => new Map(intel.map((i) => [i.p.id, matchBuyers(i, buyers)])), [intel, buyers]);
  const sel = selectedId ? byId.get(selectedId) ?? null : null;
  const selState = sel ? states[sel.p.id] : undefined;
  const selAction = sel ? nextAction(sel, selState, now) : null;
  const selActivity = sel ? activity.filter((a) => a.parcelId === sel.p.id) : [];
  const compPoints = useMemo(
    () => (sel?.comps ? [...sel.comps.renovated, ...sel.comps.asIs].map((c) => ({ id: c.id, lat: c.lat, lng: c.lng, renovated: c.renovated, label: `${c.address} · $${Math.round(c.price / 1000)}K · $${c.ppsf}/sf` })) : []),
    [sel],
  );

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

  function touch(kind: ActivityKind, outcome: Outcome, opts: { stage?: Stage; amount?: number | null; advance?: boolean; note?: string } = {}) {
    if (!sel) return;
    const id = sel.p.id;
    const text = [opts.note, note].filter(Boolean).join(" · ");
    const optimistic: Activity = { id: `local-${Date.now()}`, parcelId: id, at: new Date().toISOString(), kind, outcome, note: text || undefined, stage: opts.stage, amount: opts.amount ?? null };
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
    if (opts.advance !== false && kind !== "note" && kind !== "stage" && kind !== "buyer") {
      const next = queue.find((q) => q.intel.p.id !== id);
      if (next) setTimeout(() => select(next.intel.p.id), 650);
    }
  }

  function persistContract(c: Contract, statusChanged: boolean) {
    setContracts((list) => [c, ...list.filter((x) => x.parcelId !== c.parcelId)]);
    start(async () => {
      try {
        const r = await saveContract(c, statusChanged);
        setContracts(r.contracts);
        if (r.state) {
          setStates((s) => ({ ...s, [c.parcelId]: r.state! }));
          setActivity((a) => [{ id: `local-${Date.now()}`, parcelId: c.parcelId, at: new Date().toISOString(), kind: "stage", outcome: null, stage: r.state!.stage, note: c.status === "active" ? "Under contract" : c.status === "closed" ? "Closed" : "Contract cancelled" }, ...a]);
          flash(`${c.address}: ${r.state.stage}`);
        }
      } catch (e) {
        flash(`Not saved: ${(e as Error).message}`);
      }
    });
  }

  function persistField(fw: Fieldwork, action: () => Promise<Fieldwork>, msg: string) {
    setFieldwork((f) => ({ ...f, [fw.parcelId]: fw }));
    setDirty((d) => new Set(d).add(fw.parcelId));
    start(async () => {
      try {
        const saved = await action();
        setFieldwork((f) => ({ ...f, [fw.parcelId]: saved }));
        flash(msg);
      } catch (e) {
        flash(`Not saved: ${(e as Error).message}`);
      }
    });
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
        {(["today", "desk", "pipeline", "buyers", "money", "sources"] as View[]).map((v) => (
          <button key={v} onClick={() => setView(v)} className={`rounded px-2 py-1 uppercase ${view === v ? "bg-cyan/15 text-cyan" : "hover:text-bone"}`}>
            {v === "today" ? "Today" : v === "desk" ? "Desk" : v === "money" ? "Money" : v === "sources" ? "Data" : v === "buyers" ? "Buyers" : "Pipeline"}
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
                  {(buyerMatches.get(i.p.id)?.matches.length ?? 0) > 0 && <span className="text-gold" title="Buyers on file who match">◆{buyerMatches.get(i.p.id)!.matches.length}</span>}
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
      buyerMatch={buyerMatches.get(sel.p.id) ?? { matches: [], nearMisses: [] }}
      contract={contractFor.get(sel.p.id) ?? null}
      fieldwork={fieldwork[sel.p.id] ?? { parcelId: sel.p.id, scope: null, walkedAt: null, photos: [], convos: [], updatedAt: nowIso }}
      onField={persistField}
      onContract={persistContract}
      offerSettings={offerSettings}
      setOfferSettings={setOfferSettings}
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
          <GodsEyeMap
            points={points}
            selectedId={selectedId}
            onSelect={select}
            basemap={basemap}
            terrain={terrain}
            comps={compPoints}
          />
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
            <div className="absolute inset-0 z-10 overflow-y-auto bg-[#02040A]/92 p-4 backdrop-blur-sm">
              {view === "today" && <TodayView brief={brief} onOpen={select} deadlines={dueSoon} />}
              {view === "pipeline" && <Pipeline intel={intel} states={states} onOpen={select} contracts={contractFor} now={now} />}
              {view === "buyers" && (
                <BuyersView
                  buyers={buyers}
                  counts={new Map(buyers.map((b) => [b.id, intel.filter((i) => buyerMatches.get(i.p.id)?.matches.some((m) => m.buyer.id === b.id)).length]))}
                  pending={pending}
                  onSave={(b) =>
                    start(async () => {
                      try {
                        setBuyers(await saveBuyer(b));
                        flash(`Saved ${b.name}`);
                      } catch (e) {
                        flash((e as Error).message);
                      }
                    })
                  }
                  onImport={(csv) =>
                    start(async () => {
                      try {
                        const r = await importBuyers(csv);
                        setBuyers(r.buyers);
                        flash(`Imported ${r.added} buyer${r.added === 1 ? "" : "s"}${r.errors.length ? ` · ${r.errors.length} row(s) skipped: ${r.errors.slice(0, 2).join("; ")}` : ""}`);
                      } catch (e) {
                        flash((e as Error).message);
                      }
                    })
                  }
                />
              )}
              {view === "money" && <MoneyView stats={stats} feesUnderContract={contracts.filter((c) => c.status === "active").reduce((s, c) => s + (c.assignmentFee ?? 0), 0)} buyers={buyers.filter((b) => b.active).length} matched={intel.filter((i) => (buyerMatches.get(i.p.id)?.matches.length ?? 0) > 0).length} />}
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
  buyerMatch: { matches: BuyerMatch[]; nearMisses: BuyerMatch[] };
  contract: Contract | null;
  fieldwork: Fieldwork;
  onField: (fw: Fieldwork, action: () => Promise<Fieldwork>, msg: string) => void;
  onContract: (c: Contract, statusChanged: boolean) => void;
  offerSettings: OfferSettings;
  setOfferSettings: (o: OfferSettings) => void;
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
  onTouch: (k: ActivityKind, o: Outcome, opts?: { stage?: Stage; amount?: number | null; advance?: boolean; note?: string }) => void;
}) {
  const { i, state, action, tab, setTab, now } = props;
  const [closing, setClosing] = useState(false);
  const [sheetFor, setSheetFor] = useState<string | null>(null);
  const [showLetter, setShowLetter] = useState(false);
  const offer = useMemo(() => buildOffer(i, props.buyerMatch.matches, props.offerSettings), [i, props.buyerMatch, props.offerSettings]);
  const [draftC, setDraftC] = useState<Contract | null>(null);
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
          {props.buyerMatch.matches.length > 0 && (
            <button onClick={() => setTab("BUYERS")} className="text-gold">
              · ◆ {props.buyerMatch.matches.length} BUYER{props.buyerMatch.matches.length > 1 ? "S" : ""} MATCH
            </button>
          )}
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
                <Stat k="Estimated rent" v={chooseRent(p) ? `${money(chooseRent(p)!.value)}/mo` : "—"} />
                <Stat k="Potential ARV" v={money(i.value.arv)} />
              </div>
              <ul className="mt-2 space-y-1 text-[11px] text-ash">
                <li>Value: {i.value.currentBasis}</li>
                <li>ARV: {i.value.arvBasis}</li>
                <li>Debt: {i.value.debtBasis}</li>
                {(p.rentEstimates ?? []).map((r) => (
                  <li key={r.source}>
                    Rent: {money(r.value)}/mo · {r.basis} <span className="text-muted">({SOURCES[r.source].label})</span>
                  </li>
                ))}
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
              {i.comps ? (
                <div className="mb-3">
                  <div className="font-mono text-[9px] tracking-[0.25em] text-muted">PUBLIC-RECORD COMPS · WITHIN {i.comps.radiusMi} MI · ON THE MAP</div>
                  {(["renovated", "asIs"] as const).map((k) => (
                    <div key={k} className="mt-2">
                      <div className={`font-mono text-[10px] tracking-wider ${k === "renovated" ? "text-gold" : "text-ash"}`}>
                        {k === "renovated" ? "◆ RENOVATED" : "◇ AS-IS"} · {i.comps![k].length} sale{i.comps![k].length === 1 ? "" : "s"}
                        {k === "renovated" && i.comps!.arv != null ? ` → ARV ${money(i.comps!.arv)}` : ""}
                        {k === "asIs" && i.comps!.asIsValue != null ? ` → as-is ${money(i.comps!.asIsValue)}` : ""}
                        {i.comps![k].length < 3 ? " · fewer than 3: not used" : ""}
                      </div>
                      <table className="mt-1 w-full text-[11px]">
                        <tbody>
                          {i.comps![k].map((c) => (
                            <tr key={c.id} className="border-b border-elevated/60 align-top">
                              <td className="py-1 pr-2 text-bone">
                                {c.address}
                                <div className="text-[10px] text-muted">{c.why}</div>
                              </td>
                              <td className="py-1 pr-2 text-right font-mono text-ash">{c.miles} mi</td>
                              <td className="py-1 pr-2 text-right font-mono text-ash">{day(c.saleDate)}</td>
                              <td className="py-1 text-right font-mono text-bone">
                                {kmoney(c.price)}
                                <div className="text-[10px] text-muted">${c.ppsf}/sf</div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                  <p className="mt-2 text-[10px] text-muted">Arm&apos;s-length sales only (quitclaim, estate and foreclosure deeds dropped), ±30% of this house&apos;s size, last 12 months (18 at 1.5 mi). Renovated = a renovation permit in the 2 years before the sale. Walk the comps before you trust the ARV.</p>
                </div>
              ) : (
                <p className="mb-3 text-[11px] text-muted">No recorded sales close enough to use as comps. Sweep this ZIP in the feed (--zip) to pull its sales.</p>
              )}
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
          {tab === "TALK" && (
            <TalkPanel
              fw={props.fieldwork}
              now={now}
              onSave={(n) => {
                const fw = { ...props.fieldwork, convos: [n, ...props.fieldwork.convos] };
                props.onField(fw, () => saveFieldwork({ parcelId: fw.parcelId, scope: fw.scope, walkedAt: fw.walkedAt, convos: fw.convos }), "Conversation saved · score updated");
                // A logged conversation is a reached call: ready-to-sell owners move to OPPORTUNITY, "not selling" snoozes 90 days.
                const outcome = n.timeline === "not_selling" ? "not_interested" : n.timeline === "asap" || n.timeline === "30_90" ? "interested" : "reached";
                props.onTouch("call", outcome, { advance: false, note: `Talked with ${n.spokeWith}: ${TIMELINE_LABELS[n.timeline].toLowerCase()}${n.askingPrice ? `, asking $${n.askingPrice.toLocaleString("en-US")}` : ""}` });
              }}
            />
          )}
          {tab === "WALK" && (
            <WalkPanel
              i={i}
              fw={props.fieldwork}
              now={now}
              onSaveScope={(scope) => {
                const fw = { ...props.fieldwork, scope, walkedAt: scope ? new Date().toISOString() : null };
                props.onField(fw, () => saveFieldwork({ parcelId: fw.parcelId, scope: fw.scope, walkedAt: fw.walkedAt, convos: fw.convos }), scope ? "Walk-through saved · rehab, offer and buyer prices updated" : "Scope cleared");
              }}
              onAddPhoto={(ph) => props.onField({ ...props.fieldwork, photos: [...props.fieldwork.photos, ph] }, () => addPhoto(props.fieldwork.parcelId, ph), "Photo saved")}
              onDeletePhoto={(id) => props.onField({ ...props.fieldwork, photos: props.fieldwork.photos.filter((x) => x.id !== id) }, () => deletePhoto(props.fieldwork.parcelId, id), "Photo removed")}
            />
          )}
          {tab === "OFFER" && (
            <>
              <div className="grid grid-cols-3 gap-2">
                <Stat k="Opening" v={money(offer.opening)} />
                <Stat k="Target" v={money(offer.target)} />
                <Stat k="Walk-away" v={money(offer.walkAway)} />
              </div>
              <div className={`mt-2 rounded border p-2 text-[11px] ${offer.feasible === "yes" ? "border-status-green/40 text-status-green" : offer.feasible === "tight" ? "border-status-amber/40 text-status-amber" : offer.feasible === "no" ? "border-status-red/40 text-status-red" : "border-elevated text-ash"}`}>
                {offer.feasible === "yes" ? "✓ " : offer.feasible === "no" ? "✕ " : offer.feasible === "tight" ? "◐ " : "? "}
                {offer.verdict}
              </div>
              <table className="mt-2 w-full text-[11px]">
                <tbody>
                  {offer.lines.map((l) => (
                    <tr key={l.label} className="border-b border-elevated/60 align-top">
                      <td className="py-1 pr-2 text-bone">
                        {l.label}
                        <div className="text-[10px] text-muted">{l.basis}</div>
                      </td>
                      <td className="py-1 text-right font-mono text-bone">{money(l.value)}</td>
                    </tr>
                  ))}
                  <tr className="border-b border-elevated/60 align-top">
                    <td className="py-1 pr-2 text-bone">
                      Seller must clear
                      <div className="text-[10px] text-muted">{offer.sellerFloorBasis}</div>
                    </td>
                    <td className="py-1 text-right font-mono text-bone">{money(offer.sellerFloor)}</td>
                  </tr>
                </tbody>
              </table>
              <div className="mt-3 font-mono text-[9px] tracking-[0.25em] text-muted">SELLER&apos;S CHOICE (WHAT THEY POCKET)</div>
              <Rows
                rows={[
                  ["Your offer at target", money(offer.netAtTarget)],
                  ["Listing it as-is", money(offer.retailNet)],
                ]}
                foot={`Listing: ${offer.retailNetBasis}. Your offer: target − payoff − back taxes, you pay closing. Use this to explain your number, not to pressure anyone.`}
              />
              <details className="mt-2 text-[11px]">
                <summary className="cursor-pointer font-mono text-[10px] tracking-wider text-cyan">YOUR OFFER RULES</summary>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  {(
                    [
                      ["minFee", "Minimum fee $", 1],
                      ["targetFee", "Target fee $", 1],
                      ["bufferPct", "Closing buffer %", 100],
                      ["openingDiscountPct", "Opening below target %", 100],
                    ] as const
                  ).map(([k, l, mult]) => (
                    <label key={k} className="text-[10px] text-muted">
                      {l}
                      <input
                        id={`of-${k}`}
                        inputMode="decimal"
                        value={Math.round(props.offerSettings[k] * mult * 100) / 100}
                        onChange={(e) => {
                          const v = Number(e.target.value.replace(/[$,%\s]/g, ""));
                          if (isFinite(v)) props.setOfferSettings({ ...props.offerSettings, [k]: v / mult });
                        }}
                        className="w-full rounded border border-elevated bg-[#02040A] px-2 py-1 font-mono text-bone"
                      />
                    </label>
                  ))}
                </div>
              </details>
              <button onClick={() => setShowLetter(!showLetter)} className="mt-2 rounded border border-cyan/30 px-2 py-1 font-mono text-[10px] tracking-wider text-cyan hover:bg-cyan/10">
                OFFER LETTER (LOI)
              </button>
              {showLetter && <textarea readOnly value={offerLetter(i, offer)} rows={14} onFocus={(e) => e.currentTarget.select()} className="mt-2 w-full rounded border border-elevated bg-[#02040A] p-2 font-mono text-[11px] text-bone" />}
              <p className="mt-2 text-[10px] text-muted">The letter is non-binding. Use an attorney-prepared Georgia purchase agreement for the real contract.</p>
            </>
          )}
          {tab === "CONTRACT" && (
            <ContractPanel
              i={i}
              contract={props.contract}
              draft={draftC}
              setDraft={setDraftC}
              suggestedPrice={offer.target}
              matches={props.buyerMatch.matches}
              now={now}
              onSave={props.onContract}
            />
          )}
          {tab === "BUYERS" && (
            <>
              {!props.buyerMatch.matches.length && <p className="text-[11px] text-muted">No buyer on file matches every criterion. Near misses below; add buyers under Buyers.</p>}
              {[...props.buyerMatch.matches.map((m) => ({ m, near: false })), ...props.buyerMatch.nearMisses.map((m) => ({ m, near: true }))].map(({ m, near }) => (
                <div key={m.buyer.id} className={`mb-2 rounded border p-2 ${near ? "border-elevated" : "border-gold/30 bg-gold/5"}`}>
                  <div className="flex items-baseline gap-2">
                    <span className={`font-mono text-sm font-bold ${near ? "text-ash" : "text-gold"}`}>{m.fit}</span>
                    <span className="font-semibold text-bone">{m.buyer.name}</span>
                    <span className="truncate text-[11px] text-ash">{m.buyer.company}</span>
                    {near && <span className="ml-auto font-mono text-[9px] tracking-wider text-status-amber">NEAR MISS</span>}
                  </div>
                  <div className="mt-0.5 text-[11px] text-ash">{m.why.join(" · ")}</div>
                  {near && <div className="text-[11px] text-status-amber">✕ {m.misses[0]}</div>}
                  <div className="mt-1 text-[11px]">
                    <span className="text-muted">Their likely price:</span> <span className="font-mono text-bone">{money(m.price)}</span> <span className="text-muted">· {m.priceBasis}</span>
                  </div>
                  {(m.buyer.phone || m.buyer.email) && <div className="select-all font-mono text-[11px] text-cyan">{[m.buyer.phone, m.buyer.email].filter(Boolean).join(" · ")}</div>}
                  <div className="mt-1 flex gap-1 font-mono text-[10px] tracking-wider">
                    <button onClick={() => setSheetFor(sheetFor === m.buyer.id ? null : m.buyer.id)} className="rounded border border-cyan/30 px-2 py-1 text-cyan hover:bg-cyan/10">
                      DEAL SHEET
                    </button>
                    <button onClick={() => props.onTouch("buyer", "sent", { note: `Sent to ${m.buyer.name}${m.buyer.company ? ` (${m.buyer.company})` : ""}`, advance: false })} className="rounded border border-gold/40 px-2 py-1 text-gold hover:bg-gold/10">
                      ✓ LOG SENT
                    </button>
                  </div>
                  {sheetFor === m.buyer.id && (
                    <textarea readOnly value={dealSheet(i, m)} rows={12} className="mt-2 w-full rounded border border-elevated bg-[#02040A] p-2 font-mono text-[11px] text-bone" onFocus={(e) => e.currentTarget.select()} />
                  )}
                </div>
              ))}
              <p className="mt-2 text-[10px] text-muted">The deal sheet holds property facts, ARV basis and comps, never owner details or their distress. Have a Georgia real-estate attorney review your assignment contract and how you market it.</p>
              <ContactLog acts={props.acts.filter((a) => a.kind === "buyer")} />
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

function TodayView({ brief, onOpen, deadlines: due }: { brief: ReturnType<typeof todayBrief>; onOpen: (id: string) => void; deadlines: ReturnType<typeof upcomingDeadlines> }) {
  const start = brief.due[0]?.intel ?? brief.top[0]?.intel;
  const when = new Date(`${brief.date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
  const tiles: [string, string, string][] = [
    ["Follow-ups due", String(brief.due.length), brief.due.length ? "do these first" : "none due"],
    ["New signals · 7 days", String(brief.newSignals.length), "untouched properties"],
    ["Next foreclosure sale", brief.saleDate.slice(5).replace("-", "/"), `${brief.daysToSale} days · first Tuesday`],
    ["Probate · 90 days", String(brief.probate.length), "estates with real property"],
    ["Contract deadlines", String(due.length), due.length ? `next: ${due[0].label.toLowerCase()} ${due[0].daysLeft < 0 ? "OVERDUE" : `in ${due[0].daysLeft}d`}` : "none in 7 days"],
  ];
  const Row = ({ i, tag }: { i: Intel; tag: string }) => (
    <li>
      <button onClick={() => onOpen(i.p.id)} className="flex w-full items-baseline gap-3 rounded px-2 py-1.5 text-left hover:bg-elevated/70">
        <span className="w-8 font-mono text-[13px] font-bold text-bone">{i.score}</span>
        <span className="min-w-0 flex-1 truncate text-[12px] text-bone">{i.p.address}</span>
        <span className="font-mono text-[10px] tracking-wider text-cyan">{tag}</span>
      </button>
    </li>
  );
  return (
    <div className="mx-auto max-w-3xl">
      <div className="font-mono text-[10px] tracking-[0.3em] text-muted">COMMAND CENTER · {when.toUpperCase()}</div>
      <h2 className="mt-1 font-display text-2xl font-bold">
        {brief.due.length + brief.top.length} on the desk today
        {brief.touchedYesterday ? <span className="ml-2 text-sm font-normal text-ash">· {brief.touchedYesterday} touches in the last 24 h</span> : null}
      </h2>
      {due.length > 0 && (
        <div className="mt-4 rounded border border-status-red/30 bg-status-red/5 p-2">
          <div className="font-mono text-[9px] tracking-[0.25em] text-status-red">CONTRACT DEADLINES · NEXT 7 DAYS</div>
          <ul className="mt-1">
            {due.map((d) => (
              <li key={d.contract.parcelId + d.key}>
                <button onClick={() => onOpen(d.contract.parcelId)} className="flex w-full items-baseline gap-3 rounded px-2 py-1 text-left text-[12px] hover:bg-elevated/70">
                  <span className={`w-20 font-mono text-[11px] font-bold ${SEV_CLS[d.severity]}`}>{d.daysLeft < 0 ? `${-d.daysLeft}d LATE` : d.daysLeft === 0 ? "TODAY" : `${d.daysLeft}d`}</span>
                  <span className="text-bone">{d.label}</span>
                  <span className="min-w-0 flex-1 truncate text-ash">{d.contract.address}</span>
                  <span className="font-mono text-[10px] text-muted">{d.date}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-5">
        {tiles.map(([k, v, sub]) => (
          <div key={k} className="rounded border border-cyan/15 bg-[#050912] p-3">
            <div className="font-mono text-[9px] tracking-[0.2em] text-muted">{k.toUpperCase()}</div>
            <div className="mt-1 font-mono text-2xl font-bold text-bone">{v}</div>
            <div className="text-[10px] text-ash">{sub}</div>
          </div>
        ))}
      </div>
      {start && (
        <button onClick={() => onOpen(start.p.id)} className="mt-4 w-full rounded-control bg-gold/20 py-3 font-mono text-sm font-bold tracking-[0.25em] text-gold hover:bg-gold/30">
          START MY DAY ▸ {start.p.address}
        </button>
      )}
      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <section>
          <div className="font-mono text-[9px] tracking-[0.25em] text-gold">FOLLOW-UPS DUE</div>
          <ul className="mt-1">{brief.due.map((q) => <Row key={q.intel.p.id} i={q.intel} tag={`DUE ${day(q.state?.nextFollowUp)}`} />)}</ul>
          {!brief.due.length && <p className="px-2 text-[11px] text-muted">Nothing due. Work the top of the queue.</p>}
          <div className="mt-4 font-mono text-[9px] tracking-[0.25em] text-cyan">TOP 10 UNTOUCHED</div>
          <ul className="mt-1">{brief.top.map((q) => <Row key={q.intel.p.id} i={q.intel} tag={q.action.verb} />)}</ul>
        </section>
        <section>
          <div className="font-mono text-[9px] tracking-[0.25em] text-status-red">ON THE {brief.saleDate.slice(5).replace("-", "/")} FORECLOSURE SALE</div>
          <ul className="mt-1">{brief.onTheSale.map((i) => <Row key={i.p.id} i={i} tag="SALE" />)}</ul>
          {!brief.onTheSale.length && <p className="px-2 text-[11px] text-muted">No notices on file for this sale. Load the legal-organ list with --foreclosure.</p>}
          <div className="mt-4 font-mono text-[9px] tracking-[0.25em] text-cyan">⚡ NEW SIGNALS THIS WEEK</div>
          <ul className="mt-1">{brief.newSignals.slice(0, 10).map((i) => <Row key={i.p.id} i={i} tag={i.primarySignal} />)}</ul>
          <div className="mt-4 font-mono text-[9px] tracking-[0.25em] text-cyan">PROBATE · LAST 90 DAYS</div>
          <ul className="mt-1">{brief.probate.map((i) => <Row key={i.p.id} i={i} tag="LETTER" />)}</ul>
          {!brief.probate.length && <p className="px-2 text-[11px] text-muted">None on file.</p>}
        </section>
      </div>
    </div>
  );
}

const EMPTY_BUYER = (): Buyer => ({ id: `b-${Date.now().toString(36)}`, name: "", zips: [], counties: [], types: ["sfr"], strategies: ["flip"], cash: false, pofVerified: false, active: true, updatedAt: new Date().toISOString() });

function BuyersView({ buyers, counts, pending, onSave, onImport }: { buyers: Buyer[]; counts: Map<string, number>; pending: boolean; onSave: (b: Buyer) => void; onImport: (csv: string) => void }) {
  const [edit, setEdit] = useState<Buyer | null>(null);
  const [csv, setCsv] = useState("");
  const n = (v: string) => (v.trim() === "" ? null : Number(v.replace(/[$,\s]/g, "")) || null);
  const inp = "w-full rounded border border-elevated bg-[#02040A] px-2 py-1 text-[12px] text-bone";
  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 className="font-mono text-[11px] tracking-[0.3em] text-cyan">BUYER NETWORK</h2>
        <span className="text-[11px] text-ash">{buyers.filter((b) => b.active).length} active · matched against every property on the desk</span>
        <button onClick={() => setEdit(EMPTY_BUYER())} className="ml-auto rounded bg-gold/20 px-3 py-1 font-mono text-[10px] tracking-widest text-gold hover:bg-gold/30">
          + ADD BUYER
        </button>
      </div>
      {edit && (
        <form
          className="mt-3 grid grid-cols-2 gap-2 rounded border border-gold/30 bg-[#050912] p-3 md:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSave(edit);
            setEdit(null);
          }}
        >
          {(
            [
              ["name", "Name"],
              ["company", "Company"],
              ["phone", "Phone"],
              ["email", "Email"],
            ] as const
          ).map(([k, l]) => (
            <label key={k} className="text-[10px] text-muted">
              {l}
              <input id={`bf-${k}`} required={k === "name"} value={edit[k] ?? ""} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} className={inp} />
            </label>
          ))}
          <label className="col-span-2 text-[10px] text-muted">
            ZIPs (space or comma)
            <input id="bf-zips" value={edit.zips.join(" ")} onChange={(e) => setEdit({ ...edit, zips: e.target.value.split(/[\s,;]+/).filter(Boolean) })} className={inp} />
          </label>
          <label className="col-span-2 text-[10px] text-muted">
            Counties (if no ZIPs)
            <input id="bf-counties" value={edit.counties.join(", ")} onChange={(e) => setEdit({ ...edit, counties: e.target.value.split(/[,;]+/).map((x) => x.trim()).filter(Boolean) })} className={inp} />
          </label>
          {(
            [
              ["minPrice", "Min price"],
              ["maxPrice", "Max price"],
              ["maxRehab", "Max rehab"],
              ["closeDays", "Closes in (days)"],
            ] as const
          ).map(([k, l]) => (
            <label key={k} className="text-[10px] text-muted">
              {l}
              <input id={`bf-${k}`} inputMode="decimal" value={edit[k] ?? ""} onChange={(e) => setEdit({ ...edit, [k]: n(e.target.value) })} className={`${inp} font-mono`} />
            </label>
          ))}
          <fieldset className="col-span-2 text-[10px] text-muted">
            Property types
            <div className="mt-1 flex flex-wrap gap-1">
              {(Object.keys(PROP_TYPE_LABELS) as PropType[]).map((t) => (
                <button type="button" key={t} onClick={() => setEdit({ ...edit, types: edit.types.includes(t) ? edit.types.filter((x) => x !== t) : [...edit.types, t] })} className={`rounded border px-2 py-0.5 ${edit.types.includes(t) ? "border-cyan bg-cyan/15 text-cyan" : "border-elevated text-ash"}`}>
                  {PROP_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="col-span-2 text-[10px] text-muted">
            Buys for
            <div className="mt-1 flex flex-wrap gap-1">
              {BUYER_STRATEGIES.map((t) => (
                <button type="button" key={t} onClick={() => setEdit({ ...edit, strategies: edit.strategies.includes(t) ? edit.strategies.filter((x) => x !== t) : [...edit.strategies, t] })} className={`rounded border px-2 py-0.5 ${edit.strategies.includes(t) ? "border-cyan bg-cyan/15 text-cyan" : "border-elevated text-ash"}`}>
                  {STRATEGY_LABELS[t]}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="flex items-center gap-2 text-[11px] text-ash">
            <input id="bf-cash" type="checkbox" checked={edit.cash} onChange={(e) => setEdit({ ...edit, cash: e.target.checked })} /> Cash buyer
          </label>
          <label className="flex items-center gap-2 text-[11px] text-ash">
            <input id="bf-pof" type="checkbox" checked={edit.pofVerified} onChange={(e) => setEdit({ ...edit, pofVerified: e.target.checked })} /> Proof of funds verified
          </label>
          <label className="flex items-center gap-2 text-[11px] text-ash">
            <input id="bf-active" type="checkbox" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> Active
          </label>
          <label className="col-span-2 text-[10px] text-muted md:col-span-4">
            Notes
            <input id="bf-notes" value={edit.notes ?? ""} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} className={inp} />
          </label>
          <div className="col-span-2 flex gap-2 md:col-span-4">
            <button disabled={pending} className="rounded bg-gold/20 px-4 py-1.5 font-mono text-[10px] tracking-widest text-gold hover:bg-gold/30 disabled:opacity-50">
              SAVE BUYER
            </button>
            <button type="button" onClick={() => setEdit(null)} className="rounded border border-elevated px-4 py-1.5 font-mono text-[10px] tracking-widest text-ash">
              CANCEL
            </button>
          </div>
        </form>
      )}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-left font-mono text-[9px] tracking-wider text-muted">
              <th className="py-1">BUYER</th>
              <th>AREA</th>
              <th>BUYS</th>
              <th className="text-right">PRICE</th>
              <th className="text-right">MAX REHAB</th>
              <th>FUNDS</th>
              <th className="text-right">MATCHES</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {buyers.map((b) => (
              <tr key={b.id} className={`border-t border-elevated/60 align-top ${b.active ? "" : "opacity-40"}`}>
                <td className="py-1.5 pr-2">
                  <div className="text-bone">{b.name}</div>
                  <div className="text-[10px] text-muted">{b.company}</div>
                </td>
                <td className="pr-2 font-mono text-ash">{b.zips.length ? b.zips.join(" ") : b.counties.join(", ") || "any"}</td>
                <td className="pr-2 text-ash">
                  {b.types.map((t) => PROP_TYPE_LABELS[t]).join(", ")}
                  <div className="text-[10px] text-muted">{b.strategies.map((t) => STRATEGY_LABELS[t]).join(", ")}</div>
                </td>
                <td className="pr-2 text-right font-mono text-ash">
                  {b.minPrice != null && b.maxPrice != null ? `${kmoney(b.minPrice)}–${kmoney(b.maxPrice)}` : b.maxPrice != null ? `up to ${kmoney(b.maxPrice)}` : b.minPrice != null ? `${kmoney(b.minPrice)}+` : "any"}
                </td>
                <td className="pr-2 text-right font-mono text-ash">{kmoney(b.maxRehab)}</td>
                <td className="pr-2 text-ash">{b.pofVerified ? "POF ✓" : b.cash ? "cash" : "financed"}{b.closeDays ? ` · ${b.closeDays}d` : ""}</td>
                <td className="pr-2 text-right font-mono text-gold">{counts.get(b.id) ?? 0}</td>
                <td className="text-right">
                  <button onClick={() => setEdit(b)} className="font-mono text-[10px] text-cyan hover:underline">
                    EDIT
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-5 font-mono text-[9px] tracking-[0.25em] text-muted">IMPORT FROM A SPREADSHEET</div>
      <p className="mt-1 text-[11px] text-ash">Paste rows with a header. Recognized columns: Name, Company, Phone, Email, ZIPs, Counties, Types, Strategies, Min Price, Max Price, Max Rehab, Min Beds, Cash, POF, Close Days, Notes.</p>
      <textarea id="bf-csv" value={csv} onChange={(e) => setCsv(e.target.value)} rows={4} placeholder={"Name,Company,Phone,ZIPs,Types,Strategies,Max Price,Max Rehab,Cash,POF\nJane Doe,JD Homes,404-555-0000,30310 30314,SFR,fix and flip,225k,75k,yes,yes"} className="mt-1 w-full rounded border border-elevated bg-[#02040A] p-2 font-mono text-[11px] text-bone placeholder:text-muted" />
      <button disabled={!csv.trim() || pending} onClick={() => { onImport(csv); setCsv(""); }} className="mt-1 rounded bg-cyan/15 px-3 py-1 font-mono text-[10px] tracking-widest text-cyan hover:bg-cyan/25 disabled:opacity-40">
        IMPORT BUYERS
      </button>
    </div>
  );
}

const ROOMS = ["Exterior", "Roof", "Kitchen", "Bath", "Living", "Bedroom", "Basement / crawl", "HVAC", "Electrical", "Plumbing", "Other"];

/** Resize to ≤1024 px JPEG so a photo is ~100–250 KB. */
async function resizePhoto(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => rej(new Error("Not an image the browser can read"));
      im.src = url;
    });
    const k = Math.min(1, 1024 / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * k);
    c.height = Math.round(img.height * k);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.72);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function WalkPanel({ i, fw, now, onSaveScope, onAddPhoto, onDeletePhoto }: { i: Intel; fw: Fieldwork; now: Date; onSaveScope: (s: ScopeLine[] | null) => void; onAddPhoto: (p: Photo) => void; onDeletePhoto: (id: string) => void }) {
  const [room, setRoom] = useState("Exterior");
  const [lines, setLines] = useState<ScopeLine[]>(() => fw.scope ?? blankScope(i.p));
  const [err, setErr] = useState<string | null>(null);
  const sc = computeScope(lines);
  const setLine = (k: string, patch: Partial<ScopeLine>) => setLines((ls) => ls.map((l) => (l.key === k ? { ...l, ...patch } : l)));
  const screen = i.rehab.fromWalkthrough ? null : i.rehab.value;
  return (
    <div>
      <div className="font-mono text-[9px] tracking-[0.25em] text-muted">PHOTOS · {fw.photos.length}</div>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
        <select id="wk-room" value={room} onChange={(e) => setRoom(e.target.value)} className="rounded border border-elevated bg-[#02040A] px-2 py-1 text-bone">
          {ROOMS.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
        <label className="cursor-pointer rounded border border-cyan/30 px-2 py-1 font-mono text-[10px] tracking-wider text-cyan hover:bg-cyan/10">
          + ADD PHOTOS
          <input
            id="wk-photos"
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="hidden"
            onChange={async (e) => {
              setErr(null);
              for (const f of Array.from(e.target.files ?? [])) {
                try {
                  onAddPhoto({ id: `ph-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, dataUrl: await resizePhoto(f), room, takenAt: new Date().toISOString() });
                } catch (x) {
                  setErr((x as Error).message);
                }
              }
              e.target.value = "";
            }}
          />
        </label>
        {err && <span className="text-status-red">{err}</span>}
      </div>
      {fw.photos.length > 0 && (
        <div className="mt-2 grid grid-cols-3 gap-1">
          {fw.photos.map((ph) => (
            <figure key={ph.id} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={ph.dataUrl} alt={`${ph.room} photo`} className="aspect-square w-full rounded object-cover" />
              <figcaption className="absolute bottom-0 left-0 right-0 flex items-center justify-between bg-[#02040A]/80 px-1 font-mono text-[9px] text-bone">
                {ph.room}
                <button onClick={() => onDeletePhoto(ph.id)} className="text-status-red" aria-label="Remove photo">
                  ✕
                </button>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
      <div className="mt-4 flex items-baseline gap-2">
        <span className="font-mono text-[9px] tracking-[0.25em] text-muted">SCOPE OF WORK</span>
        {fw.walkedAt && <span className="font-mono text-[9px] text-status-green">saved {fw.walkedAt.slice(0, 10)}</span>}
      </div>
      <table className="mt-1 w-full text-[11px]">
        <tbody>
          {sc.rows.map((r) => {
            const item = CATALOG.find((c) => c.key === r.key)!;
            return (
              <tr key={r.key} className="border-b border-elevated/60 align-middle">
                <td className="py-1 pr-1 text-bone" title={item.hint}>
                  {r.label}
                </td>
                <td className="pr-1">
                  <select id={`wk-l-${r.key}`} value={r.level} onChange={(e) => setLine(r.key, { level: e.target.value as Level })} className={`w-full rounded border border-elevated bg-[#02040A] px-1 py-0.5 text-[11px] ${r.level === "none" ? "text-muted" : "text-bone"}`}>
                    <option value="none">—</option>
                    <option value="light">light</option>
                    <option value="standard">standard</option>
                    <option value="heavy">heavy</option>
                  </select>
                </td>
                <td className="w-16 pr-1">
                  <input id={`wk-q-${r.key}`} inputMode="decimal" value={r.qty} onChange={(e) => setLine(r.key, { qty: Number(e.target.value) || 0 })} className="w-full rounded border border-elevated bg-[#02040A] px-1 py-0.5 text-right font-mono text-[11px] text-bone" aria-label={`${r.label} quantity (${r.unit})`} />
                </td>
                <td className="w-16 pr-1">
                  <input
                    id={`wk-u-${r.key}`}
                    inputMode="decimal"
                    placeholder={r.level === "none" ? "" : String(r.unitPrice)}
                    value={r.unitCost ?? ""}
                    onChange={(e) => setLine(r.key, { unitCost: e.target.value === "" ? null : Number(e.target.value.replace(/[$,]/g, "")) || 0 })}
                    className="w-full rounded border border-elevated bg-[#02040A] px-1 py-0.5 text-right font-mono text-[11px] text-bone placeholder:text-muted"
                    aria-label={`${r.label} cost per ${r.unit} (bid)`}
                  />
                </td>
                <td className="w-16 text-right font-mono text-bone">{r.cost ? kmoney(r.cost) : ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <Rows
        rows={[
          ["Hard costs", money(sc.hard)],
          ["Permits (4%)", money(sc.permits)],
          ["Contingency (12%)", money(sc.contingency)],
          ["Rehab budget (total)", money(sc.total)],
          ...(screen != null ? ([["Size-based screen it replaces", money(screen)]] as [string, string][]) : []),
        ]}
        foot="Quantity column: sq ft, count or 1 for lump sums. Cost column overrides the starting unit cost with your contractor's bid. Saving replaces the rehab estimate in the offer, buyer prices and strategies."
      />
      <div className="mt-2 flex gap-1 font-mono text-[10px] tracking-wider">
        <button disabled={sc.total === 0} onClick={() => onSaveScope(lines)} className="rounded bg-gold/20 px-3 py-1 text-gold hover:bg-gold/30 disabled:opacity-40">
          SAVE WALK-THROUGH · {kmoney(sc.total)}
        </button>
        {fw.scope && (
          <button onClick={() => { setLines(blankScope(i.p)); onSaveScope(null); }} className="rounded border border-elevated px-3 py-1 text-ash">
            CLEAR
          </button>
        )}
      </div>
      <p className="mt-2 text-[10px] text-muted">Starting costs are Atlanta-area rental-grade estimates as of {now.getFullYear()}, not quotes.</p>
    </div>
  );
}

function TalkPanel({ fw, now, onSave }: { fw: Fieldwork; now: Date; onSave: (n: FieldNotes) => void }) {
  const [n, setN] = useState<FieldNotes>(() => blankNotes(now));
  const chip = (on: boolean) => `rounded border px-2 py-0.5 text-[10px] ${on ? "border-cyan bg-cyan/15 text-cyan" : "border-elevated text-ash"}`;
  const sel = "w-full rounded border border-elevated bg-[#02040A] px-2 py-1 text-[11px] text-bone";
  const tri = (v: boolean | null) => (v == null ? "" : v ? "yes" : "no");
  const fromTri = (v: string) => (v === "" ? null : v === "yes");
  const last = fw.convos[0];
  return (
    <div>
      <details className="rounded border border-cyan/20 p-2">
        <summary className="cursor-pointer font-mono text-[10px] tracking-wider text-cyan">CALL GUIDE (ASK IN THIS ORDER)</summary>
        <ol className="mt-1 space-y-1">
          {GUIDE.map((g) => (
            <li key={g.stage} className="text-[11px]">
              <span className="font-mono text-[9px] tracking-wider text-gold">{g.stage.toUpperCase()}</span>
              <ul className="ml-3 list-disc text-ash">
                {g.asks.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
        <p className="mt-1 text-[10px] text-muted">Listen more than you talk. Write down their words, not your guess.</p>
      </details>
      <form
        className="mt-2 grid grid-cols-2 gap-2 text-[10px] text-muted"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ ...n, at: new Date().toISOString() });
          setN(blankNotes(now));
        }}
      >
        <label>
          Spoke with
          <select id="tk-who" value={n.spokeWith} onChange={(e) => setN({ ...n, spokeWith: e.target.value as FieldNotes["spokeWith"] })} className={sel}>
            {["owner", "heir", "tenant", "agent", "other"].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <label>
          Who lives there
          <select id="tk-occ" value={n.occupancy} onChange={(e) => setN({ ...n, occupancy: e.target.value as FieldNotes["occupancy"] })} className={sel}>
            {["unknown", "owner", "tenant", "vacant"].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <div className="col-span-2">
          Condition, their words (1 = needs everything · 5 = move-in ready)
          <div className="mt-1 flex gap-1">
            {[1, 2, 3, 4, 5].map((c) => (
              <button type="button" key={c} onClick={() => setN({ ...n, condition: n.condition === c ? null : (c as FieldNotes["condition"]) })} className={chip(n.condition === c)}>
                {c}
              </button>
            ))}
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {ISSUES.map((x) => (
              <button type="button" key={x} onClick={() => setN({ ...n, issues: n.issues.includes(x) ? n.issues.filter((y) => y !== x) : [...n.issues, x] })} className={chip(n.issues.includes(x))}>
                {x}
              </button>
            ))}
          </div>
        </div>
        <label>
          Timeline
          <select id="tk-time" value={n.timeline} onChange={(e) => setN({ ...n, timeline: e.target.value as FieldNotes["timeline"] })} className={sel}>
            {(Object.keys(TIMELINE_LABELS) as FieldNotes["timeline"][]).map((k) => (
              <option key={k} value={k}>
                {TIMELINE_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Asking price $
          <input id="tk-ask" inputMode="decimal" value={n.askingPrice ?? ""} onChange={(e) => setN({ ...n, askingPrice: e.target.value ? Number(e.target.value.replace(/[$,\s]/g, "")) || null : null })} className={`${sel} font-mono`} />
        </label>
        <div className="col-span-2">
          Why sell
          <div className="mt-1 flex flex-wrap gap-1">
            {REASONS.map((x) => (
              <button type="button" key={x} onClick={() => setN({ ...n, reasons: n.reasons.includes(x) ? n.reasons.filter((y) => y !== x) : [...n.reasons, x] })} className={chip(n.reasons.includes(x))}>
                {x}
              </button>
            ))}
          </div>
        </div>
        <label>
          Mortgage payoff they stated $
          <input id="tk-payoff" inputMode="decimal" value={n.statedPayoff ?? ""} onChange={(e) => setN({ ...n, statedPayoff: e.target.value === "" ? null : Number(e.target.value.replace(/[$,\s]/g, "")) || 0 })} className={`${sel} font-mono`} />
        </label>
        <label>
          Behind on payments?
          <select id="tk-behind" value={tri(n.behindOnPayments)} onChange={(e) => setN({ ...n, behindOnPayments: fromTri(e.target.value) })} className={sel}>
            <option value="">didn&apos;t say</option>
            <option value="yes">yes</option>
            <option value="no">no</option>
          </select>
        </label>
        <label>
          Others must sign?
          <select id="tk-others" value={tri(n.otherDecisionMakers)} onChange={(e) => setN({ ...n, otherDecisionMakers: fromTri(e.target.value) })} className={sel}>
            <option value="">didn&apos;t say</option>
            <option value="yes">yes</option>
            <option value="no">no</option>
          </select>
        </label>
        <label className="col-span-2">
          Notes (their words)
          <textarea id="tk-notes" rows={3} value={n.notes ?? ""} onChange={(e) => setN({ ...n, notes: e.target.value })} className={sel} />
        </label>
        <button className="col-span-2 rounded bg-gold/20 py-1.5 font-mono text-[10px] tracking-widest text-gold hover:bg-gold/30">SAVE CONVERSATION · RESCORE</button>
      </form>
      {last && (
        <div className="mt-3">
          <div className="font-mono text-[9px] tracking-[0.25em] text-muted">CONVERSATIONS · {fw.convos.length}</div>
          <ol className="mt-1 space-y-1.5">
            {fw.convos.map((c) => (
              <li key={c.at} className="text-[11px]">
                <span className="font-mono text-muted">{c.at.slice(0, 10)}</span> <span className="text-bone">{c.spokeWith}</span>
                <span className="text-ash">
                  {" "}
                  · {TIMELINE_LABELS[c.timeline]}
                  {c.condition ? ` · condition ${c.condition}/5` : ""}
                  {c.askingPrice ? ` · asking ${money(c.askingPrice)}` : ""}
                  {c.statedPayoff != null ? ` · owes ${money(c.statedPayoff)}` : ""}
                  {c.reasons.length ? ` · ${c.reasons.join(", ")}` : ""}
                </span>
                {c.notes && <div className="ml-4 text-ash">“{c.notes}”</div>}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

function ContractPanel({ i, contract, draft, setDraft, suggestedPrice, matches, now, onSave }: { i: Intel; contract: Contract | null; draft: Contract | null; setDraft: (c: Contract | null) => void; suggestedPrice: number | null; matches: BuyerMatch[]; now: Date; onSave: (c: Contract, statusChanged: boolean) => void }) {
  const c = draft ?? contract;
  const inp = "w-full rounded border border-elevated bg-[#02040A] px-2 py-1 font-mono text-[12px] text-bone";
  const num = (v: string) => Number(v.replace(/[$,\s]/g, "")) || 0;
  if (!c)
    return (
      <div>
        <p className="text-[11px] text-ash">Not under contract. When the seller signs, start the tracker: it watches earnest money, the due-diligence window and closing, and runs the Georgia assignment checklist.</p>
        <button onClick={() => setDraft(newContract(i.p.id, i.p.address, suggestedPrice ?? 0, now))} className="mt-2 rounded bg-gold/20 px-3 py-1.5 font-mono text-[10px] tracking-widest text-gold hover:bg-gold/30">
          + START CONTRACT{suggestedPrice ? ` AT ${money(suggestedPrice)}` : ""}
        </button>
      </div>
    );
  const editing = !!draft;
  const set = (patch: Partial<Contract>) => setDraft({ ...c, ...patch });
  const dl = deadlines(c, now);
  const fee = c.assignmentFee ?? null;
  return (
    <div>
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-[9px] tracking-[0.25em] text-gold">{c.status === "active" ? "UNDER CONTRACT" : c.status.toUpperCase()}</span>
        <span className="font-mono text-[11px] text-bone">{money(c.contractPrice)}</span>
        <span className="ml-auto font-mono text-[10px] text-ash">{progress(c)}% done</span>
      </div>
      <ul className="mt-2 space-y-1">
        {dl.map((d) => (
          <li key={d.key} className="flex items-baseline gap-2 text-[11px]">
            <span className={`w-16 font-mono font-bold ${SEV_CLS[d.severity]}`}>{d.severity === "done" ? "✓" : d.daysLeft < 0 ? `${-d.daysLeft}d LATE` : d.daysLeft === 0 ? "TODAY" : `${d.daysLeft}d`}</span>
            <span className="text-bone">{d.label}</span>
            <span className="font-mono text-muted">{d.date}</span>
            <span className="min-w-0 flex-1 truncate text-right text-[10px] text-ash">{d.note}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] text-muted">
        <label>
          Contract price $<input id="ct-price" disabled={!editing} value={c.contractPrice} onChange={(e) => set({ contractPrice: num(e.target.value) })} className={inp} />
        </label>
        <label>
          Earnest money $<input id="ct-emd" disabled={!editing} value={c.emd} onChange={(e) => set({ emd: num(e.target.value) })} className={inp} />
        </label>
        <label>
          Binding date<input id="ct-eff" type="date" disabled={!editing} value={c.effectiveDate} onChange={(e) => set({ effectiveDate: e.target.value })} className={inp} />
        </label>
        <label>
          Closing date<input id="ct-close" type="date" disabled={!editing} value={c.closingDate} onChange={(e) => set({ closingDate: e.target.value })} className={inp} />
        </label>
        <label>
          EMD due (days)<input id="ct-emdd" disabled={!editing} value={c.emdDueDays} onChange={(e) => set({ emdDueDays: num(e.target.value) })} className={inp} />
        </label>
        <label>
          Due diligence (days)<input id="ct-dd" disabled={!editing} value={c.ddDays} onChange={(e) => set({ ddDays: num(e.target.value) })} className={inp} />
        </label>
        <label className="col-span-2">
          Closing attorney<input id="ct-atty" disabled={!editing} value={c.closingAttorney ?? ""} onChange={(e) => set({ closingAttorney: e.target.value })} className={inp} />
        </label>
        <label>
          Assigned buyer
          <select
            id="ct-buyer"
            disabled={!editing}
            value={c.buyerId ?? ""}
            onChange={(e) => {
              const m = matches.find((x) => x.buyer.id === e.target.value);
              set({ buyerId: m?.buyer.id ?? null, buyerName: m?.buyer.name ?? null, assignmentFee: c.assignmentFee ?? (m?.price != null ? Math.max(0, m.price - c.contractPrice) : null) });
            }}
            className={inp}
          >
            <option value="">— none yet —</option>
            {matches.map((m) => (
              <option key={m.buyer.id} value={m.buyer.id}>
                {m.buyer.name} (fit {m.fit})
              </option>
            ))}
            {c.buyerId && !matches.some((m) => m.buyer.id === c.buyerId) && <option value={c.buyerId}>{c.buyerName}</option>}
          </select>
        </label>
        <label>
          Assignment fee $<input id="ct-fee" disabled={!editing} value={fee ?? ""} onChange={(e) => set({ assignmentFee: num(e.target.value) })} className={inp} />
        </label>
      </div>
      <div className="mt-3 font-mono text-[9px] tracking-[0.25em] text-muted">GEORGIA ASSIGNMENT CHECKLIST</div>
      <ul className="mt-1 space-y-0.5">
        {c.checklist.map((x, n) => (
          <li key={x.label}>
            <label className="flex items-start gap-2 text-[11px]">
              <input
                id={`ct-ck-${n}`}
                type="checkbox"
                checked={x.done}
                onChange={() => {
                  const next = { ...c, checklist: c.checklist.map((y, k) => (k === n ? { ...y, done: !y.done } : y)) };
                  if (editing) setDraft(next);
                  else onSave(next, false);
                }}
              />
              <span className={x.done ? "text-muted line-through" : "text-bone"}>{x.label}</span>
            </label>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-1 font-mono text-[10px] tracking-wider">
        {editing ? (
          <>
            <button
              onClick={() => {
                onSave(draft!, !contract || contract.status !== draft!.status);
                setDraft(null);
              }}
              className="rounded bg-gold/20 px-3 py-1 text-gold hover:bg-gold/30"
            >
              SAVE CONTRACT
            </button>
            <button onClick={() => setDraft(null)} className="rounded border border-elevated px-3 py-1 text-ash">
              CANCEL
            </button>
          </>
        ) : (
          <>
            <button onClick={() => setDraft({ ...c })} className="rounded border border-cyan/30 px-3 py-1 text-cyan hover:bg-cyan/10">
              EDIT
            </button>
            {c.status === "active" && (
              <>
                <button onClick={() => onSave({ ...c, status: "closed", checklist: c.checklist.map((x) => ({ ...x, done: true })) }, true)} className="rounded bg-status-green/15 px-3 py-1 text-status-green">
                  ✓ MARK CLOSED{fee ? ` · ${money(fee)}` : ""}
                </button>
                <button onClick={() => onSave({ ...c, status: "cancelled" }, true)} className="rounded border border-status-red/40 px-3 py-1 text-status-red">
                  CANCEL CONTRACT
                </button>
              </>
            )}
          </>
        )}
      </div>
      <p className="mt-2 text-[10px] text-muted">Deadlines count calendar days from the binding date; check your contract&apos;s own definitions. Georgia closings run through a closing attorney.</p>
    </div>
  );
}

function Pipeline({ intel, states, onOpen, contracts, now }: { intel: Intel[]; states: Record<string, DeskState>; onOpen: (id: string) => void; contracts: Map<string, Contract>; now: Date }) {
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
                      {s === "CONTRACT" && contracts.get(i.p.id) && (() => {
                        const c = contracts.get(i.p.id)!;
                        const d = deadlines(c, now).find((x) => x.severity !== "done");
                        return (
                          <span className="block font-mono text-[9px]">
                            <span className="text-ash">{progress(c)}% · </span>
                            {d ? <span className={SEV_CLS[d.severity]}>{d.label.toLowerCase()} {d.daysLeft < 0 ? "OVERDUE" : `${d.daysLeft}d`}</span> : <span className="text-status-green">ready</span>}
                          </span>
                        );
                      })()}
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

function MoneyView({ stats, buyers, matched, feesUnderContract }: { stats: ReturnType<typeof moneyStats>; buyers: number; matched: number; feesUnderContract: number }) {
  const tiles: [string, string][] = [
    ["Fees under contract", kmoney(feesUnderContract)],
    ["Buyers on file", String(buyers)],
    ["Properties with a buyer", String(matched)],
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
