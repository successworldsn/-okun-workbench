/**
 * Free-Site Brief Generator (3b) + Flyer Copy Generator (3c). Both go through
 * lib/claude.ts and both are hard-restricted to usableFacts() — a single_source
 * fact the operator hasn't approved yet cannot reach either output, and
 * "inferred" facts never exist as input in the first place (never persisted).
 * Template fallback when Claude isn't configured, same shape as every other
 * drafter in this app.
 */
import { complete, CLAUDE_CONFIGURED } from "./claude";
import { usableFacts } from "./gift-protocol";
import type { GiftProtocolProspect, SiteBrief } from "./types";

const SYSTEM_BRIEF = `You write a web-design brief for a small local business getting a free modern website. Use ONLY the facts provided — never invent details. Output ONLY valid JSON:
{"brandVoice": string, "palette": string, "trustElements": string[], "visualLanguage": string}
trustElements should be concrete things the site needs (e.g. "click-to-call phone in header", "embedded Google reviews", "booking CTA"), tailored to the business category. visualLanguage should be "refined tech-forward" — distinctive typography/motion/detail, not literal sci-fi.`;

export async function generateSiteBrief(prospect: Pick<GiftProtocolProspect, "business_name" | "category" | "dossier">): Promise<SiteBrief> {
  const facts = usableFacts(prospect.dossier).map((f) => f.fact);
  if (CLAUDE_CONFIGURED) {
    const userText = `Business: ${prospect.business_name}\nCategory: ${prospect.category ?? "unknown"}\nFacts:\n${facts.map((f) => `- ${f}`).join("\n")}`;
    const result = await complete(SYSTEM_BRIEF, userText);
    if (result.ok && result.text) {
      try {
        const parsed = JSON.parse(result.text.slice(result.text.indexOf("{"), result.text.lastIndexOf("}") + 1));
        if (parsed.brandVoice) return parsed as SiteBrief;
      } catch {
        // fall through
      }
    }
  }
  return {
    brandVoice: `[Claude not configured — draft manually] Trustworthy, straightforward, ${prospect.category ?? "local business"} tone.`,
    palette: "TBD — pick from industry-appropriate palette manually",
    trustElements: ["click-to-call phone in header", "real photos, not stock", "hours + address", "embedded reviews"],
    visualLanguage: "refined tech-forward — clean type, subtle motion, no literal sci-fi cliches",
  };
}

const SYSTEM_FLYER = `You write 2-3 short, personalized flyer headline/opening-line options for a small local business receiving a free website as a gift. Use ONLY the facts provided — never invent or embellish. Warm, specific, not salesy. Output ONLY a JSON array of strings, e.g. ["line one", "line two"].`;

export async function generateFlyerCopy(prospect: Pick<GiftProtocolProspect, "business_name" | "category" | "dossier">): Promise<string[]> {
  const facts = usableFacts(prospect.dossier).map((f) => f.fact);
  if (facts.length === 0) {
    return [`[No usable facts yet — approve at least one dossier fact, or add confirmed facts, before generating flyer copy for ${prospect.business_name}]`];
  }
  if (CLAUDE_CONFIGURED) {
    const userText = `Business: ${prospect.business_name}\nCategory: ${prospect.category ?? "unknown"}\nFacts:\n${facts.map((f) => `- ${f}`).join("\n")}`;
    const result = await complete(SYSTEM_FLYER, userText);
    if (result.ok && result.text) {
      try {
        const parsed = JSON.parse(result.text.slice(result.text.indexOf("["), result.text.lastIndexOf("]") + 1));
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch {
        // fall through
      }
    }
  }
  return [`[Claude not configured — draft manually] We built ${prospect.business_name} a free website. Yours to keep.`];
}
