/**
 * SSF channel economics + tuning knobs. Env-overridable, same pattern as
 * okun-scanner/config.ts.
 */
function num(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v.trim() === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function list(name: string, fallback: string[]): string[] {
  const v = process.env[name];
  if (!v || v.trim() === "") return fallback;
  return v.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

export interface SsfConfig {
  ebay_fee_pct: number;
  promo_pct: number;
  shipping_estimate: number;
  niche_brands: string[];
  commodity_keywords: string[];
  stale_amber_days: number;
  stale_block_days: number;
  vero_review_brands: string[];
  handling_time_business_days: number;
  margin_floor_pct: number;
}

export function getSsfConfig(): SsfConfig {
  return {
    ebay_fee_pct: num("SSF_EBAY_FEE_PCT", 0.136),
    promo_pct: num("SSF_PROMO_PCT", 0.03),
    shipping_estimate: num("SSF_SHIPPING_ESTIMATE", 12),
    niche_brands: list("SSF_NICHE_BRANDS", ["land rover", "range rover", "jaguar", "volvo", "porsche"]),
    commodity_keywords: list("SSF_COMMODITY_KEYWORDS", [
      "oil filter", "air filter", "cabin filter", "wiper", "spark plug", "brake pad", "brake pads", "serpentine belt", "cabin air filter",
    ]),
    stale_amber_days: num("SSF_STALE_AMBER_DAYS", 7),
    stale_block_days: num("SSF_STALE_BLOCK_DAYS", 14),
    vero_review_brands: list("SSF_VERO_REVIEW_BRANDS", ["bmw", "mercedes", "mercedes-benz", "porsche"]),
    handling_time_business_days: num("SSF_HANDLING_DAYS", 3),
    margin_floor_pct: num("SSF_MARGIN_FLOOR_PCT", 0.1),
  };
}
