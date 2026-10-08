"use client";

/**
 * GOD'S EYE · AI INFRASTRUCTURE INTELLIGENCE — the Capital Desk.
 * The world generates signals → the engine connects them → opportunities →
 * the deal team builds the deal → you see only MONEY, ACTION, CONTROL.
 *
 * v1 keeps deals, offers, the action queue, memory and the playbook in this
 * browser (localStorage). Nothing is sent from here: GREEN means "cleared to
 * send", and you send it.
 */
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { LAYERS, THESIS_LABELS, ROLE_LABELS, CI_SOURCES, CI_ASSUME, ciBadge, fmtUsd, layerCounts, type SiteIntel, type Signal, type CapitalSource, type CiBadge, type CiEvidence } from "@/lib/ci-intel";
import {
  AGENTS,
  ACTION_LABELS,
  DEAL_STAGES,
  DEFAULT_PLAYBOOK,
  ceoAlerts,
  negotiate,
  memoryHints,
  newDealFromSite,
  recall,
  rule,
  runDealTeam,
  type CeoAlert,
  type Deal,
  type Memory,
  type Playbook,
  type ProposedAction,
  type Ruling,
  type Temperature,
} from "@/lib/ci-deal";
import type { MapPoint, CompPoint } from "@/components/realestate/GodsEyeMap";

const GodsEyeMap = dynamic(() => import("@/components/realestate/GodsEyeMap").then((m) => m.GodsEyeMap), { ssr: false, loading: () => <div className="absolute inset-0 grid place-items-center font-mono text-xs text-cyan">ACQUIRING ORBIT…</div> });

type View = "command" | "deals" | "capital" | "signals" | "playbook" | "sources";
type Tab = "WHY" | "CONSTELLATION" | "DEAL TEAM" | "MONEY" | "ACTIONS";
type Queued = ProposedAction & { ruling: Ruling; status: "queued" | "cleared" | "approved" | "declined" | "sent" };

const TEMP_CLS: Record<Temperature, string> = { GREEN: "text-status-green border-status-green/40", YELLOW: "text-status-amber border-status-amber/40", RED: "text-status-red border-status-red/40" };
const BADGE_CLS: Record<CiBadge, string> = { VERIFIED: "text-status-green", REPORTED: "text-cyan", INFERRED: "text-status-amber", STALE: "text-status-red" };
const STORE = "godseye-capital-v1";

