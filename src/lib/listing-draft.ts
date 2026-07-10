/**
 * Listing drafter — Claude drafts title/description/fitment/interchange from
 * an approved gap item's catalog data. Falls back to a plain template when
 * ANTHROPIC_API_KEY isn't set, so the pipeline (draft → VeRO guard → queue)
 * still runs end-to-end without a key; the fallback is intentionally boring
 * so it can't itself trip the VeRO guard.
 */
import { complete, CLAUDE_CONFIGURED } from "./claude";
import type { SsfCatalogItem } from "./types";

export interface ListingDraft {
  title: string;
  description: string;
  itemSpecifics: Record<string, string>;
  source: "claude" | "template";
}

const SYSTEM_PROMPT = `You draft eBay auto-parts listings for a reseller. Rules, non-negotiable:
- Never claim "genuine"/"OEM" unless told the part is on a Genuine line.
- Brand names may only appear in fitment context ("fits BMW E90"), never as a claim of origin or endorsement.
- No manufacturer logos, packaging, or catalog-photo references.
- Output ONLY valid JSON: {"title": string (max 80 chars), "description": string, "itemSpecifics": {"Brand": string, "Manufacturer Part Number": string, "Interchange Part Number": string}}`;

export async function draftListing(item: SsfCatalogItem, isGenuineLine: boolean): Promise<ListingDraft> {
  if (CLAUDE_CONFIGURED) {
    const userText = `SKU: ${item.ssf_part_number}\nDescription: ${item.description}\nBrands: ${item.brands.join(", ")}\nOEM/interchange numbers: ${item.oem_numbers.join(", ")}\nGenuine line: ${isGenuineLine}\nFitment: ${JSON.stringify(item.fitment ?? {})}`;
    const result = await complete(SYSTEM_PROMPT, userText);
    if (result.ok && result.text) {
      try {
        const jsonText = result.text.slice(result.text.indexOf("{"), result.text.lastIndexOf("}") + 1);
        const parsed = JSON.parse(jsonText);
        if (parsed.title && parsed.description) {
          return { title: parsed.title, description: parsed.description, itemSpecifics: parsed.itemSpecifics ?? {}, source: "claude" };
        }
      } catch {
        // fall through to template
      }
    }
  }

  const brand = item.brands[0] ?? "";
  const title = `${item.description} — Fits ${brand}`.slice(0, 80);
  const description = `${item.description}. Aftermarket replacement part. Fits ${item.brands.join(", ") || "listed"} applications — see fitment for details. Interchange/OEM reference numbers: ${item.oem_numbers.join(", ") || "n/a"}. Handling time 3 business days.`;
  return {
    title,
    description,
    itemSpecifics: { Brand: brand, "Manufacturer Part Number": item.ssf_part_number, "Interchange Part Number": item.oem_numbers.join(", ") },
    source: "template",
  };
}
