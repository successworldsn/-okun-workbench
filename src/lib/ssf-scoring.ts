/**
 * SSF demand-gap scoring — pure functions, no I/O. Every component visible,
 * same "no black box" philosophy as okun-scanner/scoring.ts.
 *
 * gap_score = velocity(40) + margin(30) + scarcity(15), plus a niche bonus
 * and commodity penalty applied on top (not part of the 85-point base, so a
 * niche non-commodity part can exceed what raw demand alone would predict,
 * and a commodity part gets meaningfully suppressed even with good demand).
 */
import type { SsfDemandObservation, SsfGapScore, SsfGapComponents } from "./ssf-types";
import type { SsfConfig } from "./ssf-config";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export interface SsfCatalogRef {
  ssf_part_number: string;
  description?: string | null;
  our_cost?: number | null;
  list_price?: number | null;
  brands?: string[];
}

export function scoreSsfGap(obs: SsfDemandObservation, catalog: SsfCatalogRef | null, config: SsfConfig): SsfGapScore {
  const description = catalog?.description || obs.description;
  const ourCost = catalog?.our_cost ?? null;
  const referencePrice = catalog?.list_price ?? obs.median_sold_price;

  // ─── Velocity: sold ÷ active supply. Zero active with sold history = uncontested. ───
  const velocity = obs.active_count > 0 ? obs.sold_count / obs.active_count : obs.sold_count > 0 ? obs.sold_count : 0;
  const velocity_component = round2(clamp(velocity / 5, 0, 1) * 40);

  // ─── Margin: after eBay fee + shipping + promo assumption. ───
  let margin_dollars: number | null = null;
  let margin_pct: number | null = null;
  let margin_component = 0;
  if (ourCost !== null && referencePrice > 0) {
    const fees = referencePrice * config.ebay_fee_pct;
    const promo = referencePrice * config.promo_pct;
    margin_dollars = round2(referencePrice - ourCost - fees - promo - config.shipping_estimate);
    margin_pct = round2(margin_dollars / referencePrice);
    margin_component = round2(clamp(margin_pct / 0.5, 0, 1) * 30);
  }

  // ─── Scarcity: fewer active competing listings is better. ───
  const scarcity_component = round2(clamp((10 - obs.active_count) / 10, 0, 1) * 15);

  // ─── Niche bonus / commodity penalty. ───
  const haystack = `${description} ${(catalog?.brands ?? []).join(" ")}`.toLowerCase();
  const isNiche = config.niche_brands.some((b) => haystack.includes(b));
  const isCommodity = config.commodity_keywords.some((k) => haystack.includes(k));
  const niche_bonus = isNiche ? 15 : 0;
  const commodity_penalty = isCommodity ? -20 : 0;

  const components: SsfGapComponents = { velocity_component, margin_component, scarcity_component, niche_bonus, commodity_penalty };
  const gap_score = round2(clamp(velocity_component + margin_component + scarcity_component + niche_bonus + commodity_penalty, 0, 100));

  const why: string[] = [];
  why.push(
    obs.active_count > 0
      ? `Sold ${obs.sold_count} vs ${obs.active_count} active listings (${round2(velocity)}x demand-gap)`
      : `Sold ${obs.sold_count}, no active competition — uncontested`
  );
  if (margin_pct !== null) {
    why.push(`Margin ${Math.round(margin_pct * 100)}% ($${margin_dollars} on $${round2(referencePrice)} ${catalog?.list_price ? "list" : "median sold"} price, cost $${ourCost})`);
  } else {
    why.push(`No cost on file for ${obs.ssf_part_number} — margin unknown, upload catalog pricing to score this properly`);
  }
  if (isNiche) why.push("Niche bonus: matches Land Rover/Jaguar/Volvo/Porsche fitment");
  if (isCommodity) why.push("Commodity penalty: maintenance-item SKU, thin differentiation");

  return {
    ssf_part_number: obs.ssf_part_number,
    description,
    our_cost: ourCost,
    reference_price: round2(referencePrice),
    sold_count: obs.sold_count,
    active_count: obs.active_count,
    velocity: round2(velocity),
    margin_dollars,
    margin_pct,
    gap_score,
    components,
    why,
  };
}

export function rankGaps(scores: SsfGapScore[]): SsfGapScore[] {
  return [...scores].sort((a, b) => b.gap_score - a.gap_score);
}