function load<T>(key: string, fallback: T): T {
  try {
    const j = JSON.parse(localStorage.getItem(`${STORE}:${key}`) ?? "null");
    return j ?? fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, v: unknown) {
  try {
    localStorage.setItem(`${STORE}:${key}`, JSON.stringify(v));
  } catch {
    /* storage unavailable: state lasts for this visit */
  }
}

const Stars = ({ n }: { n: number }) => (
  <span className="font-mono tracking-tighter text-gold" aria-label={`${n} of 5`}>
    {"★".repeat(n)}
    <span className="text-elevated">{"★".repeat(5 - n)}</span>
  </span>
);

function Ev({ e, now }: { e: CiEvidence; now: Date }) {
  const b = ciBadge(e, now);
  return (
    <span className="block font-mono text-[10px] text-muted">
      <span className={BADGE_CLS[b]}>● {b}</span> {CI_SOURCES[e.source].label}
      {e.observedAt ? ` · ${e.observedAt.slice(0, 10)}` : ""} · {e.detail}
    </span>
  );
}

export function CapitalDesk({
  sites,
  signals,
  capital,
  initialDeals,
  initialMemories,
  nowIso,
  example,
}: {
  sites: SiteIntel[];
  signals: Signal[];
  capital: CapitalSource[];
  initialDeals: Deal[];
  initialMemories: Memory[];
  nowIso: string;
  example: boolean;
}) {
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const [view, setView] = useState<View>("command");
  const [tab, setTab] = useState<Tab>("WHY");
  const [selId, setSelId] = useState<string | null>(null);
  const [deals, setDeals] = useState<Deal[]>(initialDeals);
  const [memories, setMemories] = useState<Memory[]>(initialMemories);
  const [queue, setQueue] = useState<Queued[]>([]);
  const [playbook, setPlaybook] = useState<Playbook>(DEFAULT_PLAYBOOK);
  const [dealId, setDealId] = useState<string | null>(initialDeals[0]?.id ?? null);
  const [layer, setLayer] = useState<string>("all");
  const [toast, setToast] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string[]>([]);

  // Restore this browser's desk after mount (server and first client render must match).
  useEffect(() => {
    setDeals(load("deals", initialDeals));
    setMemories(load("memories", initialMemories));
    setQueue(load("queue", []));
    setPlaybook(load("playbook", DEFAULT_PLAYBOOK));
    setDismissed(load("dismissed", []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => save("deals", deals), [deals]);
  useEffect(() => save("memories", memories), [memories]);
  useEffect(() => save("queue", queue), [queue]);
  useEffect(() => save("playbook", playbook), [playbook]);
  useEffect(() => save("dismissed", dismissed), [dismissed]);

  const flash = (t: string) => {
    setToast(t);
    setTimeout(() => setToast(null), 2800);
  };
  const sel = sites.find((s) => s.site.id === selId) ?? null;
  const counts = useMemo(() => layerCounts(sites, signals, capital), [sites, signals, capital]);
  const alerts = useMemo(() => ceoAlerts(deals, queue, sites, now, playbook).filter((a) => !dismissed.includes(a.id)), [deals, queue, sites, now, playbook, dismissed]);
  const team = useMemo(() => (sel ? runDealTeam(sel, signals, capital, memories, playbook, now) : null), [sel, signals, capital, memories, playbook, now]);
  const visible = layer === "all" ? sites : sites.filter((s) => s.layers.includes(layer as never));

  const points: MapPoint[] = useMemo(() => sites.map((s) => ({ id: s.site.id, lat: s.site.lat, lng: s.site.lng, score: s.score, focus: s.score, dim: layer !== "all" && !s.layers.includes(layer as never), label: s.site.name })), [sites, layer]);
  const sigPoints: CompPoint[] = useMemo(() => signals.filter((g) => g.lat != null).map((g) => ({ id: g.id, lat: g.lat!, lng: g.lng!, renovated: ["dc_announcement", "large_load_filing", "ppa", "funding_round"].includes(g.kind), label: g.title })), [signals]);

  const activeDeals = deals.filter((d) => !["CLOSED", "DEAD"].includes(d.stage));
  const pipelineValue = activeDeals.reduce((t, d) => t + (d.assetValue ?? 0), 0);
  const upliftOnMap = sites.reduce((t, s) => t + Math.max(0, s.value.uplift ?? 0), 0);
  const control = queue.filter((q) => q.status === "queued" && q.ruling.temperature === "RED").length + alerts.filter((a) => a.temperature === "RED").length;

  function queueActions(acts: ProposedAction[], dealIdFor: string | null) {
    const deal = deals.find((d) => d.id === dealIdFor) ?? null;
    const next: Queued[] = acts.map((a) => {
      const ruling = rule({ ...a, dealId: dealIdFor }, deal, playbook);
      return { ...a, dealId: dealIdFor, ruling, status: ruling.temperature === "GREEN" ? "cleared" : "queued" };
    });
    setQueue((q) => [...next.filter((n) => !q.some((x) => x.id === n.id)), ...q]);
    const g = next.filter((n) => n.status === "cleared").length;
    flash(`${g} cleared to run · ${next.length - g} waiting for you`);
  }

  function startDeal(i: SiteIntel) {
    const existing = deals.find((d) => d.siteId === i.site.id && !["CLOSED", "DEAD"].includes(d.stage));
    if (existing) {
      setDealId(existing.id);
      setView("deals");
      return;
    }
    const d = newDealFromSite(i, new Date());
    setDeals((x) => [d, ...x]);
    setDealId(d.id);
    if (team) queueActions(team.actions, d.id);
    setView("deals");
  }

  function onAlert(a: CeoAlert, choice: string) {
    if (choice === "OPEN") {
      setSelId(a.siteId ?? null);
      setView("command");
      return;
    }
    if (a.dealId && a.level === "money" && a.id.startsWith("neg-")) {
      const d = deals.find((x) => x.id === a.dealId)!;
      const theirs = [...d.offers].reverse().find((o) => o.from === "them")!;
      const n = negotiate(d, theirs.amount, playbook);
      if (choice === "SEND" && n.counter != null) {
        if (n.ruling.temperature === "RED") return flash("Past your walk-away: only you can send this. Use TAKE OVER.");
        recordOffer(d.id, "us", n.counter, n.ruling.temperature === "GREEN" ? "Counter inside your box (auto-cleared)" : "Counter approved by you");
        flash(`Counter ${fmtUsd(n.counter)} recorded. Send it from your email; the desk doesn't send.`);
      } else if (choice === "APPROVE") {
        setDeals((x) => x.map((y) => (y.id === d.id ? { ...y, stage: "AGREEMENT", updatedAt: new Date().toISOString() } : y)));
        flash("Marked for agreement. Paper it with counsel before anyone signs.");
      } else {
        setDealId(d.id);
        setView("deals");
      }
      return;
    }
    const id = a.id.replace(/^act-/, "");
    if (choice === "APPROVE" || choice === "SEND") setQueue((q) => q.map((x) => (x.id === id ? { ...x, status: "approved" } : x)));
    if (choice === "DECLINE") setQueue((q) => q.map((x) => (x.id === id ? { ...x, status: "declined" } : x)));
    if (choice === "EDIT" || choice === "TAKE OVER") {
      setView("command");
      setTab("ACTIONS");
    }
    setDismissed((d) => [...d, a.id]);
  }

  function recordOffer(id: string, from: "us" | "them", amount: number, note?: string) {
    const at = new Date().toISOString();
    setDeals((x) => x.map((d) => (d.id === id ? { ...d, offers: [...d.offers, { at, from, amount, note }], stage: d.stage === "TERMS" || d.stage === "CONVERSATION" ? "NEGOTIATION" : d.stage, updatedAt: at } : d)));
    const d = deals.find((x) => x.id === id);
    const cp = d?.parties.find((p) => p.id === d.counterpartyId);
    if (from === "them" && cp) setMemories((m) => [{ id: `m-${Date.now()}`, partyName: cp.name, at, kind: "offer", summary: `Offered ${fmtUsd(amount)} on ${d!.title}`, facts: [] }, ...m]);
  }

  // ─── Header ───
  const header = (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-cyan/20 bg-[#03060D]/95 px-3 font-mono text-[11px] tracking-widest text-ash">
      <Link href="/realestate/command" className="text-muted hover:text-bone" title="Real-estate desk">
        ←
      </Link>
      <span className="flex items-center gap-2 font-display text-[13px] font-bold tracking-[0.2em] text-bone">
        <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-gold shadow-[0_0_12px_#C9A84C]" />
        GOD&apos;S EYE <span className="hidden text-gold sm:inline">AI INFRASTRUCTURE INTELLIGENCE</span>
      </span>
      <span className="hidden md:inline">
        GEORGIA • <span className={example ? "text-status-amber" : "text-status-green"}>{example ? "EXAMPLE DATA" : "LIVE"}</span>
      </span>
      <nav className="ml-auto flex gap-1 overflow-x-auto">
        {(["command", "deals", "capital", "signals", "playbook", "sources"] as View[]).map((v) => (
          <button key={v} onClick={() => setView(v)} className={`rounded px-2 py-1 uppercase ${view === v ? "bg-gold/15 text-gold" : "hover:text-bone"}`}>
            {v}
          </button>
        ))}
      </nav>
    </header>
  );

  // ─── MONEY / ACTION / CONTROL ───
  const mac = (
    <div className="grid shrink-0 grid-cols-1 gap-2 border-b border-cyan/10 bg-[#050912] p-2 md:grid-cols-3">
      <div className="rounded border border-gold/30 p-2">
        <div className="font-mono text-[9px] tracking-[0.3em] text-gold">🔥 MONEY</div>
        <div className="mt-1 flex items-baseline gap-3">
          <span className="font-mono text-xl font-bold text-bone">{fmtUsd(pipelineValue)}</span>
          <span className="text-[11px] text-ash">in {activeDeals.length} live deal{activeDeals.length === 1 ? "" : "s"}</span>
        </div>
        <div className="text-[11px] text-ash">Powered-land uplift on the map: {fmtUsd(upliftOnMap)} (screen)</div>
      </div>
      <div className="rounded border border-cyan/30 p-2">
        <div className="font-mono text-[9px] tracking-[0.3em] text-cyan">⚡ ACTION</div>
        <div className="mt-1 flex items-baseline gap-3">
          <span className="font-mono text-xl font-bold text-bone">{alerts.length}</span>
          <span className="text-[11px] text-ash">need you · {queue.filter((q) => q.status === "cleared").length} cleared to run underneath</span>
        </div>
        {alerts[0] && (
          <button onClick={() => setView("command")} className="truncate text-left text-[11px] text-cyan hover:underline">
            Top: {alerts[0].title}
          </button>
        )}
      </div>
      <div className="rounded border border-status-red/30 p-2">
        <div className="font-mono text-[9px] tracking-[0.3em] text-status-red">👑 CONTROL</div>
        <div className="mt-1 flex items-baseline gap-3">
          <span className="font-mono text-xl font-bold text-bone">{control}</span>
          <span className="text-[11px] text-ash">decisions only you can make</span>
        </div>
        <div className="text-[11px] text-ash">Binding terms, money, ownership and licensed activity always stop here.</div>
      </div>
    </div>
  );

  const layerBar = (
    <div className="flex shrink-0 flex-wrap gap-x-4 gap-y-1 border-b border-cyan/10 bg-[#03060D] px-3 py-1.5 font-mono text-[10px] tracking-wider">
      <button onClick={() => setLayer("all")} className={layer === "all" ? "text-bone" : "text-muted hover:text-ash"}>
        ALL {sites.length}
      </button>
      {LAYERS.map((l) => (
        <button key={l.key} onClick={() => setLayer(l.key)} className={`flex items-center gap-1.5 ${layer === l.key ? "text-bone" : "text-muted hover:text-ash"}`}>
          {l.label.toUpperCase()}
          <span className="inline-block h-1.5 rounded-sm" style={{ width: Math.max(4, Math.min(60, counts[l.key] * 6)), background: l.color }} />
          <span>{counts[l.key]}</span>
        </button>
      ))}
    </div>
  );

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-[#02040A] text-bone">
      {header}
      {example && <div className="shrink-0 bg-status-amber/10 px-3 py-1 text-center font-mono text-[10px] tracking-wider text-status-amber">EXAMPLE DATA: every site, party, fund, signal and offer is fictional. Your deals, notes and approvals stay in this browser.</div>}
      {mac}
      {layerBar}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <aside className="order-2 flex max-h-[34vh] min-h-0 w-full flex-col border-r border-cyan/10 bg-[#050912]/90 lg:order-1 lg:max-h-none lg:w-[300px]">
          <div className="px-3 pb-1 pt-2 font-mono text-[10px] tracking-[0.25em] text-muted">⚡ CEO ALERTS · {alerts.length}</div>
          <div className="max-h-[42%] overflow-y-auto px-2">
            {alerts.map((a) => (
              <div key={a.id} className={`mb-1.5 rounded border p-2 text-[11px] ${TEMP_CLS[a.temperature]}`}>
                <div className="font-semibold text-bone">{a.title}</div>
                {a.body.slice(0, 2).map((b) => (
                  <div key={b} className="text-ash">
                    {b}
                  </div>
                ))}
                {a.recommendation && <div className="mt-0.5 text-gold">→ {a.recommendation}</div>}
                <div className="mt-1 flex gap-1 font-mono text-[9px] tracking-wider">
                  {a.choices.map((c) => (
                    <button key={c} onClick={() => onAlert(a, c)} className="rounded border border-elevated px-1.5 py-0.5 text-bone hover:border-gold/60">
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {!alerts.length && <p className="px-1 text-[11px] text-muted">Nothing needs you. The machine is working.</p>}
          </div>
          <div className="px-3 pb-1 pt-2 font-mono text-[10px] tracking-[0.25em] text-muted">🔥 HOT OPPORTUNITIES</div>
          <ol className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
            {visible.map((i, n) => (
              <li key={i.site.id}>
                <button onClick={() => { setSelId(i.site.id); setView("command"); setTab("WHY"); }} className={`mb-1 w-full rounded border px-2 py-1.5 text-left ${selId === i.site.id ? "border-gold/60 bg-gold/10" : "border-transparent hover:border-cyan/20 hover:bg-elevated/60"}`}>
                  <div className="flex items-baseline gap-2">
                    <span className="w-5 font-mono text-[10px] text-muted">{String(n + 1).padStart(2, "0")}</span>
                    <span className="font-mono text-[13px] font-bold">{i.score}</span>
                    <span className="truncate text-[12px]">{i.site.name}</span>
                  </div>
                  <div className="ml-7 grid grid-cols-2 gap-x-2 text-[9px] text-muted">
                    <span>Power <Stars n={i.stars.power} /></span>
                    <span>Fiber <Stars n={i.stars.fiber} /></span>
                    <span>Zoning <Stars n={i.stars.zoning} /></span>
                    <span>Demand <Stars n={i.stars.demand} /></span>
                  </div>
                </button>
              </li>
            ))}
          </ol>
        </aside>
        <main className="relative order-1 h-[34vh] min-w-0 flex-1 lg:order-2 lg:h-auto">
          <GodsEyeMap points={points} selectedId={selId} onSelect={(id) => { setSelId(id); setTab("WHY"); }} basemap="dark" terrain={false} comps={sigPoints} home={{ center: [-83.6, 32.9], zoom: 6.6, pitch: 35 }} selectZoom={11.5} />
          <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_120px_rgba(2,4,10,0.95)]" />
          <div className="pointer-events-none absolute left-2 top-2 rounded border border-cyan/20 bg-[#03060D]/80 px-2 py-1 font-mono text-[9px] tracking-wider text-ash">
            ● sites by score · <span className="text-gold">◆ demand signals</span> · ◇ other signals
          </div>
          {view !== "command" && (
            <div className="absolute inset-0 z-10 overflow-y-auto bg-[#02040A]/94 p-4 backdrop-blur-sm">
              {view === "deals" && <DealsView deals={deals} setDeals={setDeals} dealId={dealId} setDealId={setDealId} playbook={playbook} recordOffer={recordOffer} memories={memories} />}
              {view === "capital" && <CapitalView capital={capital} sites={sites} memories={memories} />}
              {view === "signals" && <SignalsView signals={signals} now={now} />}
              {view === "playbook" && <PlaybookView playbook={playbook} setPlaybook={setPlaybook} />}
              {view === "sources" && <SourcesView />}
            </div>
          )}
        </main>
        <section className="order-3 min-h-0 overflow-y-auto border-l border-cyan/10 bg-[#050912]/95 lg:w-[460px]">
          {sel ? (
            <Dossier
              i={sel}
              tab={tab}
              setTab={setTab}
              now={now}
              team={team}
              queue={queue.filter((q) => q.id.includes(sel.site.id))}
              onRunTeam={() => team && queueActions(team.actions, deals.find((d) => d.siteId === sel.site.id)?.id ?? null)}
              onStartDeal={() => startDeal(sel)}
              onQueue={(id, status) => setQueue((q) => q.map((x) => (x.id === id ? { ...x, status } : x)))}
            />
          ) : (
            <div className="grid h-full place-items-center p-6 text-center">
              <div>
                <div className="font-mono text-[10px] tracking-[0.3em] text-muted">FIND THE MONEY BEFORE IT MOVES</div>
                <p className="mt-2 text-sm text-ash">Pick a site on the map or in Hot opportunities.</p>
                {sites[0] && (
                  <button onClick={() => setSelId(sites[0].site.id)} className="mt-4 rounded-control bg-gold/20 px-4 py-2 font-mono text-xs tracking-widest text-gold hover:bg-gold/30">
                    OPEN #1 · {sites[0].site.name}
                  </button>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
      {toast && <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded border border-gold/40 bg-[#03060D] px-4 py-2 font-mono text-[11px] text-gold shadow-lg">{toast}</div>}
    </div>
  );
}

// ─── Dossier ──────────────────────────────────────────────────────────────────

function Dossier({ i, tab, setTab, now, team, queue, onRunTeam, onStartDeal, onQueue }: { i: SiteIntel; tab: Tab; setTab: (t: Tab) => void; now: Date; team: ReturnType<typeof runDealTeam> | null; queue: Queued[]; onRunTeam: () => void; onStartDeal: () => void; onQueue: (id: string, s: Queued["status"]) => void }) {
  const s = i.site;
  return (
    <div>
      <div className="border-b border-cyan/10 p-3">
        <div className="font-mono text-[9px] tracking-[0.3em] text-muted">
          OPPORTUNITY · {s.id} {s.example && <span className="ml-1 rounded bg-status-amber/15 px-1 text-status-amber">EXAMPLE · FICTIONAL</span>}
        </div>
        <h2 className="mt-1 font-display text-lg font-bold leading-tight">{s.name}</h2>
        <div className="text-[11px] text-ash">
          {s.county} County, {s.state} · {s.acres != null ? `${s.acres} acres` : "power node"} · zoned {s.zoning.replace("_", " ")} · {s.existingUse.replace("_", " ")}
        </div>
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
          <div className="ml-auto text-right font-mono text-[10px] text-ash">
            {i.badges.VERIFIED} verified · {i.badges.REPORTED} reported
            <br />
            {i.badges.INFERRED} estimated · {i.badges.STALE} stale
          </div>
        </div>
        <div className="mt-2 grid grid-cols-5 gap-1 text-center font-mono text-[9px] text-muted">
          {(["power", "fiber", "zoning", "demand", "capital"] as const).map((k) => (
            <div key={k}>
              {k.toUpperCase()}
              <br />
              <Stars n={i.stars[k]} />
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-1 font-mono text-[10px] tracking-wider">
          <button onClick={onStartDeal} className="rounded bg-gold/20 px-3 py-1 text-gold hover:bg-gold/30">
            ⚡ START DEAL
          </button>
          <button onClick={onRunTeam} className="rounded border border-cyan/30 px-3 py-1 text-cyan hover:bg-cyan/10">
            RUN DEAL TEAM
          </button>
        </div>
      </div>
      <div className="sticky top-0 z-[1] flex overflow-x-auto border-b border-cyan/10 bg-[#050912] font-mono text-[10px] tracking-wider">
        {(["WHY", "CONSTELLATION", "DEAL TEAM", "MONEY", "ACTIONS"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`shrink-0 px-2.5 py-2 ${tab === t ? "border-b-2 border-gold text-gold" : "text-muted hover:text-bone"}`}>
            {t}
          </button>
        ))}
      </div>
      <div className="p-3 text-[12px]">
        {tab === "WHY" && (
          <>
            <div className="font-mono text-[9px] tracking-[0.25em] text-gold">WHY THIS MATTERS</div>
            <ul className="mt-1 space-y-0.5">
              {i.why.map((w) => (
                <li key={w}>▸ {w}</li>
              ))}
            </ul>
            <div className="mt-3 font-mono text-[9px] tracking-[0.25em] text-muted">BEST PLAYS</div>
            {i.theses.slice(0, 3).map((t) => (
              <div key={t.key} className="mt-1 flex gap-2 text-[11px]">
                <span className="w-8 font-mono text-bone">{t.fit}</span>
                <span>
                  <span className="text-bone">{THESIS_LABELS[t.key]}</span> <span className="text-ash">· {t.why}</span>
                </span>
              </div>
            ))}
            <div className="mt-3 font-mono text-[9px] tracking-[0.25em] text-muted">EVIDENCE BY FACTOR</div>
            {(Object.values(i.factors) as SiteIntel["factors"][keyof SiteIntel["factors"]][]).map((f) => (
              <details key={f.key} className="mt-1">
                <summary className="flex cursor-pointer list-none items-center gap-2 text-[11px]">
                  <span className="w-20 uppercase text-ash">{f.key}</span>
                  <span className="relative h-1.5 flex-1 overflow-hidden rounded bg-elevated">
                    <span className={`absolute inset-y-0 left-0 ${f.key === "risk" ? "bg-status-red" : "bg-gold"}`} style={{ width: `${f.score}%` }} />
                  </span>
                  <span className="w-7 text-right font-mono">{f.score}</span>
                </summary>
                <ul className="ml-2 mt-1 space-y-1 border-l border-gold/20 pl-2">
                  {f.findings.map((x) => (
                    <li key={x.text} className="text-[11px]">
                      {x.text}
                      {x.evidence.map((e, n) => (
                        <Ev key={n} e={e} now={now} />
                      ))}
                    </li>
                  ))}
                  {f.unknowns.map((u) => (
                    <li key={u} className="text-[11px] text-status-amber">
                      ? {u}
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </>
        )}
        {tab === "CONSTELLATION" && (
          <>
            <div className="font-mono text-[9px] tracking-[0.25em] text-gold">CAPITAL CONSTELLATION · {i.constellation.completeness}% COMPLETE</div>
            <ul className="mt-2 space-y-1.5">
              {i.constellation.slots.map((x) => (
                <li key={x.role} className="flex items-start gap-2 text-[11px]">
                  <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${x.filledBy ? "bg-status-green" : "bg-status-red"}`} />
                  <span className="w-28 text-ash">{ROLE_LABELS[x.role]}</span>
                  <span>
                    <span className="text-bone">{x.filledBy ?? "GAP"}</span>
                    <span className="block text-[10px] text-muted">{x.basis}</span>
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-3 font-mono text-[9px] tracking-[0.25em] text-muted">CAPITAL WHOSE MANDATE FITS</div>
            {i.matches.map((m) => (
              <div key={m.source.id} className="mt-1 text-[11px]">
                <span className="font-mono text-gold">{m.fit}</span> <span className="text-bone">{m.source.name}</span> <span className="text-muted">({m.source.kind.replace("_", " ")})</span>
                <div className="text-ash">{m.why.join(" · ")}</div>
              </div>
            ))}
            {!i.matches.length && <p className="text-[11px] text-muted">No capital mandate on file fits. Add sources under CAPITAL.</p>}
          </>
        )}
        {tab === "DEAL TEAM" && team && (
          <ol className="space-y-2">
            {team.reports.map((r) => (
              <li key={r.agent}>
                <div className="font-mono text-[10px] tracking-wider text-gold">
                  {AGENTS[r.agent].icon} {AGENTS[r.agent].label.toUpperCase()} <span className="text-muted">· {AGENTS[r.agent].job}</span>
                </div>
                <ul className="ml-4 list-disc text-[11px] text-ash">
                  {r.lines.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        )}
        {tab === "MONEY" && (
          <>
            <table className="w-full text-[12px]">
              <tbody>
                <tr className="border-b border-elevated/60">
                  <td className="py-1 text-muted">Raw land value</td>
                  <td className="text-right font-mono">{i.value.raw != null ? fmtUsd(i.value.raw) : "—"}</td>
                </tr>
                <tr className="border-b border-elevated/60">
                  <td className="py-1 text-muted">Powered-land value</td>
                  <td className="text-right font-mono">{i.value.powered ? fmtUsd(i.value.powered) : "—"}</td>
                </tr>
                <tr className="border-b border-elevated/60">
                  <td className="py-1 text-muted">Uplift from power</td>
                  <td className="text-right font-mono text-gold">{i.value.uplift ? fmtUsd(i.value.uplift) : "—"}</td>
                </tr>
              </tbody>
            </table>
            <p className="mt-2 text-[10px] text-muted">{i.value.basis}</p>
            <div className="mt-3 font-mono text-[9px] tracking-[0.25em] text-muted">HOW YOU GET PAID (V1)</div>
            <ul className="mt-1 list-disc pl-4 text-[11px] text-ash">
              <li>Intelligence: the site brief and shortlist as a paid report or subscription.</li>
              <li>Sourcing: a fixed-fee search engagement for a developer or fund.</li>
              <li>Coordination: a consulting retainer from the side that hires you.</li>
              <li>Fees tied to the sale or to investor money: only through a licensed partner.</li>
            </ul>
          </>
        )}
        {tab === "ACTIONS" && (
          <>
            {!queue.length && <p className="text-[11px] text-muted">Run the deal team to queue its actions.</p>}
            {queue.map((q) => (
              <div key={q.id} className={`mb-2 rounded border p-2 ${TEMP_CLS[q.ruling.temperature]}`}>
                <div className="flex items-baseline gap-2 text-[11px]">
                  <span className="font-mono font-bold">{q.ruling.temperature}</span>
                  <span className="text-bone">{ACTION_LABELS[q.kind]}</span>
                  <span className="text-ash">{q.summary}</span>
                  <span className="ml-auto font-mono text-[9px] uppercase text-muted">{q.status}</span>
                </div>
                <div className="text-[10px] text-ash">{q.ruling.reasons[0]}</div>
                {q.draft && <textarea readOnly rows={7} value={q.draft} onFocus={(e) => e.currentTarget.select()} className="mt-1 w-full rounded border border-elevated bg-[#02040A] p-2 font-mono text-[10px] text-bone" />}
                {q.status === "queued" && (
                  <div className="mt-1 flex gap-1 font-mono text-[9px]">
                    <button onClick={() => onQueue(q.id, "approved")} className="rounded border border-elevated px-2 py-0.5 text-bone">
                      APPROVE
                    </button>
                    <button onClick={() => onQueue(q.id, "declined")} className="rounded border border-elevated px-2 py-0.5 text-ash">
                      DECLINE
                    </button>
                  </div>
                )}
                {(q.status === "cleared" || q.status === "approved") && (
                  <div className="mt-1 flex items-center gap-2 font-mono text-[9px]">
                    <span className="text-muted">Cleared. Copy the draft and send it yourself.</span>
                    <button onClick={() => onQueue(q.id, "sent")} className="rounded border border-elevated px-2 py-0.5 text-bone">
                      MARK SENT
                    </button>
                  </div>
                )}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Deals + negotiation console ────────────────────────────────────────────

function DealsView({ deals, setDeals, dealId, setDealId, playbook, recordOffer, memories }: { deals: Deal[]; setDeals: (f: (d: Deal[]) => Deal[]) => void; dealId: string | null; setDealId: (id: string) => void; playbook: Playbook; recordOffer: (id: string, from: "us" | "them", amount: number, note?: string) => void; memories: Memory[] }) {
  const d = deals.find((x) => x.id === dealId) ?? deals[0];
  const [their, setTheir] = useState("");
  const [edit, setEdit] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  if (!d) return <p className="text-sm text-ash">No deals yet. Open a site and press START DEAL.</p>;
  const lastThem = [...d.offers].reverse().find((o) => o.from === "them");
  const read = d.terms && lastThem ? negotiate(d, lastThem.amount, playbook) : null;
  const cp = d.parties.find((p) => p.id === d.counterpartyId);
  const mem = cp ? recall(memories, cp.name) : null;
  const setTerms = (patch: Partial<NonNullable<Deal["terms"]>>) => setDeals((x) => x.map((y) => (y.id === d.id && y.terms ? { ...y, terms: { ...y.terms, ...patch } } : y)));
  const num = (v: string) => Number(v.replace(/[$,\s]/g, "").replace(/m$/i, "e6").replace(/k$/i, "e3")) || 0;
  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap gap-1">
        {deals.map((x) => (
          <button key={x.id} onClick={() => setDealId(x.id)} className={`rounded border px-2 py-1 text-[11px] ${x.id === d.id ? "border-gold/60 text-gold" : "border-elevated text-ash"}`}>
            {x.title} <span className="font-mono text-muted">· {x.stage}</span>
          </button>
        ))}
      </div>
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <div>
          <div className="font-mono text-[9px] tracking-[0.25em] text-gold">DEAL #{d.id}</div>
          <h3 className="font-display text-lg font-bold">{d.title}</h3>
          <div className="mt-1 flex flex-wrap gap-1 font-mono text-[9px]">
            {DEAL_STAGES.map((st) => (
              <button key={st} onClick={() => setDeals((x) => x.map((y) => (y.id === d.id ? { ...y, stage: st } : y)))} className={`rounded px-1.5 py-0.5 ${st === d.stage ? "bg-gold/20 text-gold" : "text-muted hover:text-bone"}`}>
                {st}
              </button>
            ))}
          </div>
          <div className="mt-2 text-[11px] text-ash">
            Our role: {d.ourRole.replace(/_/g, " ")} · fee: {d.fee.kind}
            {d.fee.amount ? ` ${fmtUsd(d.fee.amount)}` : ""}
          </div>
          <div className="mt-1 text-[11px] text-ash">Parties: {d.parties.map((p) => `${p.name} (${p.role})`).join(" · ")}</div>
          {d.terms && (
            <>
              <div className="mt-3 font-mono text-[9px] tracking-[0.25em] text-muted">THE BOX (YOUR RULES)</div>
              <div className="mt-1 grid grid-cols-2 gap-2 text-[10px] text-muted">
                {(
                  [
                    ["anchor", "Opening"],
                    ["target", "Target"],
                    ["walkAway", "Walk-away"],
                  ] as const
                ).map(([k, l]) => (
                  <label key={k}>
                    {l}
                    <input id={`dt-${k}`} value={d.terms![k].toLocaleString("en-US")} onChange={(e) => setTerms({ [k]: num(e.target.value) })} className="w-full rounded border border-elevated bg-[#02040A] px-2 py-1 font-mono text-[12px] text-bone" />
                  </label>
                ))}
                <label>
                  Auto-step limit %
                  <input id="dt-step" value={Math.round(d.terms.maxAutoStepPct * 1000) / 10} onChange={(e) => setTerms({ maxAutoStepPct: (Number(e.target.value) || 0) / 100 })} className="w-full rounded border border-elevated bg-[#02040A] px-2 py-1 font-mono text-[12px] text-bone" />
                </label>
              </div>
              <div className="mt-1 text-[10px] text-ash">Priorities: {d.terms.priorities.join(" > ")}</div>
              <div className="text-[10px] text-ash">Non-negotiable: {d.terms.nonNegotiables.join(" · ")}</div>
            </>
          )}
          {mem && (
            <div className="mt-3">
              <div className="font-mono text-[9px] tracking-[0.25em] text-muted">MEMORY · {cp!.name}</div>
              <ul className="mt-1 list-disc pl-4 text-[11px] text-ash">
                {mem.lines.slice(0, 6).map((l) => (
                  <li key={l}>{l}</li>
                ))}
                {!mem.lines.length && <li>No history yet.</li>}
              </ul>
            </div>
          )}
        </div>
        <div>
          <div className="font-mono text-[9px] tracking-[0.25em] text-muted">OFFERS</div>
          <ol className="mt-1 space-y-0.5 text-[11px]">
            {d.offers.map((o) => (
              <li key={o.at} className={o.from === "us" ? "text-gold" : "text-cyan"}>
                <span className="font-mono text-muted">{o.at.slice(0, 10)}</span> {o.from === "us" ? "US" : "THEM"} {fmtUsd(o.amount)} <span className="text-muted">{o.note}</span>
              </li>
            ))}
          </ol>
          <form
            className="mt-2 flex gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              if (num(their) > 0) recordOffer(d.id, "them", num(their), "Logged by you");
              setTheir("");
            }}
          >
            <input id="dt-their" value={their} onChange={(e) => setTheir(e.target.value)} placeholder="Their new offer, e.g. 15.1M" className="min-w-0 flex-1 rounded border border-elevated bg-[#02040A] px-2 py-1 font-mono text-[12px] text-bone placeholder:text-muted" />
            <button className="rounded bg-cyan/15 px-2 font-mono text-[10px] text-cyan">LOG</button>
          </form>
          {read && (
            <div className={`mt-3 rounded border p-3 ${TEMP_CLS[read.ruling.temperature]}`}>
              <div className="font-mono text-[9px] tracking-[0.3em]">⚡ CEO ALERT · {read.ruling.temperature}</div>
              <div className="mt-1 text-[12px] text-bone">
                Their offer <b>{fmtUsd(read.theirOffer)}</b> · target {fmtUsd(d.terms!.target)}
              </div>
              <div className="text-[12px] text-bone">
                Recommendation:{" "}
                <b className="text-gold">{read.recommendation === "counter" ? `counter at ${fmtUsd(read.counter!)}` : read.recommendation === "accept" ? "accept (yours to approve)" : read.recommendation === "walk" ? "walk away" : "hold and ask a question"}</b>
              </div>
              {read.counter != null && (
                <div className="text-[11px] text-ash">
                  Est. {Math.round(read.pAccept * 100)}% acceptance · expected {fmtUsd(read.expectedValue)} ({read.improvement >= 0 ? "+" : "−"}
                  {fmtUsd(Math.abs(read.improvement))} vs taking theirs)
                </div>
              )}
              <ul className="mt-1 list-disc pl-4 text-[10px] text-ash">
                {read.why.map((w) => (
                  <li key={w}>{w}</li>
                ))}
                <li>
                  {read.ruling.temperature}: {read.ruling.reasons[0]}
                </li>
              </ul>
              {cp && memoryHints(memories, cp.name, read.counter, d.terms!.side).length > 0 && (
                <div className="mt-2 rounded border border-violet/30 p-2 text-[11px]">
                  <div className="font-mono text-[9px] tracking-[0.25em] text-violet">🧠 MEMORY SAYS</div>
                  <ul className="list-disc pl-4 text-ash">
                    {memoryHints(memories, cp.name, read.counter, d.terms!.side).map((h) => (
                      <li key={h}>{h}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="mt-2 flex gap-1 font-mono text-[10px] tracking-wider">
                {read.counter != null && read.ruling.temperature !== "RED" && (
                  <button onClick={() => recordOffer(d.id, "us", read.counter!, read.ruling.temperature === "GREEN" ? "Counter inside your box" : "Counter approved by you")} className="rounded bg-gold/20 px-3 py-1 text-gold">
                    SEND {fmtUsd(read.counter)}
                  </button>
                )}
                <button onClick={() => setEdit(read.counter != null ? String(read.counter) : "")} className="rounded border border-elevated px-3 py-1 text-bone">
                  EDIT
                </button>
                <button
                  onClick={() => setDeals((x) => x.map((y) => (y.id === d.id && y.terms ? { ...y, terms: { ...y.terms, maxAutoStepPct: 0 }, title: y.title.endsWith(" · you have it") ? y.title : `${y.title} · you have it` } : y)))}
                  className="rounded border border-elevated px-3 py-1 text-bone"
                  title="Turn off auto-clearing on this deal: every counter waits for you"
                >
                  TAKE OVER
                </button>
              </div>
              {edit != null && (
                <form
                  className="mt-2 flex gap-1"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const v = num(edit);
                    const r = rule({ id: "e", dealId: d.id, kind: "counteroffer", summary: "Edited counter", amount: v }, d, playbook);
                    if (r.temperature === "RED") return setErr(`${r.reasons[0]} Only you can send that, outside the desk.`);
                    setErr(null);
                    recordOffer(d.id, "us", v, `Counter edited by you (${r.temperature})`);
                    setEdit(null);
                  }}
                >
                  <input id="dt-edit" value={edit} onChange={(e) => setEdit(e.target.value)} className="min-w-0 flex-1 rounded border border-elevated bg-[#02040A] px-2 py-1 font-mono text-[12px] text-bone" />
                  <button className="rounded bg-gold/20 px-2 font-mono text-[10px] text-gold">RECORD COUNTER</button>
                </form>
              )}
              {err && <p className="mt-1 text-[11px] text-status-red">{err}</p>}
              <p className="mt-2 text-[10px] text-muted">The desk records the counter; you send it. Accepting, signing, money and ownership always stop for you.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CapitalView({ capital, sites, memories }: { capital: CapitalSource[]; sites: SiteIntel[]; memories: Memory[] }) {
  return (
    <div className="mx-auto max-w-5xl">
      <h2 className="font-mono text-[11px] tracking-[0.3em] text-gold">DATABASE A · CAPITAL</h2>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-left font-mono text-[9px] tracking-wider text-muted">
              <th className="py-1">WHO</th>
              <th>KIND</th>
              <th>BUYS</th>
              <th>MW</th>
              <th>REGIONS</th>
              <th>CHECK</th>
              <th className="text-right">SITES THAT FIT</th>
            </tr>
          </thead>
          <tbody>
            {capital.map((c) => {
              const fits = sites.filter((s) => s.matches.some((m) => m.source.id === c.id));
              const mem = recall(memories, c.name);
              return (
                <tr key={c.id} className="border-t border-elevated/60 align-top">
                  <td className="py-1.5 pr-2 text-bone">
                    {c.name}
                    {mem.lines[0] && <div className="text-[10px] text-ash">🧠 {mem.lines[0]}</div>}
                  </td>
                  <td className="pr-2 text-ash">{c.kind.replace("_", " ")}</td>
                  <td className="pr-2 text-ash">{c.mandate.assetTypes.join(", ").replace(/_/g, " ")}</td>
                  <td className="pr-2 font-mono text-ash">
                    {c.mandate.minMw ?? 0}–{c.mandate.maxMw ?? "∞"}
                  </td>
                  <td className="pr-2 text-ash">{c.mandate.regions.join(", ")}</td>
                  <td className="pr-2 font-mono text-ash">{c.mandate.checkMin ? `${fmtUsd(c.mandate.checkMin)}–${c.mandate.checkMax ? fmtUsd(c.mandate.checkMax) : "∞"}` : "—"}</td>
                  <td className="text-right font-mono text-gold">{fits.length}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SignalsView({ signals, now }: { signals: Signal[]; now: Date }) {
  return (
    <div className="mx-auto max-w-4xl">
      <h2 className="font-mono text-[11px] tracking-[0.3em] text-gold">SIGNALS · THE WORLD MOVING</h2>
      <ul className="mt-2 space-y-1.5">
        {[...signals].sort((a, b) => b.date.localeCompare(a.date)).map((g) => (
          <li key={g.id} className="text-[12px]">
            <span className="font-mono text-muted">{g.date}</span> <span className="rounded bg-elevated px-1 font-mono text-[9px] uppercase text-ash">{g.kind.replace(/_/g, " ")}</span> <span className="text-bone">{g.title}</span>
            {g.mw ? <span className="font-mono text-gold"> · {g.mw} MW</span> : null}
            {g.amountUsd ? <span className="font-mono text-gold"> · {fmtUsd(g.amountUsd)}</span> : null}
            <Ev e={g.evidence} now={now} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function PlaybookView({ playbook, setPlaybook }: { playbook: Playbook; setPlaybook: (p: Playbook) => void }) {
  return (
    <div className="mx-auto max-w-3xl text-[12px]">
      <h2 className="font-mono text-[11px] tracking-[0.3em] text-gold">THE PLAYBOOK · AUTONOMY WITH BOUNDARIES</h2>
      <div className="mt-3 grid gap-2 md:grid-cols-3">
        <div className="rounded border border-status-green/40 p-2">
          <div className="font-mono text-[10px] text-status-green">🟢 GREEN · runs underneath</div>
          <p className="text-[11px] text-ash">Research, drafts, follow-ups, scheduling, information requests, NDA drafts, non-binding proposals (if allowed), small counters that stay on your side of target.</p>
        </div>
        <div className="rounded border border-status-amber/40 p-2">
          <div className="font-mono text-[10px] text-status-amber">🟡 YELLOW · prepared, waits for you</div>
          <p className="text-[11px] text-ash">Counters past your auto-step or past target, introductions, anything without a negotiation box.</p>
        </div>
        <div className="rounded border border-status-red/40 p-2">
          <div className="font-mono text-[10px] text-status-red">🔴 RED · captain only</div>
          <p className="text-[11px] text-ash">Accepting, signing, committing money, transferring ownership, going past walk-away, investor solicitation and sale-contingent fees (licensed partner required), and any draft that claims authority you don&apos;t have.</p>
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <label className="flex items-center gap-2">
          <input id="pb-nonbinding" type="checkbox" checked={playbook.allowAutoNonbinding} onChange={(e) => setPlaybook({ ...playbook, allowAutoNonbinding: e.target.checked })} /> Non-binding proposals can go GREEN
        </label>
        <label className="flex items-center gap-2">
          <input id="pb-intros" type="checkbox" checked={playbook.requireApprovalForIntroductions} onChange={(e) => setPlaybook({ ...playbook, requireApprovalForIntroductions: e.target.checked })} /> Introductions need my approval
        </label>
        <label className="block text-[11px] text-muted">
          Follow up automatically after (days)
          <input id="pb-days" value={playbook.autoFollowUpDays} onChange={(e) => setPlaybook({ ...playbook, autoFollowUpDays: Number(e.target.value) || 0 })} className="ml-2 w-16 rounded border border-elevated bg-[#02040A] px-2 py-0.5 font-mono text-bone" />
        </label>
        <label className="block text-[11px] text-muted">
          Licensed partner (broker / placement agent / counsel) for regulated work
          <input id="pb-partner" value={playbook.licensedPartner ?? ""} onChange={(e) => setPlaybook({ ...playbook, licensedPartner: e.target.value || null })} placeholder="none yet" className="mt-1 w-full rounded border border-elevated bg-[#02040A] px-2 py-1 text-bone placeholder:text-muted" />
        </label>
      </div>
      <p className="mt-4 text-[11px] text-ash">
        Nothing leaves this desk on its own yet: GREEN means cleared to send, and you send it. When email is connected, GREEN items can go automatically under these same rules; YELLOW and RED never will.
      </p>
    </div>
  );
}

function SourcesView() {
  const PLAN: [string, string, string][] = [
    ["EIA-860 generator inventory", "eia.gov open data (API key, free)", "Generation, retirements, stranded capacity"],
    ["HIFLD substations + transmission", "ArcGIS open data", "Distance to substation / ≥230 kV line, kV class"],
    ["Georgia PSC dockets (IRP, large-load updates)", "PSC filings (PDF)", "Utility load pipeline, approved transmission, reported MW"],
    ["County parcels + zoning", "Same feed as the real-estate desk", "Acreage, owner, zoning, recorded sales"],
    ["FEMA flood zones", "NFHL layer 28", "Flood risk"],
    ["SEC EDGAR (Form D, 8-K)", "EDGAR full-text search (free)", "Funding rounds, who is raising for what"],
    ["News + press releases", "GDELT / company newsrooms", "Data-center announcements, PPAs, moratoriums"],
    ["Fiber routes", "Carrier maps (manual) · rail / interstate corridors as a proxy", "Distance to long-haul fiber"],
  ];
  return (
    <div className="mx-auto max-w-4xl">
      <h2 className="font-mono text-[11px] tracking-[0.3em] text-gold">SOURCES · WHAT FEEDS THE MACHINE</h2>
      <p className="mt-1 text-[11px] text-ash">This version runs on example data. The engine, scoring, matching, negotiation and autonomy rules are real; these are the free sources to wire next, in order.</p>
      <table className="mt-2 w-full text-[11px]">
        <tbody>
          {PLAN.map(([a, b, c]) => (
            <tr key={a} className="border-t border-elevated/60 align-top">
              <td className="py-1 pr-2 text-bone">{a}</td>
              <td className="pr-2 text-ash">{b}</td>
              <td className="text-ash">{c}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-4 font-mono text-[9px] tracking-[0.25em] text-muted">SCREENING ASSUMPTIONS (REPLACE WITH COMPS)</div>
      <ul className="mt-1 text-[11px] text-ash">
        <li>Raw industrial land {fmtUsd(CI_ASSUME.rawLandPerAcre)}/acre · powered land {fmtUsd(CI_ASSUME.poweredLandPerAcre)}/acre · {CI_ASSUME.mwPerAcre} MW per acre of campus</li>
        <li>Demand signals counted within {CI_ASSUME.activityRadiusMi} miles over {Math.round(CI_ASSUME.activityWindowDays / 30)} months</li>
      </ul>
    </div>
  );
}
