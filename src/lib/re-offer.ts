/**
 * Offer engine: from the exit back to the seller. The walk-away price is what
 * the best-fit buyer would pay minus your minimum fee and closing buffer; the
 * target leaves your target fee; the opening offer leaves negotiating room.
 * Then the seller side: what they must clear (estimated payoff + back taxes +
 * closing costs) and what a retail listing would really net them. Pure;
 * every number carries its basis, and nothing here is sent anywhere.
 */
import type { Intel } from "./re-intel.ts";
import type { BuyerMatch } from "./re-buyers.ts";

export interface OfferSettings {
  minFee: number; // walk-away leaves at least this
  targetFee: number; // target leaves this
  bufferPct: number; // your closing / double-close / holding buffer, share of exit price
  openingDiscountPct: number; // opening offer below target
  sellerClosingPct: number; // seller's own closing costs
  retailCommissionPct: number; // if they list instead
  retailMonths: number; // time to sell retail
  carryPctMo: number; // their holding cost per month while listed, share of value
}

export const DEFAULT_OFFER: OfferSettings = {
  minFee: 10000,
  targetFee: 20000,
  bufferPct: 0.02,
  openingDiscountPct: 0.1,
  sellerClosingPct: 0.02,
  retailCommissionPct: 0.06,
  retailMonths: 4,
  carryPctMo: 0.003,
};

const r500 = (v: number) => Math.floor(v / 500) * 500;
const money = (v: number) => (v < 0 ? "−" : "") + "$" + Math.round(Math.abs(v)).toLocaleString("en-US");

export interface Offer {
  exit: number | null;
  exitBasis: string;
  walkAway: number | null;
  target: number | null;
  opening: number | null;
  lines: { label: string; value: number | null; basis: string }[];
  sellerFloor: number | null;
  sellerFloorBasis: string;
  feasible: "yes" | "tight" | "no" | "unknown";
  verdict: string;
  retailNet: number | null;
  retailNetBasis: string;
  netAtTarget: number | null;
  pctOfValue: number | null;
}

