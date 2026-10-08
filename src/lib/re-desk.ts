/**
 * The Deal Desk — pipeline, contact log, follow-ups, the daily queue, and the
 * command bar. Pure functions over Intel (lib/re-intel.ts) + desk state, so
 * the queue order and follow-up dates are tested, not guessed at render time.
 *
 * Global Rule 1 applies: the desk drafts and schedules; a person approves every
 * call, text, email and letter. Nothing here sends anything.
 */
import type { Intel, Mission } from "./re-intel.ts";


export const STAGES = [
  "DISCOVERED",
  "RESEARCHING",
  "CONTACTED",
  "CONVERSATION",
  "OPPORTUNITY",
  "NEGOTIATION",
  "CONTRACT",
  "CLOSED",
  "DEAD",
] as const;
export type Stage = (typeof STAGES)[number];
export const OPEN_STAGES: Stage[] = ["DISCOVERED", "RESEARCHING", "CONTACTED", "CONVERSATION", "OPPORTUNITY", "NEGOTIATION", "CONTRACT"];

export type ActivityKind = "call" | "sms" | "email" | "letter" | "verify" | "research" | "note" | "skip" | "stage" | "buyer";
export type Outcome = "attempted" | "no_answer" | "left_message" | "reached" | "interested" | "not_interested" | "wrong_number" | "sent" | "done" | null;

export interface Activity {
  id: string;
  parcelId: string;
  at: string;
  kind: ActivityKind;
  outcome: Outcome;
  note?: string;
  stage?: Stage;
  amount?: number | null; // closed deal $ (assignment fee / profit)
}

export interface DeskState {
  parcelId: string;
  stage: Stage;
  nextFollowUp: string | null;
  snoozedUntil: string | null;
  closedAmount?: number | null;
  updatedAt: string;
}

export const ACTION_LABELS: Record<ActivityKind, string> = {
  call: "Call",
  sms: "Text",
  email: "Email",
  letter: "Letter",
  verify: "Verify",
  research: "Research",
  note: "Note",
  skip: "Skip",
  stage: "Stage",
  buyer: "Sent to buyer",
};

const DAY = 86_400_000;
const addDays = (iso: string, d: number) => new Date(new Date(iso).getTime() + d * DAY).toISOString();

/** Follow-up spacing, in days, by what just happened. null = no follow-up. */
export function followUpDays(kind: ActivityKind, outcome: Outcome): number | null {
  if (kind === "skip") return 30;
  if (outcome === "not_interested") return 90;
  if (outcome === "wrong_number") return null;
  if (kind === "call") return outcome === "reached" || outcome === "interested" ? 2 : outcome === "left_message" ? 3 : 2;
  if (kind === "sms" || kind === "email") return 3;
  if (kind === "letter") return 7;
  if (kind === "verify" || kind === "research") return 1;
  return null;
}

/** Stage the property moves to after an activity (never moves backwards). */
export function stageAfter(current: Stage, a: Pick<Activity, "kind" | "outcome" | "stage">): Stage {
  if (a.kind === "stage" && a.stage) return a.stage;
  const order = (s: Stage) => STAGES.indexOf(s);
  let next: Stage = current;
  if (a.kind === "verify" || a.kind === "research") next = "RESEARCHING";
  if (["call", "sms", "email", "letter"].includes(a.kind)) next = "CONTACTED";
  if (a.outcome === "reached") next = "CONVERSATION";
  if (a.outcome === "interested") next = "OPPORTUNITY";
  if (a.outcome === "not_interested" && order(current) < order("NEGOTIATION")) return current;
  return order(next) > order(current) ? next : current;
}

