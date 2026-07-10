/**
 * SSF new-parts channel — demand-gap scanner types.
 * Per-SKU, not per-vehicle (contrast with okun-scanner's per-YMM salvage scoring).
 */

export interface SsfDemandObservation {
  ssf_part_number: string;
  description: string;
  sold_count: number;
  active_count: number; // = competing listings = supply
  median_sold_price: number;
  avg_days_to_sell?: number;
  source: "terapeak_csv" | "ebay_browse";
}

export interface SsfGapComponents {
  velocity_component: number; // up to 40 — sold ÷ active supply
  margin_component: number; // up to 30 — margin % after fees/shipping/promo
  scarcity_component: number; // up to 15 — fewer active sellers is better
  niche_bonus: number; // 0 or 15 — Land Rover/Jaguar/Volvo/older Porsche
  commodity_penalty: number; // 0 or -20 — maintenance commodity SKU
}

export interface SsfGapScore {
  ssf_part_number: string;
  description: string;
  our_cost: number | null;
  reference_price: number; // catalog list_price if set, else median_sold_price
  sold_count: number;
  active_count: number;
  velocity: number; // sold ÷ active (Infinity treated as capped)
  margin_dollars: number | null;
  margin_pct: number | null; // 0..1
  gap_score: number; // 0..100
  components: SsfGapComponents;
  why: string[];
}
