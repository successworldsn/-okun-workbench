/**
 * God's Eye Deal Engine — the deal brain, the negotiation engine inside your
 * box, the GREEN / YELLOW / RED autonomy boundary, the compliance guard, the
 * memory, the CEO interrupt, and the deal team that turns a site into a deal.
 *
 * You are the principal. The engine may research, draft, follow up and
 * negotiate inside the rules you set; it never signs, accepts, commits money,
 * transfers ownership, or does anything a license is required for. Those are
 * RED and stop for you. Pure functions: nothing here sends anything — a
 * GREEN action is "cleared to send", and sending is a separate, wired step.
 */
import type { SiteIntel, CapitalSource, Signal, Role } from "./ci-intel.ts";

const fmt = (v: number) => (v >= 1e9 ? `$${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : `$${Math.round(v).toLocaleString("en-US")}`);
const DAY = 86_400_000;

// ─── Deal record ────────────────────────────────────────────────────────────

export const DEAL_STAGES = ["SIGNAL", "THESIS", "OUTREACH", "CONVERSATION", "TERMS", "NEGOTIATION", "AGREEMENT", "CLOSED", "DEAD"] as const;
export type DealStage = (typeof DEAL_STAGES)[number];

/** How you get paid. Anything transaction-based on real estate or securities is RED until a licensed structure exists. */
export type OurRole = "research" | "sourcing_consultant" | "project_coordinator" | "principal" | "licensed_partner";

export interface NegotiationTerms {
  side: "sell" | "buy"; // sell = we want a higher number (our client sells / we sell an option); buy = lower
  target: number;
  anchor: number; // our opening number
  walkAway: number; // floor for sell, ceiling for buy
  priorities: ("economics" | "speed" | "relationship" | "control" | "risk")[];
  nonNegotiables: string[];
  maxAutoStepPct: number; // a counter that moves us less than this (and stays on the right side of target) can go GREEN
}

export interface Offer {
  at: string;
  from: "us" | "them";
  amount: number;
  note?: string;
}

export interface Party {
  id: string;
  name: string;
  role: Role | "advisor" | "other";
  org?: string;
  contact?: string; // as you entered it
}

export interface Deal {
  id: string;
  title: string;
  siteId: string | null;
  stage: DealStage;
  ourRole: OurRole;
  parties: Party[];
  counterpartyId: string | null; // who we're negotiating with
  assetValue: number | null;
  fee: { kind: "retainer" | "success_fee" | "consulting" | "none"; amount: number | null };
  terms: NegotiationTerms | null;
  offers: Offer[];
  createdAt: string;
  updatedAt: string;
  example?: boolean;
}

export function newDealFromSite(i: SiteIntel, now: Date): Deal {
  const pv = i.value.powered ?? i.value.raw ?? 0;
  const parties: Party[] = i.constellation.slots.filter((s) => s.filledBy).map((s) => ({ id: `${s.role}:${s.filledBy}`, name: s.filledBy!, role: s.role }));
  return {
    id: `D-${i.site.id}-${now.getTime().toString(36)}`,
    title: `${i.site.name} · ${i.theses[0]?.key.replace(/_/g, " ")}`,
    siteId: i.site.id,
    stage: "THESIS",
    ourRole: "sourcing_consultant",
    parties,
    counterpartyId: parties.find((p) => p.role === "developer")?.id ?? parties.find((p) => p.role === "capital")?.id ?? null,
    assetValue: pv,
    fee: { kind: "consulting", amount: null },
    terms: { side: "sell", target: Math.round(pv), anchor: Math.round(pv * 1.12), walkAway: Math.round(pv * 0.85), priorities: ["economics", "speed", "relationship", "control", "risk"], nonNegotiables: ["No exclusivity without a fee", "Buyer pays its own diligence"], maxAutoStepPct: 0.03 },
    offers: [],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

// ─── Autonomy boundary ──────────────────────────────────────────────────────

export type Temperature = "GREEN" | "YELLOW" | "RED";

export type ActionKind =
  | "research"
  | "draft"
  | "follow_up"
  | "schedule"
  | "info_request"
  | "nda_draft"
  | "nonbinding_proposal"
  | "counteroffer"
  | "introduction"
  | "accept_offer"
  | "sign_agreement"
  | "commit_funds"
  | "transfer_ownership"
  | "investor_solicitation"
  | "fee_on_sale";

export const ACTION_LABELS: Record<ActionKind, string> = {
  research: "Research",
  draft: "Draft",
  follow_up: "Follow up",
  schedule: "Schedule meeting",
  info_request: "Request information",
  nda_draft: "Draft NDA",
  nonbinding_proposal: "Non-binding proposal",
  counteroffer: "Counteroffer",
  introduction: "Introduce parties",
  accept_offer: "Accept offer",
  sign_agreement: "Sign agreement",
  commit_funds: "Commit money",
  transfer_ownership: "Transfer ownership",
  investor_solicitation: "Solicit investors",
  fee_on_sale: "Success fee on a sale",
};

export interface Playbook {
  autoFollowUpDays: number;
  allowAutoNonbinding: boolean;
  requireApprovalForIntroductions: boolean;
  licensedPartner: string | null; // a licensed broker / attorney / placement agent you work with
}

export const DEFAULT_PLAYBOOK: Playbook = { autoFollowUpDays: 4, allowAutoNonbinding: true, requireApprovalForIntroductions: true, licensedPartner: null };

export interface ProposedAction {
  id: string;
  dealId: string | null;
  kind: ActionKind;
  summary: string;
  amount?: number | null;
  draft?: string;
}

export interface Ruling {
  temperature: Temperature;
  reasons: string[];
  needs: "none" | "your approval" | "you, personally" | "a licensed professional + you";
}

const ALWAYS_RED: ActionKind[] = ["accept_offer", "sign_agreement", "commit_funds", "transfer_ownership"];

/**
 * The compliance guard: raising money from investors, or taking a fee that
 * depends on a real-estate sale or a securities transaction, needs a license
 * (broker, placement agent) or a licensed partner. The engine never does
 * these on its own, and never presents you as having authority you lack.
 */
export function complianceGuard(a: ProposedAction, deal: Deal | null, pb: Playbook): string[] {
  const flags: string[] = [];
  if (a.kind === "investor_solicitation") flags.push("Soliciting investors for a pooled vehicle can be a securities offering: securities counsel and a licensed placement agent first.");
  if (a.kind === "fee_on_sale" || (deal?.fee.kind === "success_fee" && ["accept_offer", "sign_agreement"].includes(a.kind)))
    flags.push(`A fee that depends on a real-estate sale generally requires a Georgia real-estate license${pb.licensedPartner ? ` (route through ${pb.licensedPartner})` : ""}.`);
  if (/guarantee|assured|risk-free|we represent the owner/i.test(`${a.summary} ${a.draft ?? ""}`)) flags.push("Draft claims authority or certainty we don't have: rewrite before sending.");
  return flags;
}

export function rule(a: ProposedAction, deal: Deal | null, pb: Playbook = DEFAULT_PLAYBOOK): Ruling {
  const compliance = complianceGuard(a, deal, pb);
  if (compliance.length) return { temperature: "RED", reasons: compliance, needs: "a licensed professional + you" };
  if (ALWAYS_RED.includes(a.kind)) return { temperature: "RED", reasons: [`${ACTION_LABELS[a.kind]} is binding or moves money/ownership.`], needs: "you, personally" };
  if (a.kind === "counteroffer") {
    const t = deal?.terms;
    if (!t || a.amount == null) return { temperature: "YELLOW", reasons: ["No negotiation box set for this deal."], needs: "your approval" };
    const wrongSideOfWalk = t.side === "sell" ? a.amount < t.walkAway : a.amount > t.walkAway;
    if (wrongSideOfWalk) return { temperature: "RED", reasons: [`${fmt(a.amount)} is past your walk-away ${fmt(t.walkAway)}.`], needs: "you, personally" };
    const last = [...(deal!.offers ?? [])].reverse().find((o) => o.from === "us")?.amount ?? t.anchor;
    const step = Math.abs(last - a.amount) / last;
    const insideTarget = t.side === "sell" ? a.amount >= t.target : a.amount <= t.target;
    if (insideTarget && step <= t.maxAutoStepPct) return { temperature: "GREEN", reasons: [`Small move (${(step * 100).toFixed(1)}%) that stays on your side of target ${fmt(t.target)}.`], needs: "none" };
    return { temperature: "YELLOW", reasons: [insideTarget ? `Moves ${(step * 100).toFixed(1)}%, more than your ${(t.maxAutoStepPct * 100).toFixed(0)}% auto limit.` : `Gives up ground past target ${fmt(t.target)}.`], needs: "your approval" };
  }
  if (a.kind === "nonbinding_proposal") return pb.allowAutoNonbinding ? { temperature: "GREEN", reasons: ["Non-binding, inside your playbook."], needs: "none" } : { temperature: "YELLOW", reasons: ["Your playbook asks to see proposals first."], needs: "your approval" };
  if (a.kind === "introduction") return pb.requireApprovalForIntroductions ? { temperature: "YELLOW", reasons: ["Introductions spend your relationships."], needs: "your approval" } : { temperature: "GREEN", reasons: ["Playbook allows introductions."], needs: "none" };
  return { temperature: "GREEN", reasons: ["Routine: research, drafting, follow-up, scheduling or information request."], needs: "none" };
}

// ─── Negotiation engine ─────────────────────────────────────────────────────

export interface NegotiationRead {
  theirOffer: number;
  recommendation: "accept" | "counter" | "hold" | "walk";
  counter: number | null;
  pAccept: number; // estimated chance they accept our counter
  expectedValue: number; // p × counter + (1 − p) × (their offer, discounted for the risk of losing it)
  improvement: number; // expected value − taking their offer now
  why: string[];
  ruling: Ruling;
}

/** Logistic guess at acceptance from how far our counter is from their number (gap as a share of their offer). */
export function acceptProbability(counter: number, theirs: number, rounds: number): number {
  const gap = Math.abs(counter - theirs) / Math.max(1, theirs);
  const p = 1 / (1 + Math.exp(9 * (gap - 0.2 + 0.02 * rounds)));
  return Math.round(Math.min(0.97, Math.max(0.03, p)) * 100) / 100;
}

export function negotiate(deal: Deal, theirOffer: number, pb: Playbook = DEFAULT_PLAYBOOK): NegotiationRead {
  const t = deal.terms!;
  const sell = t.side === "sell";
  const better = (a: number, b: number) => (sell ? a > b : a < b);
  // Rounds already played, not counting the offer we're answering if it's already on the record.
  const theirs = deal.offers.filter((o) => o.from === "them");
  const rounds = Math.max(0, theirs.length - (theirs.at(-1)?.amount === theirOffer ? 1 : 0));
  const lastUs = [...deal.offers].reverse().find((o) => o.from === "us")?.amount ?? t.anchor;
  const why: string[] = [];

  if (!better(t.target, theirOffer)) {
    why.push(`Their ${fmt(theirOffer)} meets your target ${fmt(t.target)}.`);
    const ruling = rule({ id: "x", dealId: deal.id, kind: "accept_offer", summary: "Accept", amount: theirOffer }, deal, pb);
    return { theirOffer, recommendation: "accept", counter: null, pAccept: 1, expectedValue: theirOffer, improvement: 0, why, ruling };
  }
  // Concede a shrinking share of the gap each round: 35%, 25%, 18%, 12%…
  const share = [0.35, 0.25, 0.18, 0.12][Math.min(rounds, 3)];
  let counter = Math.round((lastUs - (lastUs - theirOffer) * share) / 10_000) * 10_000;
  if (sell) counter = Math.max(counter, t.walkAway);
  else counter = Math.min(counter, t.walkAway);
  const pastWalk = sell ? theirOffer < t.walkAway : theirOffer > t.walkAway;
  if (pastWalk) why.push(`Their ${fmt(theirOffer)} is past your walk-away ${fmt(t.walkAway)}: counter once, then be ready to walk.`);
  const p = acceptProbability(counter, theirOffer, rounds);
  // If they don't take the counter they usually move part of the way (~35% of the gap); small chance the deal dies.
  const ev = Math.round(p * counter + (1 - p) * (theirOffer + 0.35 * (counter - theirOffer)) * 0.97);
  const improvement = sell ? ev - theirOffer : theirOffer - ev;
  why.push(`Round ${rounds + 1}: concede ${Math.round(share * 100)}% of the ${fmt(Math.abs(lastUs - theirOffer))} gap.`);
  why.push(`Priorities: ${t.priorities.join(" > ")}. Non-negotiable: ${t.nonNegotiables.join("; ") || "none set"}.`);
  if (improvement <= 0) why.push("Countering is worth less than their offer at this acceptance estimate.");
  const recommendation: NegotiationRead["recommendation"] = improvement <= 0 && !pastWalk ? "hold" : pastWalk && rounds >= 2 ? "walk" : "counter";
  const ruling = rule({ id: "x", dealId: deal.id, kind: "counteroffer", summary: "Counter", amount: counter }, deal, pb);
  return { theirOffer, recommendation, counter, pAccept: p, expectedValue: ev, improvement, why, ruling };
}

// ─── Memory ─────────────────────────────────────────────────────────────────

export interface Memory {
  id: string;
  partyName: string;
  at: string;
  kind: "call" | "email" | "meeting" | "offer" | "note";
  summary: string;
  facts: { key: "needs" | "rejected" | "prefers" | "timeline" | "budget" | "decision_maker" | "other"; value: string }[];
}

/** What we know about a party, newest first, ready to brief before the next touch. */
export function recall(memories: Memory[], partyName: string): { lines: string[]; lastTouch: string | null } {
  const mine = memories.filter((m) => m.partyName.toLowerCase() === partyName.toLowerCase()).sort((a, b) => b.at.localeCompare(a.at));
  const lines = mine.flatMap((m) => m.facts.map((f) => `${f.key.replace("_", " ")}: ${f.value} (${m.at.slice(0, 10)})`));
  return { lines: lines.length ? lines : mine.map((m) => `${m.at.slice(0, 10)} ${m.kind}: ${m.summary}`), lastTouch: mine[0]?.at ?? null };
}

// ─── CEO interrupt ──────────────────────────────────────────────────────────

export interface CeoAlert {
  id: string;
  level: "money" | "action" | "control";
  title: string;
  body: string[];
  recommendation?: string;
  dealId?: string | null;
  siteId?: string | null;
  temperature: Temperature;
  value: number; // ranks alerts
  choices: ("SEND" | "EDIT" | "TAKE OVER" | "APPROVE" | "DECLINE" | "OPEN")[];
}

/** Only what needs you, ranked by money at stake. Everything GREEN happens underneath. */
export function ceoAlerts(deals: Deal[], queue: (ProposedAction & { ruling: Ruling; status: "queued" | "cleared" | "approved" | "declined" | "sent" })[], hot: SiteIntel[], now: Date, pb: Playbook = DEFAULT_PLAYBOOK): CeoAlert[] {
  const out: CeoAlert[] = [];
  for (const d of deals) {
    if (!d.terms || ["CLOSED", "DEAD"].includes(d.stage)) continue;
    const lastThem = [...d.offers].reverse().find((o) => o.from === "them");
    const lastUs = [...d.offers].reverse().find((o) => o.from === "us");
    if (lastThem && (!lastUs || lastThem.at > lastUs.at)) {
      const n = negotiate(d, lastThem.amount, pb);
      out.push({
        id: `neg-${d.id}-${lastThem.at}`,
        level: "money",
        title: `${d.title}: they responded`,
        body: [
          `Their offer ${fmt(lastThem.amount)} · our target ${fmt(d.terms.target)} · walk-away ${fmt(d.terms.walkAway)}`,
          n.counter != null ? `Counter at ${fmt(n.counter)} · est. ${Math.round(n.pAccept * 100)}% acceptance · ${n.improvement > 0 ? "+" : ""}${fmt(n.improvement)} expected vs taking theirs` : n.why[0],
          ...n.why.slice(-2),
        ],
        recommendation: n.recommendation === "accept" ? `Accept ${fmt(lastThem.amount)} (needs you)` : n.recommendation === "counter" ? `Counter at ${fmt(n.counter!)}` : n.recommendation === "walk" ? "Walk away" : "Hold: ask a question instead of countering",
        dealId: d.id,
        temperature: n.ruling.temperature,
        value: Math.abs(n.improvement) + lastThem.amount * 0.01,
        choices: n.recommendation === "accept" ? ["APPROVE", "TAKE OVER"] : ["SEND", "EDIT", "TAKE OVER"],
      });
    }
  }
  for (const a of queue.filter((q) => q.status === "queued" && q.ruling.temperature !== "GREEN")) {
    out.push({
      id: `act-${a.id}`,
      level: a.ruling.temperature === "RED" ? "control" : "action",
      title: `${ACTION_LABELS[a.kind]}: ${a.summary}`,
      body: a.ruling.reasons,
      recommendation: a.ruling.needs === "a licensed professional + you" ? "Route through a licensed professional" : "Review the draft",
      dealId: a.dealId,
      temperature: a.ruling.temperature,
      value: (a.amount ?? 0) * 0.01 + (a.ruling.temperature === "RED" ? 50_000 : 10_000),
      choices: a.ruling.temperature === "RED" ? ["APPROVE", "DECLINE", "TAKE OVER"] : ["SEND", "EDIT", "DECLINE"],
    });
  }
  for (const h of hot.filter((x) => x.score >= 80).slice(0, 3)) {
    out.push({
      id: `opp-${h.site.id}`,
      level: "money",
      title: `New opportunity: ${h.site.name} scores ${h.score}`,
      body: [...h.why.slice(0, 3), `Constellation ${h.constellation.completeness}% · gaps: ${h.constellation.gaps.join(", ") || "none"}`],
      recommendation: "Open the deal thesis",
      siteId: h.site.id,
      temperature: "GREEN",
      value: (h.value.uplift ?? h.value.raw ?? 0) * 0.02 + h.score * 1000,
      choices: ["OPEN"],
    });
  }
  return out.sort((a, b) => b.value - a.value);
}

// ─── The deal team ──────────────────────────────────────────────────────────

export type AgentKey = "scout" | "analyst" | "strategist" | "diligence" | "valuation" | "dealmaker" | "relationship" | "compliance" | "deal_desk" | "commander";
export const AGENTS: Record<AgentKey, { icon: string; label: string; job: string }> = {
  scout: { icon: "👁", label: "Scout", job: "Finds opportunities" },
  analyst: { icon: "🔬", label: "Analyst", job: "Is it real?" },
  strategist: { icon: "🧠", label: "Strategist", job: "What could be done" },
  diligence: { icon: "🕵", label: "Due diligence", job: "What must be checked" },
  valuation: { icon: "💰", label: "Valuation", job: "What it's worth" },
  dealmaker: { icon: "🤝", label: "Dealmaker", job: "How the deal is built" },
  relationship: { icon: "📞", label: "Relationship", job: "Who to talk to, and what to say" },
  compliance: { icon: "⚖", label: "Compliance guard", job: "What needs a human / license" },
  deal_desk: { icon: "🧾", label: "Deal desk", job: "The record" },
  commander: { icon: "👑", label: "Commander", job: "What you need to know" },
};

export interface AgentReport {
  agent: AgentKey;
  lines: string[];
}

/**
 * One pass of the team over a site. Deterministic: every line comes from the
 * engine's facts. (A language model may rewrite the drafts; it may not add facts.)
 */
export function runDealTeam(i: SiteIntel, signals: Signal[], capital: CapitalSource[], memories: Memory[], pb: Playbook, now: Date): { reports: AgentReport[]; actions: ProposedAction[] } {
  const s = i.site;
  const top = i.theses[0];
  const mwRead = i.factors.power.findings[0]?.text ?? "MW unknown";
  const evCount = i.badges.VERIFIED + i.badges.REPORTED;
  const reports: AgentReport[] = [];
  reports.push({ agent: "scout", lines: [`${s.name} (${s.county} County${s.acres != null ? `, ${s.acres} acres` : ", power node"}) surfaced at ${i.score}/100.`, ...i.why.slice(0, 3)] });
  reports.push({
    agent: "analyst",
    lines: [
      `${evCount} sourced facts (${i.badges.VERIFIED} government-verified, ${i.badges.REPORTED} reported), ${i.badges.INFERRED} estimates, ${i.badges.STALE} stale.`,
      i.confidence >= 70 ? `Confidence ${i.confidence}%: real enough to work.` : `Confidence ${i.confidence}%: verify before anyone spends time on it.`,
      ...i.unknowns.slice(0, 3).map((u) => `Unknown: ${u}`),
    ],
  });
  reports.push({ agent: "strategist", lines: i.theses.filter((t) => t.key !== "no_go").slice(0, 3).map((t) => `${t.fit} · ${t.key.replace(/_/g, " ")}: ${t.why}`) });
  reports.push({
    agent: "diligence",
    lines: [
      "Utility large-load study or will-serve letter for the MW figure",
      "Title search + survey; easements across the power path",
      s.zoning === "agricultural" ? "Rezoning timeline and community sentiment" : "Zoning confirmation letter",
      "Phase I environmental (and FEMA flood determination)",
      "Water: provider capacity letter for cooling",
    ],
  });
  reports.push({ agent: "valuation", lines: [`Raw land ≈ ${i.value.raw != null ? fmt(i.value.raw) : "unknown"}${i.value.powered ? ` · powered ≈ ${fmt(i.value.powered)} (uplift ${fmt(i.value.uplift!)})` : ""}`, i.value.basis] });
  const dev = i.matches.find((m) => m.source.kind === "developer");
  const cap = i.matches.find((m) => m.source.kind !== "developer" && m.source.kind !== "utility");
  reports.push({
    agent: "dealmaker",
    lines: [
      `Thesis: ${top ? top.key.replace(/_/g, " ") : "none"}.`,
      "Structure (no license needed): paid research + sourcing engagement, or a consulting retainer with the side that hires you.",
      "Structure (licensed partner): option on the land or a transaction fee, only through a Georgia-licensed broker / counsel.",
      `Constellation ${i.constellation.completeness}% complete; missing: ${i.constellation.gaps.map((g) => g.replace("_", " ")).join(", ") || "nothing"}.`,
    ],
  });
  const contacts = [dev?.source.name, cap?.source.name, s.owner].filter(Boolean) as string[];
  reports.push({
    agent: "relationship",
    lines: contacts.length
      ? contacts.map((c) => {
          const r = recall(memories, c);
          return `${c}: ${r.lines[0] ?? "no history"}${r.lastTouch ? ` · last touch ${r.lastTouch.slice(0, 10)}` : ""}`;
        })
      : ["No counterparties on file fit yet: add capital / developer mandates."],
  });

  const actions: ProposedAction[] = [
    { id: `a-${s.id}-research`, dealId: null, kind: "research", summary: `Pull owner, utility territory and recorded sales near ${s.name}` },
    ...(s.owner ? [{ id: `a-${s.id}-owner`, dealId: null, kind: "draft" as const, summary: `Intro letter to ${s.owner}`, draft: ownerLetter(i) }] : []),
    ...(dev ? [{ id: `a-${s.id}-dev`, dealId: null, kind: "nonbinding_proposal" as const, summary: `Non-binding site brief to ${dev.source.name}`, draft: siteBrief(i, dev.source.name) }] : []),
    ...(dev && cap ? [{ id: `a-${s.id}-intro`, dealId: null, kind: "introduction" as const, summary: `Introduce ${dev.source.name} to ${cap.source.name}` }] : []),
  ];
  const rulings = actions.map((a) => ({ a, r: rule(a, null, pb) }));
  reports.push({ agent: "compliance", lines: rulings.map(({ a, r }) => `${r.temperature} · ${ACTION_LABELS[a.kind]}: ${r.reasons[0]}`).concat(["No fee tied to the land sale or to investor money without a licensed partner."]) });
  reports.push({ agent: "deal_desk", lines: [`Deal record: ${s.name}, stage THESIS, ${i.constellation.slots.filter((x) => x.filledBy).length} parties identified.`, `Next review in ${pb.autoFollowUpDays} days or when a party responds.`] });
  reports.push({
    agent: "commander",
    lines: [
      `${s.name}: ${i.score}/100 at ${i.confidence}% confidence. ${mwRead}.`,
      top ? `Best play: ${top.key.replace(/_/g, " ")} (${top.fit}).` : "No play yet.",
      `${rulings.filter((x) => x.r.temperature === "GREEN").length} actions cleared to run, ${rulings.filter((x) => x.r.temperature !== "GREEN").length} need you.`,
    ],
  });
  void signals;
  void capital;
  void now;
  return { reports, actions };
}

export function ownerLetter(i: SiteIntel): string {
  return [
    `Re: ${i.site.name}, ${i.site.county} County`,
    "",
    "Hello,",
    "",
    `I research industrial land in ${i.site.state} for companies building power-intensive facilities. Your${i.site.acres != null ? ` ${i.site.acres}-acre` : ""} property came up in that work.`,
    "If you would consider selling, leasing or optioning it, I'd like to understand what matters to you and share what we're seeing in the market. No obligation, and nothing here is an offer.",
    "",
    "[Your name] · [Your company] · [Your phone]",
  ].join("\n");
}

export function siteBrief(i: SiteIntel, to: string): string {
  const s = i.site;
  return [
    `CONFIDENTIAL SITE BRIEF — for ${to} — non-binding, for discussion only`,
    "",
    `${s.name} · ${s.county} County, ${s.state} · ${s.acres != null ? `${s.acres} acres` : "power node, land not yet identified"} · zoned ${s.zoning.replace("_", " ")}`,
    ...i.why.map((w) => `• ${w}`),
    "",
    `Status of facts: ${i.badges.VERIFIED} government-verified, ${i.badges.REPORTED} reported, ${i.badges.INFERRED} our estimates. MW figures are not utility commitments.`,
    `Open items: ${i.unknowns.slice(0, 4).join("; ") || "none"}`,
    "",
    "We are not the owner's broker and make no representation for the owner. Interested in a call?",
    "[Your name] · [Your company]",
  ].join("\n");
}

// ─── Memory-aware negotiation ───────────────────────────────────────────────

/** "$17M", "~$17.5 million", "$950K" → dollars. */
export function parseUsd(text: string): number | null {
  const m = text.match(/\$\s*~?\s*([\d.,]+)\s*(b|bn|billion|m|mm|million|k|thousand)?/i);
  if (!m) return null;
  const n = parseFloat(m[1].replace(/,/g, ""));
  const u = (m[2] ?? "").toLowerCase();
  return isFinite(n) ? n * (u.startsWith("b") ? 1e9 : u.startsWith("m") ? 1e6 : u.startsWith("k") || u === "thousand" ? 1e3 : 1) : null;
}

/** What memory says about this counter: a stated budget it breaks, a deadline, a past rejection. */
export function memoryHints(memories: Memory[], partyName: string, counter: number | null, side: "sell" | "buy"): string[] {
  const mine = memories.filter((m) => m.partyName.toLowerCase() === partyName.toLowerCase());
  const hints: string[] = [];
  for (const m of mine)
    for (const f of m.facts) {
      if (f.key === "budget" && counter != null) {
        const cap = parseUsd(f.value);
        if (cap != null && side === "sell" && counter > cap) hints.push(`Above their stated budget (~${fmt(cap)}, ${m.at.slice(0, 10)}): expect a stall unless the deal changes (terms, timing, scope).`);
        if (cap != null && side === "sell" && counter <= cap) hints.push(`Inside their stated budget (~${fmt(cap)}): a strong close candidate.`);
      }
      if (f.key === "timeline" || f.key === "needs") hints.push(`They ${f.key === "needs" ? "need" : "want"}: ${f.value}. Trade on it.`);
      if (f.key === "rejected") hints.push(`They rejected before: ${f.value}.`);
    }
  return [...new Set(hints)];
}
