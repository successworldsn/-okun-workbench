/**
 * Field work: the walk-through (photos + line-item scope of work) and the
 * owner conversation. Pure: scope math, the conversation guide, and
 * applyFieldwork(), which folds both onto a PropertyRecord so the engines
 * replace the size-based rehab screen and the "unknown intent / condition"
 * gaps with what you actually saw and heard.
 *
 * Unit costs are Atlanta-area starting points for a rental-grade rehab, not
 * quotes: change them per line, and replace them with contractor bids.
 */
import type { FieldNotes, PropertyRecord } from "./re-intel.ts";

export type Level = "none" | "light" | "standard" | "heavy";

export interface CatalogItem {
  key: string;
  label: string;
  unit: "sq ft" | "each" | "lump";
  /** Default quantity from the property's record. */
  qty: (p: PropertyRecord) => number;
  cost: Record<Exclude<Level, "none">, number>;
  hint: string;
}

const sq = (p: PropertyRecord) => p.sqft ?? 1200;
const baths = (p: PropertyRecord) => Math.max(1, Math.ceil(p.baths ?? 1));

export const CATALOG: CatalogItem[] = [
  { key: "roof", label: "Roof", unit: "sq ft", qty: (p) => Math.round(sq(p) * 1.25), cost: { light: 1.5, standard: 6, heavy: 9 }, hint: "Light = repairs; standard = shingle replacement; heavy = decking too" },
  { key: "hvac", label: "HVAC", unit: "each", qty: () => 1, cost: { light: 600, standard: 6500, heavy: 11000 }, hint: "Service vs new system vs system + ductwork" },
  { key: "electrical", label: "Electrical", unit: "sq ft", qty: sq, cost: { light: 1, standard: 4, heavy: 9 }, hint: "Fixtures/outlets vs panel vs full rewire" },
  { key: "plumbing", label: "Plumbing", unit: "sq ft", qty: sq, cost: { light: 0.8, standard: 3, heavy: 7 }, hint: "Fixtures vs partial repipe vs full repipe + sewer line" },
  { key: "water_heater", label: "Water heater", unit: "each", qty: () => 1, cost: { light: 1500, standard: 1800, heavy: 2600 }, hint: "Tank vs larger / tankless" },
  { key: "foundation", label: "Foundation / structural", unit: "lump", qty: () => 1, cost: { light: 2500, standard: 9000, heavy: 25000 }, hint: "Get an engineer's letter for anything past light" },
  { key: "kitchen", label: "Kitchen", unit: "each", qty: () => 1, cost: { light: 4000, standard: 14000, heavy: 28000 }, hint: "Paint + hardware vs new cabinets/counters vs gut" },
  { key: "baths", label: "Bathrooms", unit: "each", qty: baths, cost: { light: 1500, standard: 6500, heavy: 12000 }, hint: "Refresh vs new tub/tile vs full gut" },
  { key: "flooring", label: "Flooring", unit: "sq ft", qty: sq, cost: { light: 1.5, standard: 4.5, heavy: 7 }, hint: "Refinish vs LVP throughout vs subfloor repair too" },
  { key: "paint_int", label: "Interior paint", unit: "sq ft", qty: sq, cost: { light: 1.5, standard: 2.75, heavy: 4 }, hint: "Walls vs walls + trim + ceilings" },
  { key: "drywall", label: "Drywall", unit: "sq ft", qty: sq, cost: { light: 0.5, standard: 2, heavy: 5 }, hint: "Patches vs rooms vs whole house" },
  { key: "windows", label: "Windows", unit: "each", qty: (p) => Math.max(6, Math.round(sq(p) / 120)), cost: { light: 150, standard: 500, heavy: 750 }, hint: "Repair vs vinyl replacement vs reframe" },
  { key: "exterior", label: "Exterior (siding, paint, gutters)", unit: "lump", qty: () => 1, cost: { light: 2500, standard: 9000, heavy: 18000 }, hint: "Paint vs partial siding vs full siding" },
  { key: "doors_trim", label: "Doors + trim", unit: "lump", qty: () => 1, cost: { light: 800, standard: 3000, heavy: 6000 }, hint: "" },
  { key: "landscape", label: "Cleanout + landscaping", unit: "lump", qty: () => 1, cost: { light: 1200, standard: 3500, heavy: 7000 }, hint: "Dumpsters, trash-out, trees" },
];

