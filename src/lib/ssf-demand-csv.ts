/**
 * Terapeak Product Research (SKU-level export) → SsfDemandObservation[].
 * Same "guaranteed to work day 1, no API approval" reasoning as
 * okun-scanner/providers/terapeak-csv.ts. Expected header row (case-insensitive,
 * order-independent): ssf_part_number, description, sold_count, active_count,
 * median_sold_price, avg_days_to_sell (optional).
 */
import { parseCsv } from "./csv";
import type { SsfDemandObservation } from "./ssf-types";

export function observationsFromSsfDemandCsv(text: string): SsfDemandObservation[] {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const header = rows[0]!.map((h) => h.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name);
  const col = {
    sku: idx("ssf_part_number"),
    desc: idx("description"),
    sold: idx("sold_count"),
    active: idx("active_count"),
    price: idx("median_sold_price"),
    days: idx("avg_days_to_sell"),
  };
  const required = [col.sku, col.desc, col.sold, col.active, col.price];
  if (required.some((i) => i < 0)) {
    throw new Error("SSF demand CSV missing required columns: ssf_part_number, description, sold_count, active_count, median_sold_price");
  }

  return rows.slice(1).map((r) => ({
    ssf_part_number: (r[col.sku] ?? "").trim(),
    description: (r[col.desc] ?? "").trim(),
    sold_count: Math.max(0, Math.round(Number(r[col.sold]) || 0)),
    active_count: Math.max(0, Math.round(Number(r[col.active]) || 0)),
    median_sold_price: Number(r[col.price]) || 0,
    avg_days_to_sell: col.days >= 0 ? Number(r[col.days]) || undefined : undefined,
    source: "terapeak_csv" as const,
  }));
}
