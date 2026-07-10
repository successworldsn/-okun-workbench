/**
 * Marketplace heavy-item lister (Module 5a) — drafts title/price/description/
 * pickup terms for local-only inventory (engines, transmissions, panels).
 * Manual posting only: no Marketplace API automation exists (and won't —
 * there's no reliable API for this, and browser automation is explicitly
 * ruled out in the spec as a ToS risk). Same Claude-with-template-fallback
 * shape as lib/listing-draft.ts.
 */
import { complete, CLAUDE_CONFIGURED } from "./claude";
import type { InventoryItem } from "./types";

export interface FbDraft {
  title: string;
  description: string;
  pickupTerms: string;
  source: "claude" | "template";
}

const SYSTEM_PROMPT = `You draft Facebook Marketplace listings for heavy salvage auto parts (local pickup only, no shipping). Casual but clear tone. Always include safe-exchange pickup language (public meeting spot or by-appointment shop pickup, cash or verified payment only). Output ONLY valid JSON: {"title": string, "description": string, "pickupTerms": string}.`;

export async function draftFbListing(item: InventoryItem, suggestedPrice: number | null): Promise<FbDraft> {
  if (CLAUDE_CONFIGURED) {
    const userText = `Item: ${item.description}\nSource vehicle: ${item.vehicle_source ?? "n/a"}\nSuggested price: ${suggestedPrice ?? "not set — suggest one based on the item"}`;
    const result = await complete(SYSTEM_PROMPT, userText);
    if (result.ok && result.text) {
      try {
        const parsed = JSON.parse(result.text.slice(result.text.indexOf("{"), result.text.lastIndexOf("}") + 1));
        if (parsed.title && parsed.description) {
          return { title: parsed.title, description: parsed.description, pickupTerms: parsed.pickupTerms ?? "", source: "claude" };
        }
      } catch {
        // fall through
      }
    }
  }

  return {
    title: item.description,
    description: `${item.description}. Pulled from ${item.vehicle_source ?? "a donor vehicle"}. Local pickup only, heavy item — bring help to load.`,
    pickupTerms: "Cash or verified payment on pickup. Meet at the shop by appointment — no shipping, no holds without a deposit.",
    source: "template",
  };
}
