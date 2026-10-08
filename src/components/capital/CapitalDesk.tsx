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
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { LAYERS, THESIS_LABELS, ROLE_LABELS, CI_SOURCES, CI_ASSUME, analyzeSites, ciBadge, fmtUsd, layerCounts, type Site, type SiteIntel, type AssetType, type CapitalKind, type SignalKind, type CiSourceId, type Signal, type CapitalSource, type CiBadge, type CiEvidence } from "@/lib/ci-intel";
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
import { FUEL, fuelOf, cleanName, FuelChip, ScoreRing, Radar, Donut, Legend, HBars, Histogram, ConstellationGraph, SatFrame, type Fuel } from "./viz";

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

function Ev({ e, now }: { e: CiEvidence; now: Date }) {
  const b = ciBadge(e, now);
  return (
    <span className="block font-mono text-[10px] text-muted">
      <span className={BADGE_CLS[b]}>● {b}</span> {CI_SOURCES[e.source].label}
      {e.observedAt ? ` · ${e.observedAt.slice(0, 10)}` : ""} · {e.detail}
    </span>
  );
}

/** What the live infrastructure feed says about itself (data/public/ga-infra.json). */
export interface InfraFeedMeta {
  generatedAt: string;
  counts: Record<string, number>;
  sources: { label: string; url: string; records?: number }[];
}