export function applyActivity(state: DeskState | undefined, a: Activity): DeskState {
  const base: DeskState = state ?? { parcelId: a.parcelId, stage: "DISCOVERED", nextFollowUp: null, snoozedUntil: null, updatedAt: a.at };
  const stage = stageAfter(base.stage, a);
  const fd = followUpDays(a.kind, a.outcome);
  return {
    ...base,
    stage,
    // Notes and buyer sends don't touch the owner follow-up cadence.
    nextFollowUp: a.kind === "note" || a.kind === "buyer" ? base.nextFollowUp : fd == null ? null : addDays(a.at, fd),
    snoozedUntil: a.kind === "skip" ? addDays(a.at, 30) : base.snoozedUntil,
    closedAmount: stage === "CLOSED" && a.amount != null ? a.amount : base.closedAmount,
    updatedAt: a.at,
  };
}

// ─── Next action ────────────────────────────────────────────────────────────

export interface NextAction {
  verb: "CALL NOW" | "CALL" | "SEND LETTER" | "RESEARCH" | "VERIFY ZONING" | "FOLLOW UP" | "SKIP TRACE" | "NEGOTIATE" | "WORK CONTRACT" | "WAIT";
  why: string;
}

export function nextAction(i: Intel, s: DeskState | undefined, now: Date): NextAction {
  const stage = s?.stage ?? "DISCOVERED";
  if (stage === "CONTRACT") return { verb: "WORK CONTRACT", why: "Under contract: deadlines and checklist on the CONTRACT tab" };
  if (s?.nextFollowUp && new Date(s.nextFollowUp) <= now && OPEN_STAGES.includes(stage))
    return { verb: "FOLLOW UP", why: `Follow-up due ${s.nextFollowUp.slice(0, 10)}` };
  if (stage === "NEGOTIATION" || stage === "OPPORTUNITY") return { verb: "NEGOTIATE", why: "Owner is engaged: work the numbers" };
  if (s?.nextFollowUp && new Date(s.nextFollowUp) > now) return { verb: "WAIT", why: `Next touch ${s.nextFollowUp.slice(0, 10)}` };
  const p = i.p;
  if (p.foreclosure) {
    const days = Math.floor((new Date(p.foreclosure.saleDate).getTime() - now.getTime()) / DAY);
    if (days >= 0 && days <= 30) return { verb: "CALL NOW", why: `Foreclosure sale in ${days} days` };
  }
  if (p.probate) return { verb: "SEND LETTER", why: "Estate in probate: write to the personal representative" };
  if (!p.ownerMailing) return { verb: "SKIP TRACE", why: "No mailing address on the parcel" };
  if (i.engines.development.score >= 40 && i.engines.distress.score < 30) return { verb: "VERIFY ZONING", why: "Value is in the land: confirm what can be built first" };
  if (i.confidence < 50) return { verb: "RESEARCH", why: `Confidence ${i.confidence}%: ${i.nextVerification}` };
  if (p.taxDelinquent || i.engines.distress.score >= 40) return { verb: "CALL", why: i.strongest[0] ?? "Distress signals" };
  return { verb: "SEND LETTER", why: i.strongest[0] ?? "Owner outreach" };
}

// ─── Queue ──────────────────────────────────────────────────────────────────

export interface QueueItem {
  intel: Intel;
  state: DeskState | undefined;
  action: NextAction;
  due: boolean;
}

/**
 * Today's queue: follow-ups that are due come first (oldest first), then
 * untouched properties by score. Snoozed, closed, dead, and "wait" items drop out.
 */
export function buildQueue(all: Intel[], states: Record<string, DeskState>, now: Date, mission: Mission | "all" = "all", limit = 50): QueueItem[] {
  const items = all
    .filter((i) => mission === "all" || i.missions.includes(mission))
    .map((intel) => {
      const state = states[intel.p.id];
      const action = nextAction(intel, state, now);
      return { intel, state, action, due: action.verb === "FOLLOW UP" };
    })
    .filter((q) => {
      const st = q.state;
      if (st && !OPEN_STAGES.includes(st.stage)) return false;
      if (st?.stage === "CONTRACT") return false; // worked from contract deadlines, not the calling queue
      if (st?.snoozedUntil && new Date(st.snoozedUntil) > now) return false;
      return q.action.verb !== "WAIT";
    });
  items.sort((a, b) => {
    if (a.due !== b.due) return a.due ? -1 : 1;
    if (a.due && b.due) return (a.state!.nextFollowUp ?? "").localeCompare(b.state!.nextFollowUp ?? "");
    return b.intel.score - a.intel.score || b.intel.confidence - a.intel.confidence;
  });
  return items.slice(0, limit);
}