export function buildOffer(i: Intel, matches: BuyerMatch[], s: OfferSettings = DEFAULT_OFFER): Offer {
  const best = matches.find((m) => m.price != null);
  let exit: number | null = null;
  let exitBasis = "No exit price: needs ARV + rehab, or a matched buyer";
  if (best) {
    exit = best.price;
    exitBasis = `${best.buyer.name}'s likely price (${best.priceBasis})`;
  } else if (i.value.arv != null && i.rehab.value != null) {
    exit = Math.round(i.value.arv * 0.7 - i.rehab.value);
    exitBasis = `Investor formula ARV ${money(i.value.arv)} × 70% − rehab ${money(i.rehab.value)} (no buyer matched yet)`;
  }
  const lines: Offer["lines"] = [];
  let walkAway: number | null = null, target: number | null = null, opening: number | null = null;
  if (exit != null) {
    const buffer = Math.round(exit * s.bufferPct);
    walkAway = Math.max(0, r500(exit - s.minFee - buffer));
    target = Math.max(0, r500(exit - s.targetFee - buffer));
    opening = Math.max(0, r500(target * (1 - s.openingDiscountPct)));
    lines.push(
      { label: "Exit price", value: exit, basis: exitBasis },
      { label: "Closing / holding buffer", value: -buffer, basis: `${(s.bufferPct * 100).toFixed(1)}% of exit` },
      { label: "Walk-away (max offer)", value: walkAway, basis: `exit − buffer − minimum fee ${money(s.minFee)}` },
      { label: "Target", value: target, basis: `exit − buffer − target fee ${money(s.targetFee)}` },
      { label: "Opening offer", value: opening, basis: `target − ${Math.round(s.openingDiscountPct * 100)}%` },
    );
  }

  const ask = i.p.fieldNotes?.askingPrice ?? null;
  if (ask != null)
    lines.push({ label: "Owner's asking price", value: ask, basis: walkAway != null ? (ask > walkAway ? `${money(ask - walkAway)} above your walk-away` : `${money(walkAway - ask)} under your walk-away: room to meet them`) : `stated ${i.p.fieldNotes!.at.slice(0, 10)}` });

  // Seller side: what must they clear to sell at all?
  const value = i.value.current;
  const debt = i.value.debt;
  const taxes = i.p.taxDelinquent?.amount ?? 0;
  let sellerFloor: number | null = null;
  let sellerFloorBasis = "Unknown: no debt estimate (search the deed index)";
  if (debt != null) {
    const closing = Math.round((target ?? value ?? 0) * s.sellerClosingPct);
    sellerFloor = Math.round(debt + taxes + closing);
    sellerFloorBasis = `payoff est. ${money(debt)}${taxes ? ` + back taxes ${money(taxes)}` : ""} + seller closing ${money(closing)} · ${i.value.debtBasis}`;
  }
  let feasible: Offer["feasible"] = "unknown";
  let verdict = "Can't judge yet: " + (exit == null ? exitBasis : sellerFloorBasis);
  if (walkAway != null && sellerFloor != null) {
    if (walkAway < sellerFloor) {
      feasible = "no";
      verdict = `Your walk-away ${money(walkAway)} is below what the seller must clear (${money(sellerFloor)}). They'd have to bring ${money(sellerFloor - walkAway)} to close: only a short sale, subject-to or a creative structure works.`;
    } else if (target != null && target < sellerFloor) {
      feasible = "tight";
      verdict = `Target is under the seller's floor; the deal lives between ${money(sellerFloor)} and your walk-away ${money(walkAway)}. Fee shrinks toward ${money(s.minFee)}.`;
    } else {
      feasible = "yes";
      verdict = `Room on both sides: the seller clears their payoff at your target with ${money((target ?? 0) - sellerFloor)} to spare.`;
    }
  }

  // Their alternative: list it retail as-is.
  let retailNet: number | null = null;
  let retailNetBasis = "No value estimate";
  if (value != null) {
    const comm = value * s.retailCommissionPct, cl = value * s.sellerClosingPct, carry = value * s.carryPctMo * s.retailMonths;
    retailNet = Math.round(value - comm - cl - carry - (debt ?? 0) - taxes);
    retailNetBasis = `as-is ${money(value)} − ${Math.round(s.retailCommissionPct * 100)}% commission − ${Math.round(s.sellerClosingPct * 100)}% closing − ${s.retailMonths} mo carrying${debt != null ? " − payoff" : ""}${taxes ? " − back taxes" : ""}, before any repairs a retail buyer demands`;
  }
  const netAtTarget = target != null ? Math.round(target - (debt ?? 0) - taxes) : null; // you pay their closing costs in most wholesale contracts
  return {
    exit,
    exitBasis,
    walkAway,
    target,
    opening,
    lines,
    sellerFloor,
    sellerFloorBasis,
    feasible,
    verdict,
    retailNet,
    retailNetBasis,
    netAtTarget,
    pctOfValue: target != null && value ? target / value : null,
  };
}

/** Non-binding letter of intent. The real purchase agreement comes from your attorney's form. */
export function offerLetter(i: Intel, o: Offer, closeDays = 21): string {
  const addr = i.p.address;
  return [
    "[Date]",
    "",
    `Re: ${addr}${i.p.city ? `, ${i.p.city}` : ""}${i.p.zip ? ` ${i.p.zip}` : ""}`,
    "",
    "Dear [Owner name],",
    "",
    `Thank you for talking with me about ${addr}. Here is what I can offer:`,
    "",
    `  • Price: ${o.opening != null ? money(o.opening) : "[price]"}, all cash`,
    "  • As-is: no repairs, no cleaning, leave anything you don't want",
    "  • I pay the closing costs; closing at a Georgia closing attorney of your choice",
    `  • Close in about ${closeDays} days, or on the date that suits you`,
    "",
    "This letter is not a contract. If the terms work for you, I'll send a written purchase agreement for you (and anyone advising you) to review.",
    "",
    "Sincerely,",
    "[Your name] · [Your company] · [Your phone]",
  ].join("\n");
}
