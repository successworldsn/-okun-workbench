/**
 * Prospect Researcher + Outreach Drafter (Module 3) + buyer blast drafter
 * (Module 4). All go through lib/claude.ts. Two honest gaps, called out where
 * they bite:
 *  - Prospect Researcher: spec calls for an after-hours Twilio test call +
 *    reviews/website pull. Neither is built — this only works from what's
 *    typed into the prospect's name/website/notes fields.
 *  - Outreach Drafter: spec calls it the "Gift Protocol" but that playbook
 *    isn't documented anywhere in the build spec handed to this app, so the
 *    system prompt below is a generic warm/value-first draft, not the real
 *    protocol. Swap SYSTEM_OUTREACH once the actual playbook is available.
 */
import { complete, CLAUDE_CONFIGURED } from "./claude";
import type { RetainerProspect, Deal } from "./types";

export interface ResearchResult {
  brief: string;
  suggestedOffer: string;
  source: "claude" | "unavailable";
}

const SYSTEM_RESEARCH = `You research small business prospects for a parts-sourcing retainer pitch (auto salvage/aftermarket parts, metro Atlanta). Given a business name and any notes provided, write:
1. A 2-3 sentence brief (what kind of shop, size signal, anything relevant to a parts-sourcing pitch)
2. A suggested monthly retainer offer with one line of reasoning
Output ONLY valid JSON: {"brief": string, "suggestedOffer": string}. If you don't have enough information, say so plainly in the brief rather than inventing details.`;

export async function researchProspect(name: string, notes: string): Promise<ResearchResult> {
  if (!CLAUDE_CONFIGURED) {
    return {
      brief: `Claude not configured (ANTHROPIC_API_KEY) — no automated research available. Also note: the after-hours Twilio test-call and reviews/website pull from the spec aren't built; this only ever works from what's typed in manually.`,
      suggestedOffer: "",
      source: "unavailable",
    };
  }
  const result = await complete(SYSTEM_RESEARCH, `Business name: ${name}\nNotes: ${notes || "(none provided)"}`);
  if (result.ok && result.text) {
    try {
      const json = JSON.parse(result.text.slice(result.text.indexOf("{"), result.text.lastIndexOf("}") + 1));
      if (json.brief) return { brief: json.brief, suggestedOffer: json.suggestedOffer ?? "", source: "claude" };
    } catch {
      // fall through
    }
  }
  return { brief: result.error ?? "Research failed", suggestedOffer: "", source: "unavailable" };
}

const SYSTEM_OUTREACH = `You draft a short, warm, value-first first-touch SMS to a small business owner about a parts-sourcing retainer. No hard pitch, no jargon, reference something specific if provided. Under 320 characters. Output ONLY the message text, nothing else.
NOTE TO OPERATOR: this is a generic warm-outreach draft, not the actual "Gift Protocol" playbook — that playbook wasn't documented anywhere in the build spec, so replace this system prompt with the real one when available.`;

export async function draftRetainerOutreach(prospect: Pick<RetainerProspect, "name" | "brief">): Promise<string> {
  if (!CLAUDE_CONFIGURED) {
    return `[Claude not configured — draft manually] Hi, following up about parts sourcing for ${prospect.name}.`;
  }
  const result = await complete(SYSTEM_OUTREACH, `Business: ${prospect.name}\nBrief: ${prospect.brief ?? "(none)"}`);
  return result.ok && result.text ? result.text.trim() : `[Draft failed: ${result.error}]`;
}

const SYSTEM_BUYER_BLAST = `You draft a short buyer-briefing SMS for a wholesale real estate deal, going to pre-vetted cash buyers. Include address/area, price point, and a call to reply fast if interested. Under 320 characters. Output ONLY the message text.`;

export async function draftBuyerBlast(deal: Pick<Deal, "name">, dealDetails: string): Promise<string> {
  if (!CLAUDE_CONFIGURED) {
    return `[Claude not configured — draft manually] New deal available: ${deal.name}. ${dealDetails}`;
  }
  const result = await complete(SYSTEM_BUYER_BLAST, `Deal: ${deal.name}\nDetails: ${dealDetails}`);
  return result.ok && result.text ? result.text.trim() : `[Draft failed: ${result.error}]`;
}