// ─── Money screen ───────────────────────────────────────────────────────────

export interface MoneyStats {
  opportunities: number;
  highPriority: number;
  estimatedEquity: number;
  potentialDealValue: number;
  activeConversations: number;
  contracts: number;
  closed: number;
  closedValue: number;
  funnel: { label: string; count: number }[];
}

export function moneyStats(all: Intel[], states: Record<string, DeskState>): MoneyStats {
  const st = (i: Intel) => states[i.p.id]?.stage ?? "DISCOVERED";
  const live = all.filter((i) => st(i) !== "DEAD");
  const at = (...s: Stage[]) => live.filter((i) => s.includes(st(i))).length;
  const leads = live.filter((i) => i.score >= 50).length;
  return {
    opportunities: live.length,
    highPriority: live.filter((i) => i.score >= 80).length,
    estimatedEquity: live.reduce((s, i) => s + Math.max(0, i.value.equity ?? 0), 0),
    potentialDealValue: live.reduce((s, i) => s + Math.max(0, i.strategies.find((x) => x.key !== "no_go" && x.value != null)?.value ?? 0), 0),
    activeConversations: at("CONVERSATION", "OPPORTUNITY", "NEGOTIATION"),
    contracts: at("CONTRACT"),
    closed: at("CLOSED"),
    closedValue: Object.values(states).reduce((s, x) => s + (x.stage === "CLOSED" ? x.closedAmount ?? 0 : 0), 0),
    funnel: [
      { label: "Properties", count: live.length },
      { label: "Leads", count: leads },
      { label: "Contacted", count: at("CONTACTED", "CONVERSATION", "OPPORTUNITY", "NEGOTIATION", "CONTRACT", "CLOSED") },
      { label: "Conversations", count: at("CONVERSATION", "OPPORTUNITY", "NEGOTIATION", "CONTRACT", "CLOSED") },
      { label: "Deals", count: at("CONTRACT", "CLOSED") },
    ],
  };
}

// ─── Command bar ────────────────────────────────────────────────────────────

export interface CommandFilter {
  missions: Mission[];
  signals: ("vacant" | "probate" | "foreclosure" | "tax" | "code")[];
  minEquity: number | null;
  minScore: number | null;
  near: { lat: number; lng: number; miles: number; label: string } | null;
  uncontacted: boolean;
  extraUnits: boolean;
  zip: string | null;
  limit: number | null;
  explain: boolean;
  understood: string[];
}

export const PLACES: Record<string, { lat: number; lng: number }> = {
  atlanta: { lat: 33.749, lng: -84.388 },
  downtown: { lat: 33.755, lng: -84.39 },
  midtown: { lat: 33.7838, lng: -84.3831 },
  "west end": { lat: 33.7365, lng: -84.4139 },
  "east point": { lat: 33.6796, lng: -84.4394 },
  "college park": { lat: 33.6534, lng: -84.4494 },
  decatur: { lat: 33.7748, lng: -84.2963 },
  "south fulton": { lat: 33.6145, lng: -84.5408 },
};

const parseMoney = (num: string, unit?: string) => {
  const n = parseFloat(num.replace(/,/g, ""));
  const u = (unit ?? "").toLowerCase();
  return u === "k" ? n * 1e3 : u === "m" ? n * 1e6 : n;
};

