/**
 * SSF pricing file → catalog upsert rows. Manual upload only (EuroLink /
 * sales-rep price file) — deliberately not a EuroLink scraper, per Module 2a's
 * ToS-risk call. Expected header row (case-insensitive, order-independent):
 * ssf_part_number, oem_numbers, description, brands, our_cost, list_price,
 * stock_status, warehouse. oem_numbers/brands are semicolon-separated within
 * the cell (commas would break CSV quoting on export from most price sheets).
 */
import { parseCsv } from "./csv";
import { getSsfConfig } from "./ssf-config";

export interface SsfCatalogUploadRow {
  ssf_part_number: string;
  oem_numbers: string[];
  description: string;
  brands: string[];
  our_cost: number | null;
  list_price: number | null;
  stock_status: string;
  warehouse: string;
}

const VALID_WAREHOUSES = new Set(["kennesaw", "norcross"]);

export function parseSsfCatalogCsv(text: string): { rows: SsfCatalogUploadRow[]; errors: string[] } {
  const rows = parseCsv(text);
  if (rows.length < 2) return { rows: [], errors: ["CSV has no data rows"] };
  const header = rows[0]!.map((h) => h.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name);
  const col = {
    sku: idx("ssf_part_number"), oem: idx("oem_numbers"), desc: idx("description"), brands: idx("brands"),
    cost: idx("our_cost"), list: idx("list_price"), stock: idx("stock_status"), wh: idx("warehouse"),
  };
  const required = [col.sku, col.desc, col.cost, col.list, col.stock, col.wh];
  if (required.some((i) => i < 0)) {
    return { rows: [], errors: ["Missing required columns: ssf_part_number, description, our_cost, list_price, stock_status, warehouse"] };
  }

  const out: SsfCatalogUploadRow[] = [];
  const errors: string[] = [];
  rows.slice(1).forEach((r, i) => {
    const sku = (r[col.sku] ?? "").trim();
    const warehouse = (r[col.wh] ?? "").trim().toLowerCase();
    if (!sku) { errors.push(`Row ${i + 2}: missing ssf_part_number, skipped`); return; }
    if (!VALID_WAREHOUSES.has(warehouse)) { errors.push(`Row ${i + 2} (${sku}): warehouse "${warehouse}" must be kennesaw or norcross, skipped`); return; }
    out.push({
      ssf_part_number: sku,
      oem_numbers: col.oem >= 0 ? (r[col.oem] ?? "").split(";").map((s) => s.trim()).filter(Boolean) : [],
      description: (r[col.desc] ?? "").trim(),
      brands: col.brands >= 0 ? (r[col.brands] ?? "").split(";").map((s) => s.trim()).filter(Boolean) : [],
      our_cost: r[col.cost] ? Number(r[col.cost]) : null,
      list_price: r[col.list] ? Number(r[col.list]) : null,
      stock_status: (r[col.stock] ?? "").trim() || "unknown",
      warehouse,
    });
  });
  return { rows: out, errors };
}

/** Stale/blocked thresholds against last_updated. */
export function pricingAge(lastUpdated: string): { days: number; amber: boolean; blocked: boolean } {
  const config = getSsfConfig();
  const days = Math.floor((Date.now() - new Date(lastUpdated).getTime()) / 86_400_000);
  return { days, amber: days > config.stale_amber_days, blocked: days > config.stale_block_days };
}