export const PERMIT_PCT = 0.04;
export const CONTINGENCY_PCT = 0.12;

export interface ScopeLine {
  key: string;
  level: Level;
  qty: number;
  unitCost?: number | null; // override (e.g. from a bid)
  note?: string;
}

export interface Photo {
  id: string;
  dataUrl: string; // resized JPEG
  room: string;
  caption?: string;
  takenAt: string;
}

export interface Fieldwork {
  parcelId: string;
  scope: ScopeLine[] | null;
  walkedAt: string | null;
  photos: Photo[];
  convos: FieldNotes[]; // newest first
  updatedAt: string;
}

export function blankScope(p: PropertyRecord): ScopeLine[] {
  return CATALOG.map((c) => ({ key: c.key, level: "none", qty: c.qty(p) }));
}

export function computeScope(lines: ScopeLine[]) {
  const rows = lines.map((l) => {
    const item = CATALOG.find((c) => c.key === l.key);
    const unit = l.level === "none" ? 0 : l.unitCost ?? item?.cost[l.level] ?? 0;
    return { ...l, label: item?.label ?? l.key, unit: item?.unit ?? "lump", unitPrice: unit, cost: Math.round(unit * (l.level === "none" ? 0 : l.qty)) };
  });
  const hard = rows.reduce((s, r) => s + r.cost, 0);
  const permits = Math.round(hard * PERMIT_PCT);
  const contingency = Math.round((hard + permits) * CONTINGENCY_PCT);
  return { rows, hard, permits, contingency, total: hard + permits + contingency, used: rows.filter((r) => r.cost > 0).length };
}

/** Fold your field work onto the record the engines read. */
export function applyFieldwork(p: PropertyRecord, fw: Fieldwork | undefined): PropertyRecord {
  if (!fw) return p;
  const out: PropertyRecord = { ...p };
  if (fw.scope && fw.walkedAt) {
    const s = computeScope(fw.scope);
    if (s.total > 0) out.rehabBudget = { value: s.total, asOf: fw.walkedAt, lines: s.used };
  }
  if (fw.convos[0]) out.fieldNotes = fw.convos[0];
  return out;
}

// ─── Conversation guide ─────────────────────────────────────────────────────

export const REASONS = ["Inherited", "Relocating", "Financial strain", "Tired landlord", "Divorce", "Health / aging", "Repairs too costly", "Behind on taxes", "Vacant and costing money", "Code violations", "Other"];
export const ISSUES = ["Roof", "HVAC", "Foundation", "Plumbing", "Electrical", "Water damage", "Fire damage", "Mold", "Pests"];

/** The call in order: rapport → property → situation → numbers → next step. */
export const GUIDE: { stage: string; asks: string[] }[] = [
  { stage: "Open", asks: ["Is this a good time for a few minutes?", "How long have you owned the house? What's your connection to it?"] },
  { stage: "Property", asks: ["Who's living there now?", "What would need fixing before you'd move back in? Roof, HVAC, plumbing, foundation?", "Anything you've already updated?"] },
  { stage: "Situation", asks: ["What has you thinking about selling?", "If it sold, when would you want to be done?", "Does anyone else need to agree, like co-owners or family?"] },
  { stage: "Numbers", asks: ["Is there a mortgage? Roughly what's left on it? Are payments current?", "Is there a number you'd need to walk away with?"] },
  { stage: "Next step", asks: ["Can I come see it this week?", "What's the best way and time to reach you?"] },
];

export function blankNotes(now: Date): FieldNotes {
  return { at: now.toISOString(), spokeWith: "owner", occupancy: "unknown", condition: null, issues: [], timeline: "unknown", reasons: [], askingPrice: null, statedPayoff: null, behindOnPayments: null, otherDecisionMakers: null, notes: "" };
}