export function parseCommand(text: string): CommandFilter {
  const t = text.toLowerCase();
  const f: CommandFilter = { missions: [], signals: [], minEquity: null, minScore: null, near: null, uncontacted: false, extraUnits: false, zip: null, limit: null, explain: false, understood: [] };
  if (/\bwhy\b.*\b(rank|score|ranked|scored|like)/.test(t)) {
    f.explain = true;
    f.understood.push("explain the selected property");
    return f;
  }
  const mission = (m: Mission, label: string) => {
    if (!f.missions.includes(m)) {
      f.missions.push(m);
      f.understood.push(label);
    }
  };
  if (/distress/.test(t)) mission("distress", "distressed");
  if (/absentee|out[- ]of[- ]state/.test(t)) mission("absentee", "absentee owners");
  if (/develop|land\b|density|infill/.test(t)) mission("develop", "development potential");
  if (/\bhot\b/.test(t)) mission("hot", "hot (score ≥ 70)");
  if (/\bnew\b|this week|recent/.test(t)) mission("new", "new signals");
  const sig = (s: CommandFilter["signals"][number], re: RegExp, label: string) => {
    if (re.test(t)) {
      f.signals.push(s);
      f.understood.push(label);
    }
  };
  sig("vacant", /vacan|boarded|abandon/, "vacant / boarded");
  sig("probate", /probate|inherit|estate/, "probate / inherited");
  sig("foreclosure", /foreclos|pre-?foreclosure/, "foreclosure notice");
  sig("tax", /tax[- ]delinq|delinquent|back taxes/, "tax delinquent");
  sig("code", /code|violation|complaint/, "code complaint");

  const eq = t.match(/(?:at least|over|more than|above|>=?|min(?:imum)?)\s*\$?\s*([\d,.]+)\s*([km])?\s*(?:in\s+)?(?:estimated\s+)?equity/) ?? t.match(/equity\s*(?:of|over|above|>=?|at least)?\s*\$?\s*([\d,.]+)\s*([km])?/);
  if (eq) {
    f.minEquity = parseMoney(eq[1], eq[2]);
    f.understood.push(`equity ≥ $${Math.round(f.minEquity).toLocaleString("en-US")}`);
  } else if (/equity/.test(t)) mission("equity", "high equity");

  const sc = t.match(/score\s*(?:above|over|>=?|at least)\s*(\d{1,3})/);
  if (sc) {
    f.minScore = Number(sc[1]);
    f.understood.push(`score ≥ ${f.minScore}`);
  }
  const near = t.match(/within\s+([\d.]+)\s*(?:mi|miles?)\s+(?:of\s+)?([a-z ]+?)(?:\s+with|\s+where|\s+that|[,.]|$)/);
  if (near) {
    const place = near[2].trim();
    const key = Object.keys(PLACES).find((k) => place.includes(k));
    if (key) {
      f.near = { ...PLACES[key], miles: Number(near[1]), label: key };
      f.understood.push(`within ${near[1]} mi of ${key}`);
    }
  }
  if (/(haven'?t|have not|not yet|never|un)\s*contact|not contacted|uncontacted/.test(t)) {
    f.uncontacted = true;
    f.understood.push("not contacted yet");
  }
  if (/more units|extra units|allows? (more|additional)|adu|split/.test(t)) {
    f.extraUnits = true;
    f.understood.push("zoning allows more units than exist");
  }
  const zip = t.match(/\b(3\d{4})\b/);
  if (zip) {
    f.zip = zip[1];
    f.understood.push(`ZIP ${zip[1]}`);
  }
  const lim = t.match(/\b(?:top|best|first|show(?: me)?(?: the)?)\s+(\d{1,3})\b/);
  if (lim) {
    f.limit = Number(lim[1]);
    f.understood.push(`top ${f.limit}`);
  }
  return f;
}

export function milesBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 3958.8;
  const toR = (d: number) => (d * Math.PI) / 180;
  const dLat = toR(b.lat - a.lat);
  const dLng = toR(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function applyCommand(all: Intel[], f: CommandFilter, states: Record<string, DeskState>): Intel[] {
  let out = all.filter((i) => {
    const p = i.p;
    if (f.missions.length && !f.missions.every((m) => i.missions.includes(m))) return false;
    for (const s of f.signals) {
      if (s === "vacant" && !(p.codeCases ?? []).some((c) => c.vacant || c.boarded || /vacan|abandon/i.test(c.type ?? ""))) return false;
      if (s === "probate" && !p.probate && !/\b(ESTATE|HEIRS?)\b/i.test(p.owner ?? "")) return false;
      if (s === "foreclosure" && !p.foreclosure) return false;
      if (s === "tax" && !p.taxDelinquent) return false;
      if (s === "code" && !(p.codeCases ?? []).length) return false;
    }
    if (f.minEquity != null && !((i.value.equity ?? -Infinity) >= f.minEquity)) return false;
    if (f.minScore != null && i.score < f.minScore) return false;
    if (f.near && (p.lat == null || p.lng == null || milesBetween(f.near, { lat: p.lat, lng: p.lng }) > f.near.miles)) return false;
    if (f.uncontacted && (states[p.id]?.stage ?? "DISCOVERED") !== "DISCOVERED" && states[p.id]?.stage !== "RESEARCHING") return false;
    if (f.extraUnits && !i.engines.development.findings.some((x) => /more unit|lot-split|ADU|Multifamily district/.test(x.text))) return false;
    if (f.zip && p.zip !== f.zip) return false;
    return true;
  });
  out = out.sort((a, b) => b.score - a.score);
  return f.limit ? out.slice(0, f.limit) : out;
}

// ─── Today briefing (the 8:00 command-center view) ──────────────────────────

/**
 * Georgia non-judicial foreclosure sales happen on the first Tuesday of the
 * month (the Wednesday after, when that Tuesday is New Year's Day or July 4th).
 * Returns the next sale date on or after `now` (local calendar date).
 */
export function nextForeclosureSale(now: Date): Date {
  const pick = (y: number, m: number) => {
    const d = new Date(Date.UTC(y, m, 1));
    while (d.getUTCDay() !== 2) d.setUTCDate(d.getUTCDate() + 1);
    if ((m === 0 && d.getUTCDate() === 1) || (m === 6 && d.getUTCDate() === 4)) d.setUTCDate(d.getUTCDate() + 1);
    return d;
  };
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const thisMonth = pick(now.getUTCFullYear(), now.getUTCMonth());
  return thisMonth.getTime() >= today ? thisMonth : pick(now.getUTCFullYear() + (now.getUTCMonth() === 11 ? 1 : 0), (now.getUTCMonth() + 1) % 12);
}

export interface TodayBrief {
  date: string;
  due: QueueItem[];
  newSignals: Intel[];
  saleDate: string;
  daysToSale: number;
  onTheSale: Intel[];
  probate: Intel[];
  top: QueueItem[];
  touchedYesterday: number;
}

export function todayBrief(all: Intel[], states: Record<string, DeskState>, activity: Activity[], now: Date): TodayBrief {
  const q = buildQueue(all, states, now, "all", 500);
  const sale = nextForeclosureSale(now);
  const saleDay = sale.toISOString().slice(0, 10);
  const weekAgo = now.getTime() - 7 * DAY;
  const dayAgo = now.getTime() - DAY;
  return {
    date: now.toISOString().slice(0, 10),
    due: q.filter((x) => x.due),
    newSignals: all.filter((i) => i.newestSignalAt && new Date(i.newestSignalAt).getTime() >= weekAgo && (states[i.p.id]?.stage ?? "DISCOVERED") === "DISCOVERED"),
    saleDate: saleDay,
    daysToSale: Math.round((sale.getTime() - Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) / DAY),
    onTheSale: all.filter((i) => i.p.foreclosure && i.p.foreclosure.saleDate.slice(0, 10) === saleDay),
    probate: all.filter((i) => i.p.probate && now.getTime() - new Date(i.p.probate.filedAt).getTime() <= 90 * DAY),
    top: q.filter((x) => !x.due).slice(0, 10),
    touchedYesterday: activity.filter((a) => new Date(a.at).getTime() >= dayAgo).length,
  };
}