export function CapitalDesk({
  sites: sitesIn,
  rawSites,
  feed,
  grid = null,
  signals: signalsIn,
  capital: capitalIn,
  initialDeals,
  initialMemories,
  nowIso,
  example,
}: {
  sites: SiteIntel[];
  /** Live mode: unscored sites from the feed, re-scored here as you add funds and signals. */
  rawSites?: Site[];
  feed?: InfraFeedMeta | null;
  /** Transmission lines + state outline drawn under the points. */
  grid?: GeoJSON.FeatureCollection | null;
  signals: Signal[];
  capital: CapitalSource[];
  initialDeals: Deal[];
  initialMemories: Memory[];
  nowIso: string;
  example: boolean;
}) {
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const ns = example ? "" : "live:"; // live deals never mix with the example desk's
  const [myCapital, setMyCapital] = useState<CapitalSource[]>([]);
  const [mySignals, setMySignals] = useState<Signal[]>([]);
  const signals = useMemo(() => [...signalsIn, ...mySignals], [signalsIn, mySignals]);
  const capital = useMemo(() => [...capitalIn, ...myCapital], [capitalIn, myCapital]);
  const sites = useMemo(() => (rawSites && (mySignals.length || myCapital.length) ? analyzeSites(rawSites, signals, capital, now) : sitesIn), [rawSites, sitesIn, signals, capital, now, mySignals.length, myCapital.length]);
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
    setDeals(load(`${ns}deals`, initialDeals));
    setMemories(load(`${ns}memories`, initialMemories));
    setQueue(load(`${ns}queue`, []));
    setPlaybook(load(`${ns}playbook`, DEFAULT_PLAYBOOK));
    setDismissed(load(`${ns}dismissed`, []));
    setMyCapital(load(`${ns}myCapital`, []));
    setMySignals(load(`${ns}mySignals`, []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => save(`${ns}deals`, deals), [deals]);
  useEffect(() => save(`${ns}memories`, memories), [memories]);
  useEffect(() => save(`${ns}queue`, queue), [queue]);
  useEffect(() => save(`${ns}playbook`, playbook), [playbook]);
  useEffect(() => save(`${ns}dismissed`, dismissed), [dismissed]);
  useEffect(() => save(`${ns}myCapital`, myCapital), [myCapital]);
  useEffect(() => save(`${ns}mySignals`, mySignals), [mySignals]);

  const flash = (t: string) => {
    setToast(t);
    setTimeout(() => setToast(null), 2800);
  };
  const sel = sites.find((s) => s.site.id === selId) ?? null;
  const counts = useMemo(() => layerCounts(sites, signals, capital), [sites, signals, capital]);
  const alerts = useMemo(() => ceoAlerts(deals, queue, sites, now, playbook).filter((a) => !dismissed.includes(a.id)), [deals, queue, sites, now, playbook, dismissed]);
  const team = useMemo(() => (sel ? runDealTeam(sel, signals, capital, memories, playbook, now) : null), [sel, signals, capital, memories, playbook, now]);
  const visible = layer === "all" ? sites : sites.filter((s) => s.layers.includes(layer as never));

  const points: MapPoint[] = useMemo(
    () =>
      sites.map((s) => {
        const mw = s.site.power.onsiteGenerationMw ?? s.site.power.reportedMw ?? s.site.power.estimatedMw ?? 0;
        return { id: s.site.id, lat: s.site.lat, lng: s.site.lng, score: s.score, focus: s.score, dim: layer !== "all" && !s.layers.includes(layer as never), label: `${s.site.name} · ${mw} MW`, color: example ? undefined : FUEL[fuelOf(s.site)].color, size: example ? 1 : Math.min(2.6, 0.8 + Math.sqrt(mw) / 22) };
      }),
    [sites, layer, example],
  );
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
  // ─── One sentence, four monuments (Design Council: money is a monument, the abnormal is brightest) ───
  const genMw = sites.reduce((t, i) => t + (i.site.power.onsiteGenerationMw ?? 0), 0);
  const strong = sites.filter((i) => i.score >= 50).length;
  const lead = sites[0];
  const sentence = alerts.length
    ? `${alerts.length} ${alerts.length === 1 ? "thing needs" : "things need"} you. ${alerts[0].title}.`
    : lead
      ? `Nothing needs you yet. ${cleanName(lead.site.name)} is the strongest power node on the map today.`
      : "Nothing needs you yet.";
  const Monument = ({ k, v, sub, tone = "" }: { k: string; v: string; sub: string; tone?: string }) => (
    <div className="mat-chrome min-w-0 rounded-[6px] px-4 py-3">
      <div className="eyebrow">{k}</div>
      <div className={`monument mt-1.5 ${tone}`}>{v}</div>
      <div className="mt-1 truncate text-[12px] text-[#BDB6D2]">{sub}</div>
    </div>
  );
  const mac = (
    <div className="lit shrink-0 border-b border-white/5 px-4 pb-3 pt-3">
      <p className="headline text-[22px] leading-tight text-[#F6F3FC] md:text-[26px]">{sentence}</p>
      <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Monument k="Live pipeline" v={fmtUsd(pipelineValue)} sub={activeDeals.length ? `${activeDeals.length} live deal${activeDeals.length === 1 ? "" : "s"}` : "No deals yet · open a site and start one"} />
        <Monument k="Generation on the map" v={genMw >= 1000 ? `${(genMw / 1000).toFixed(1)} GW` : `${genMw} MW`} sub={`${sites.length} power nodes · ${capital.length} capital sources`} tone={genMw ? "" : "monument-cool"} />
        <Monument k="Sites scoring 50+" v={String(strong)} sub={lead ? `Top: ${cleanName(lead.site.name)} · ${lead.score}` : "—"} tone="monument-cool" />
        <Monument k="Only you decide" v={String(control)} sub="Binding terms, money, ownership, licensed work" tone={control ? "monument-alarm" : "monument-cool"} />
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
    <div className="council fixed inset-0 z-30 flex flex-col text-bone">
      {header}
      {example && <div className="shrink-0 bg-status-amber/10 px-3 py-1 text-center font-mono text-[10px] tracking-wider text-status-amber">EXAMPLE DATA: every site, party, fund, signal and offer is fictional. Your deals, notes and approvals stay in this browser.</div>}
      {!example && feed && (
        <div className="shrink-0 bg-status-green/10 px-3 py-1 text-center font-mono text-[10px] tracking-wider text-status-green">
          LIVE · {sites.length} Georgia power nodes from public EIA / HIFLD data, pulled {feed.generatedAt.slice(0, 10)} · {capital.length} capital sources · {signals.length} signals.{" "}
          {!capital.length && <button onClick={() => setView("capital")} className="underline">Add the funds and buyers you know →</button>}
        </div>
      )}
      {mac}
      {layerBar}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <aside className="order-2 flex max-h-[34vh] min-h-0 w-full flex-col border-r border-cyan/10 bg-[#050912]/90 lg:order-1 lg:max-h-none lg:w-[300px]">
          <div className={`eyebrow px-3 pb-1 pt-3 ${alerts.length ? "!text-[#FF6B8B]" : ""}`}>Attention required · {alerts.length}</div>
          <div className="max-h-[42%] overflow-y-auto px-2">
            {alerts.map((a) => (
              <div key={a.id} className={`mb-2 rounded-[6px] p-2.5 text-[11px] ${a.temperature === "RED" ? "mat-alarm" : a.temperature === "YELLOW" ? "mat-gold" : "mat-chrome"}`}>
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
          <div className="eyebrow px-3 pb-1.5 pt-3">Strongest sites</div>
          <ol className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
            {visible.slice(0, 120).map((i, n) => {
              const fuel = fuelOf(i.site);
              const mw = i.site.power.onsiteGenerationMw ?? i.site.power.reportedMw ?? i.site.power.estimatedMw ?? null;
              return (
                <li key={i.site.id} className={n < 12 ? "ge-rise" : undefined} style={n < 12 ? { animationDelay: `${n * 35}ms` } : undefined}>
                  <button
                    onClick={() => { setSelId(i.site.id); setView("command"); setTab("WHY"); }}
                    className={`group mb-1.5 flex w-full items-stretch gap-2 overflow-hidden rounded-[6px] text-left transition-shadow ${selId === i.site.id ? "mat-gold" : "mat-obsidian hover:shadow-[inset_0_0_0_1px_rgba(244,183,64,.35)]"}`}
                  >
                    <SatFrame site={i.site} compact className="w-[92px] shrink-0">
                      <span className="monument absolute bottom-0.5 left-1.5 !text-[26px] [text-shadow:none]">{n + 1}</span>
                    </SatFrame>
                    <div className="min-w-0 flex-1 py-1.5">
                      <div className="truncate text-[12px] font-semibold text-bone">{cleanName(i.site.name)}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1">
                        <FuelChip fuel={fuel} />
                        <span className="truncate font-mono text-[9px] uppercase text-muted">{i.site.county}</span>
                      </div>
                      {mw != null && (
                        <div className="mt-1 flex items-center gap-1.5">
                          <span className="relative h-1 flex-1 overflow-hidden rounded-sm bg-elevated">
                            <span className="absolute inset-y-0 left-0" style={{ width: `${Math.min(100, (mw / 3500) * 100)}%`, background: FUEL[fuel].color }} />
                          </span>
                          <span className="font-mono text-[9px] tabular-nums text-ash">{mw.toLocaleString()} MW</span>
                        </div>
                      )}
                    </div>
                    <div className="grid place-items-center pr-1.5">
                      <ScoreRing value={i.score} size={40} stroke={3.5} />
                    </div>
                  </button>
                </li>
              );
            })}
          </ol>
        </aside>
        <main className="relative order-1 h-[34vh] min-w-0 flex-1 lg:order-2 lg:h-auto">
          <GodsEyeMap points={points} selectedId={selId} onSelect={(id) => { setSelId(id); setTab("WHY"); }} basemap="dark" terrain={false} comps={sigPoints} home={{ center: [-83.4, 32.75], zoom: 6.3, pitch: 38 }} selectZoom={11.5} overlay={grid} />
          <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_120px_rgba(2,4,10,0.95)]" />
          <div className="pointer-events-none absolute left-2 top-2 rounded border border-cyan/20 bg-[#03060D]/80 px-2 py-1 font-mono text-[9px] tracking-wider text-ash">
            {example ? (
              <>
                ● sites by score · <span className="text-gold">◆ demand signals</span> · ◇ other signals
              </>
            ) : (
              <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                {(["nuclear", "gas", "coal", "hydro", "solar", "substation"] as Fuel[]).map((f) => (
                  <span key={f} className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full" style={{ background: FUEL[f].color, boxShadow: `0 0 6px ${FUEL[f].color}` }} />
                    {FUEL[f].label}
                  </span>
                ))}
                <span className="flex items-center gap-1"><span className="h-0.5 w-4 bg-gold" />500 kV</span>
                <span className="flex items-center gap-1"><span className="h-0.5 w-4 bg-cyan" />230 kV</span>
                <span className="text-muted">· dot size = MW</span>
              </span>
            )}
          </div>
          {view !== "command" && (
            <div className="absolute inset-0 z-10 overflow-y-auto bg-[#02040A]/94 p-4 backdrop-blur-sm">
              {view === "deals" && <DealsView deals={deals} setDeals={setDeals} dealId={dealId} setDealId={setDealId} playbook={playbook} recordOffer={recordOffer} memories={memories} />}
              {view === "capital" && <CapitalView capital={capital} sites={sites} memories={memories} onAdd={(c) => { setMyCapital((x) => [c, ...x]); flash(`${c.name} added; every site re-scored.`); }} onRemove={(id) => setMyCapital((x) => x.filter((c) => c.id !== id))} mine={myCapital.map((c) => c.id)} />}
              {view === "signals" && <SignalsView signals={signals} now={now} onAdd={(g) => { setMySignals((x) => [g, ...x]); flash("Signal added; nearby sites re-scored."); }} onRemove={(id) => setMySignals((x) => x.filter((g) => g.id !== id))} mine={mySignals.map((g) => g.id)} />}
              {view === "playbook" && <PlaybookView playbook={playbook} setPlaybook={setPlaybook} />}
              {view === "sources" && <SourcesView feed={feed ?? null} example={example} />}
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
            <Overview sites={sites} onOpen={(id) => { setSelId(id); setTab("WHY"); }} />
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
      <SatFrame site={s} className="w-full">
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#02040A] via-[#02040A]/85 to-transparent px-3 pb-2.5 pt-10">
          <div className="flex flex-wrap items-center gap-1.5 font-mono text-[9px] tracking-[0.25em] text-muted">
            OPPORTUNITY · {s.id}
            {s.example ? <span className="rounded bg-status-amber/15 px-1 text-status-amber">EXAMPLE · FICTIONAL</span> : <FuelChip fuel={fuelOf(s)} />}
            {s.floodZone && /^(A|AE|V)/i.test(s.floodZone) && <span className="rounded-sm bg-status-red/15 px-1 text-status-red">FLOOD {s.floodZone}</span>}
          </div>
          <h2 className="mt-1 font-display text-xl font-bold leading-tight text-bone [text-wrap:balance]">{cleanName(s.name)}</h2>
          <div className="text-[11px] text-ash">
            {s.county} County, {s.state} · {s.acres != null ? `${s.acres} acres` : "power node"} · {s.existingUse.replace("_", " ")}
            {s.owner ? ` · ${s.owner}` : ""}
          </div>
        </div>
      </SatFrame>
      <div className="border-b border-cyan/10 p-3">
        <div className="grid grid-cols-[auto_1fr] items-center gap-3">
          <div className="grid gap-2">
            <div className="flex items-center gap-2">
              <ScoreRing value={i.score} size={76} stroke={6} sub="SCORE" label="Opportunity score" />
              <ScoreRing value={i.confidence} size={56} stroke={4} sub="CONF" label="Confidence" />
            </div>
            <PowerStats s={s} />
            <EvidenceBar b={i.badges} />
          </div>
          <Radar
            size={210}
            axes={[
              { label: "Power", value: i.factors.power.score },
              { label: "Fiber", value: i.factors.fiber.score },
              { label: "Land", value: i.factors.land.score },
              { label: "Zoning", value: i.factors.zoning.score },
              { label: "Water", value: i.factors.water.score },
              { label: "Demand", value: i.factors.activity.score },
              { label: "Capital", value: i.factors.capital.score },
            ]}
          />
        </div>
        <div className="mt-2 grid gap-1">
          {i.theses.filter((t) => t.key !== "no_go").slice(0, 3).map((t, n) => (
            <div key={t.key} className="grid grid-cols-[1fr_auto] items-center gap-2 text-[10px]">
              <span className="relative h-5 overflow-hidden rounded-sm bg-elevated/60">
                <span className="absolute inset-y-0 left-0" style={{ width: `${t.fit}%`, background: n === 0 ? "linear-gradient(90deg,#C9A84C33,#C9A84C)" : "linear-gradient(90deg,#06B6D422,#06B6D499)" }} />
                <span className="absolute inset-0 flex items-center truncate px-2 text-bone">{THESIS_LABELS[t.key]}</span>
              </span>
              <span className="w-6 text-right font-mono tabular-nums text-bone">{t.fit}</span>
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-1 font-mono text-[10px] tracking-wider">
          <button onClick={onStartDeal} className="pill px-4 py-2 text-[11px]">
            Start the deal
          </button>
          <button onClick={onRunTeam} className="pill pill-chrome px-4 py-2 text-[11px]">
            Run the deal team
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
            <ConstellationGraph site={s.name} slots={i.constellation.slots.map((x) => ({ role: x.role, label: ROLE_LABELS[x.role], filledBy: x.filledBy }))} />
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

// ─── Visual panels ────────────────────────────────────────────────────────────

function PowerStats({ s }: { s: SiteIntel["site"] }) {
  const mw = s.power.onsiteGenerationMw ?? s.power.reportedMw ?? s.power.estimatedMw;
  const cells: [string, string][] = [
    ["MW", mw != null ? mw.toLocaleString() : "?"],
    ["KV", s.power.substationKv != null ? String(s.power.substationKv) : "?"],
    ["LINE MI", s.power.transmissionMi != null ? String(s.power.transmissionMi) : "?"],
  ];
  return (
    <div className="grid grid-cols-3 gap-1">
      {cells.map(([k, v]) => (
        <div key={k} className="rounded-sm bg-elevated/50 px-1.5 py-1 text-center">
          <div className="font-mono text-[12px] font-bold tabular-nums text-bone">{v}</div>
          <div className="font-mono text-[7.5px] tracking-[0.2em] text-muted">{k}</div>
        </div>
      ))}
    </div>
  );
}

function EvidenceBar({ b }: { b: Record<CiBadge, number> }) {
  const total = Math.max(1, b.VERIFIED + b.REPORTED + b.INFERRED + b.STALE);
  const segs: [CiBadge, string][] = [["VERIFIED", "#10B981"], ["REPORTED", "#06B6D4"], ["INFERRED", "#F59E0B"], ["STALE", "#EF4444"]];
  return (
    <div title={segs.map(([k]) => `${b[k]} ${k.toLowerCase()}`).join(" · ")}>
      <div className="flex h-1.5 overflow-hidden rounded-sm bg-elevated">
        {segs.map(([k, c]) => (b[k] ? <span key={k} style={{ width: `${(b[k] / total) * 100}%`, background: c }} /> : null))}
      </div>
      <div className="mt-0.5 flex justify-between font-mono text-[8px] text-muted">
        <span className="text-status-green">{b.VERIFIED} VERIFIED</span>
        <span className="text-status-amber">{b.INFERRED} EST</span>
      </div>
    </div>
  );
}

function Overview({ sites, onOpen }: { sites: SiteIntel[]; onOpen: (id: string) => void }) {
  const plants = sites.filter((i) => i.site.existingUse === "power_plant" || i.site.power.onsiteGenerationMw != null);
  const byFuel = new Map<Fuel, number>();
  for (const i of plants) byFuel.set(fuelOf(i.site), (byFuel.get(fuelOf(i.site)) ?? 0) + (i.site.power.onsiteGenerationMw ?? 0));
  const fuelSlices = [...byFuel.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([f, v]) => ({ label: FUEL[f].label, value: Math.round(v), color: FUEL[f].color }));
  const totalMw = fuelSlices.reduce((t, x) => t + x.value, 0);
  const byCounty = new Map<string, number>();
  for (const i of plants) byCounty.set(i.site.county || "?", (byCounty.get(i.site.county || "?") ?? 0) + (i.site.power.onsiteGenerationMw ?? 0));
  const counties = [...byCounty.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([label, value]) => ({ label, value: Math.round(value) }));
  const flood = { high: sites.filter((i) => /^(A|AE|V)/i.test(i.site.floodZone ?? "")).length, low: sites.filter((i) => i.site.floodZone && !/^(A|AE|V)/i.test(i.site.floodZone)).length };
  const unknownFlood = sites.length - flood.high - flood.low;
  const kv500 = sites.filter((i) => (i.site.power.substationKv ?? 0) >= 450 && i.site.existingUse === "substation").length;
  const top = sites[0];
  const next = sites.slice(1, 5);
  const Label = ({ children }: { children: ReactNode }) => <div className="mb-1.5 font-mono text-[9px] tracking-[0.28em] text-muted">{children}</div>;
  if (!top) return <p className="p-6 text-[12px] text-ash">No sites yet. The weekly infrastructure feed fills this board.</p>;
  return (
    <div className="grid gap-4 p-3">
      <div>
        <Label>#1 RIGHT NOW</Label>
        <button onClick={() => onOpen(top.site.id)} className="group block w-full overflow-hidden rounded border border-gold/40 text-left hover:border-gold">
          <SatFrame site={top.site} className="w-full">
            <div className="absolute inset-x-0 bottom-0 flex items-end gap-3 bg-gradient-to-t from-[#02040A] via-[#02040A]/80 to-transparent px-3 pb-2.5 pt-10">
              <div className="min-w-0 flex-1">
                <FuelChip fuel={fuelOf(top.site)} />
                <div className="mt-1 truncate font-display text-lg font-bold text-bone">{cleanName(top.site.name)}</div>
                <div className="truncate text-[11px] text-ash">
                  {top.site.county} County · {(top.site.power.onsiteGenerationMw ?? top.site.power.estimatedMw ?? 0).toLocaleString()} MW · {top.why[0] ?? ""}
                </div>
              </div>
              <ScoreRing value={top.score} size={60} stroke={5} sub="SCORE" />
            </div>
          </SatFrame>
        </button>
        <div className="mt-2 grid grid-cols-4 gap-1.5">
          {next.map((i) => (
            <button key={i.site.id} onClick={() => onOpen(i.site.id)} className="overflow-hidden rounded border border-elevated/70 text-left hover:border-cyan/50" title={i.site.name}>
              <SatFrame site={i.site} compact>
                <span className="absolute right-1 top-1 rounded-sm bg-[#02040A]/85 px-1 font-mono text-[10px] font-bold text-bone">{i.score}</span>
              </SatFrame>
              <div className="truncate px-1 py-0.5 text-[9px] text-ash">{cleanName(i.site.name)}</div>
            </button>
          ))}
        </div>
      </div>

      {totalMw > 0 && (
        <div>
          <Label>GENERATION ON THE MAP · BY FUEL</Label>
          <div className="flex items-center gap-3">
            <Donut slices={fuelSlices} center={totalMw >= 1000 ? `${(totalMw / 1000).toFixed(1)}` : String(totalMw)} unit={totalMw >= 1000 ? "GW" : "MW"} />
            <Legend items={fuelSlices.slice(0, 7).map((x) => ({ label: x.label, value: `${Math.round((x.value / totalMw) * 100)}%`, color: x.color }))} />
          </div>
        </div>
      )}

      {counties.length > 0 && (
        <div>
          <Label>WHERE THE MEGAWATTS SIT · TOP COUNTIES</Label>
          <HBars rows={counties} unit="MW" />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="min-w-0">
          <Label>SCORE SPREAD · {sites.length} NODES</Label>
          <Histogram values={sites.map((i) => i.score)} highlight={top.score} />
        </div>
        <div className="min-w-0">
          <Label>FLOOD EXPOSURE</Label>
          <div className="flex h-3 overflow-hidden rounded-sm bg-elevated">
            <span style={{ width: `${(flood.low / sites.length) * 100}%` }} className="bg-status-green/70" />
            <span style={{ width: `${(flood.high / sites.length) * 100}%` }} className="bg-status-red" />
          </div>
          <ul className="mt-1.5 grid gap-0.5 text-[10px]">
            <li className="flex justify-between"><span className="text-ash">Outside flood zone</span><span className="font-mono text-status-green">{flood.low}</span></li>
            <li className="flex justify-between"><span className="text-ash">In FEMA zone A / AE</span><span className="font-mono text-status-red">{flood.high}</span></li>
            {unknownFlood > 0 && <li className="flex justify-between"><span className="text-ash">Not mapped</span><span className="font-mono text-muted">{unknownFlood}</span></li>}
          </ul>
          <div className="mt-2 font-mono text-[9px] tracking-[0.2em] text-muted">500 kV BACKBONE</div>
          <div className="font-mono text-lg font-bold text-gold">{kv500} <span className="text-[10px] font-normal text-ash">substations</span></div>
        </div>
      </div>
    </div>
  );
}

const INPUT = "rounded border border-elevated bg-[#02040A] px-2 py-1 text-[11px] text-bone placeholder:text-muted";
const KINDS: CapitalKind[] = ["infra_fund", "private_equity", "family_office", "developer", "hyperscaler", "utility", "lender", "strategic"];
const ASSETS: AssetType[] = ["powered_land", "datacenter", "generation", "stranded_power", "fiber", "land"];
const SIGNAL_KINDS: SignalKind[] = ["dc_announcement", "large_load_filing", "transmission_project", "substation_project", "zoning_change", "land_sale", "ppa", "funding_round", "plant_retirement", "moratorium", "fiber_build"];
const EVIDENCE: CiSourceId[] = ["news", "company", "sec_filing", "utility_irp", "interconnection", "county_zoning", "conversation", "manual"];
const num = (v: string) => (v.trim() === "" || !Number.isFinite(Number(v.replace(/[$,]/g, ""))) ? null : Number(v.replace(/[$,]/g, "")));

function AddCapital({ onAdd }: { onAdd: (c: CapitalSource) => void }) {
  const [f, setF] = useState({ name: "", kind: "infra_fund" as CapitalKind, assets: ["powered_land", "datacenter"] as AssetType[], minMw: "", maxMw: "", regions: "GA, Southeast", checkMin: "", checkMax: "", lastActive: "", source: "news" as CiSourceId, detail: "", url: "" });
  const set = (k: keyof typeof f, v: unknown) => setF({ ...f, [k]: v });
  function submit() {
    if (!f.name.trim()) return;
    const at = new Date().toISOString();
    onAdd({
      id: `MY-C-${Date.now()}`,
      name: f.name.trim(),
      kind: f.kind,
      mandate: { assetTypes: f.assets, minMw: num(f.minMw), maxMw: num(f.maxMw), regions: f.regions.split(",").map((r) => r.trim()).filter(Boolean), checkMin: num(f.checkMin), checkMax: num(f.checkMax) },
      lastActive: f.lastActive || null,
      evidence: { source: f.source, detail: f.detail || "Entered by you", observedAt: f.lastActive || at.slice(0, 10), url: f.url || undefined },
    });
    setF({ ...f, name: "", minMw: "", maxMw: "", checkMin: "", checkMax: "", detail: "", url: "" });
  }
  return (
    <div className="mt-2 rounded border border-gold/30 p-2">
      <div className="font-mono text-[9px] tracking-[0.25em] text-gold">+ ADD A FUND / BUYER YOU KNOW · stays in this browser</div>
      <div className="mt-1 grid gap-1 md:grid-cols-4">
        <input className={INPUT} placeholder="Name (as they publish it)" value={f.name} onChange={(e) => set("name", e.target.value)} />
        <select className={INPUT} value={f.kind} onChange={(e) => set("kind", e.target.value)}>
          {KINDS.map((k) => <option key={k} value={k}>{k.replace("_", " ")}</option>)}
        </select>
        <input className={INPUT} placeholder="Min MW" value={f.minMw} onChange={(e) => set("minMw", e.target.value)} />
        <input className={INPUT} placeholder="Max MW" value={f.maxMw} onChange={(e) => set("maxMw", e.target.value)} />
        <input className={INPUT} placeholder="Regions: GA, Southeast, US" value={f.regions} onChange={(e) => set("regions", e.target.value)} />
        <input className={INPUT} placeholder="Check min $" value={f.checkMin} onChange={(e) => set("checkMin", e.target.value)} />
        <input className={INPUT} placeholder="Check max $" value={f.checkMax} onChange={(e) => set("checkMax", e.target.value)} />
        <input className={INPUT} type="date" title="Last seen active" value={f.lastActive} onChange={(e) => set("lastActive", e.target.value)} />
        <select className={INPUT} value={f.source} onChange={(e) => set("source", e.target.value)}>
          {EVIDENCE.map((k) => <option key={k} value={k}>{CI_SOURCES[k].label}</option>)}
        </select>
        <input className={`${INPUT} md:col-span-2`} placeholder="What shows it (e.g. 'closed $1B fund for powered land, 2026')" value={f.detail} onChange={(e) => set("detail", e.target.value)} />
        <input className={INPUT} placeholder="Link" value={f.url} onChange={(e) => set("url", e.target.value)} />
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-ash">
        Buys:
        {ASSETS.map((a) => (
          <label key={a} className="flex items-center gap-1">
            <input type="checkbox" checked={f.assets.includes(a)} onChange={(e) => set("assets", e.target.checked ? [...f.assets, a] : f.assets.filter((x) => x !== a))} /> {a.replace("_", " ")}
          </label>
        ))}
        <button onClick={submit} className="ml-auto rounded border border-gold/60 px-2 py-0.5 font-mono text-gold hover:bg-gold/10">ADD</button>
      </div>
    </div>
  );
}

function AddSignal({ onAdd }: { onAdd: (g: Signal) => void }) {
  const [f, setF] = useState({ kind: "dc_announcement" as SignalKind, title: "", date: "", where: "", county: "", mw: "", amount: "", party: "", source: "news" as CiSourceId, url: "" });
  const set = (k: keyof typeof f, v: unknown) => setF({ ...f, [k]: v });
  const ll = f.where.split(",").map((x) => Number(x.trim()));
  const okLL = ll.length === 2 && ll.every(Number.isFinite) && Math.abs(ll[0]) <= 90;
  function submit() {
    if (!f.title.trim()) return;
    const date = f.date || new Date().toISOString().slice(0, 10);
    onAdd({ id: `MY-S-${Date.now()}`, kind: f.kind, title: f.title.trim(), date, lat: okLL ? ll[0] : null, lng: okLL ? ll[1] : null, county: f.county || undefined, mw: num(f.mw), amountUsd: num(f.amount), party: f.party || undefined, evidence: { source: f.source, detail: f.title.trim(), observedAt: date, url: f.url || undefined } });
    setF({ ...f, title: "", where: "", mw: "", amount: "", party: "", url: "" });
  }
  return (
    <div className="mt-2 rounded border border-gold/30 p-2">
      <div className="font-mono text-[9px] tracking-[0.25em] text-gold">+ ADD A SIGNAL YOU SAW · stays in this browser</div>
      <div className="mt-1 grid gap-1 md:grid-cols-4">
        <select className={INPUT} value={f.kind} onChange={(e) => set("kind", e.target.value)}>
          {SIGNAL_KINDS.map((k) => <option key={k} value={k}>{k.replace(/_/g, " ")}</option>)}
        </select>
        <input className={`${INPUT} md:col-span-3`} placeholder="What happened (headline)" value={f.title} onChange={(e) => set("title", e.target.value)} />
        <input className={INPUT} type="date" value={f.date} onChange={(e) => set("date", e.target.value)} />
        <input className={`${INPUT} ${f.where && !okLL ? "border-status-red/60" : ""}`} placeholder="Where: lat, lng (right-click in Google Maps)" value={f.where} onChange={(e) => set("where", e.target.value)} />
        <input className={INPUT} placeholder="County" value={f.county} onChange={(e) => set("county", e.target.value)} />
        <input className={INPUT} placeholder="Who (company / utility / fund)" value={f.party} onChange={(e) => set("party", e.target.value)} />
        <input className={INPUT} placeholder="MW" value={f.mw} onChange={(e) => set("mw", e.target.value)} />
        <input className={INPUT} placeholder="$ amount" value={f.amount} onChange={(e) => set("amount", e.target.value)} />
        <select className={INPUT} value={f.source} onChange={(e) => set("source", e.target.value)}>
          {EVIDENCE.map((k) => <option key={k} value={k}>{CI_SOURCES[k].label}</option>)}
        </select>
        <input className={INPUT} placeholder="Link" value={f.url} onChange={(e) => set("url", e.target.value)} />
      </div>
      <div className="mt-1 flex items-center text-[10px] text-ash">
        Without a location a signal is listed but can&apos;t move a site&apos;s demand score.
        <button onClick={submit} className="ml-auto rounded border border-gold/60 px-2 py-0.5 font-mono text-gold hover:bg-gold/10">ADD</button>
      </div>
    </div>
  );
}

function CapitalView({ capital, sites, memories, onAdd, onRemove, mine }: { capital: CapitalSource[]; sites: SiteIntel[]; memories: Memory[]; onAdd: (c: CapitalSource) => void; onRemove: (id: string) => void; mine: string[] }) {
  return (
    <div className="mx-auto max-w-5xl">
      <h2 className="font-mono text-[11px] tracking-[0.3em] text-gold">DATABASE A · CAPITAL</h2>
      <p className="mt-1 text-[11px] text-ash">Track who is buying and what their published mandate says. Matching a site to a fund is research; soliciting investors or taking a fee on a sale goes through a licensed partner.</p>
      <AddCapital onAdd={onAdd} />
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
                  <td className="text-right font-mono text-gold">
                    {fits.length}
                    {mine.includes(c.id) && (
                      <button onClick={() => onRemove(c.id)} className="ml-2 text-muted hover:text-status-red" title="Remove">
                        ✕
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!capital.length && <p className="mt-2 text-[11px] text-muted">No capital sources yet. Add the funds, developers and hyperscalers you track; every site re-scores against them.</p>}
      </div>
    </div>
  );
}

function SignalsView({ signals, now, onAdd, onRemove, mine }: { signals: Signal[]; now: Date; onAdd: (g: Signal) => void; onRemove: (id: string) => void; mine: string[] }) {
  return (
    <div className="mx-auto max-w-4xl">
      <h2 className="font-mono text-[11px] tracking-[0.3em] text-gold">SIGNALS · THE WORLD MOVING</h2>
      <AddSignal onAdd={onAdd} />
      {!signals.length && <p className="mt-2 text-[11px] text-muted">No signals yet. Data-center announcements, large-load filings, rezonings and moratoriums near a site raise or sink its score.</p>}
      <ul className="mt-2 space-y-1.5">
        {[...signals].sort((a, b) => b.date.localeCompare(a.date)).map((g) => (
          <li key={g.id} className="text-[12px]">
            <span className="font-mono text-muted">{g.date}</span> <span className="rounded bg-elevated px-1 font-mono text-[9px] uppercase text-ash">{g.kind.replace(/_/g, " ")}</span> <span className="text-bone">{g.title}</span>
            {g.mw ? <span className="font-mono text-gold"> · {g.mw} MW</span> : null}
            {g.amountUsd ? <span className="font-mono text-gold"> · {fmtUsd(g.amountUsd)}</span> : null}
            {mine.includes(g.id) && (
              <button onClick={() => onRemove(g.id)} className="ml-2 text-muted hover:text-status-red" title="Remove">
                ✕
              </button>
            )}
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

function SourcesView({ feed, example }: { feed: InfraFeedMeta | null; example: boolean }) {
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
      {feed ? (
        <div className="mt-2 rounded border border-status-green/40 p-2 text-[11px]">
          <div className="font-mono text-[9px] tracking-[0.25em] text-status-green">● LIVE FEED · pulled {feed.generatedAt.slice(0, 16).replace("T", " ")} UTC · refreshes weekly</div>
          <div className="mt-1 text-ash">{Object.entries(feed.counts).map(([k, v]) => `${v.toLocaleString()} ${k}`).join(" · ")}</div>
          <ul className="mt-1">
            {feed.sources.map((s) => (
              <li key={s.url} className="truncate text-ash">
                {s.label}{s.records != null ? ` (${s.records.toLocaleString()})` : ""} · <a href={s.url} target="_blank" rel="noreferrer" className="text-cyan hover:underline">{s.url}</a>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-1 text-[11px] text-ash">{example ? "This view runs on example data. " : ""}The engine, scoring, matching, negotiation and autonomy rules are real; these are the free sources, in order.</p>
      )}
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
