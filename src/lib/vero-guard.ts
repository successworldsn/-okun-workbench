/**
 * VeRO guard — deterministic keyword/rule checks, not an AI judgment call.
 * Same reasoning as okun-capital's compliance.ts: the thing that can get the
 * account suspended lives in tested code, not a prompt. Runs before every
 * listing hits the approval queue.
 */
import type { SsfConfig } from "./ssf-config";

export interface VeroCheckInput {
  title: string;
  description: string;
  brands: string[];
  isGenuineLine: boolean; // true only if the SSF catalog line is actually OEM/Genuine
}

export interface VeroCheckResult {
  blocked: boolean; // hard stop — draft must be rewritten before it can queue
  flagged: boolean; // can queue, but manual review required (e.g. brand-restricted)
  reasons: string[];
}

const LOGO_CATALOG_PHRASES = ["oem box", "genuine packaging", "manufacturer box", "catalog photo", "stock photo from manufacturer", "official packaging"];

/** Brand mention not immediately preceded by a fitment word ("fits"/"for") reads as a brand claim, not fitment context. */
function hasBareBrandMention(text: string, brand: string): boolean {
  const lower = text.toLowerCase();
  const b = brand.toLowerCase();
  let idx = lower.indexOf(b);
  while (idx !== -1) {
    const preceding = lower.slice(Math.max(0, idx - 12), idx);
    if (!/\b(fits?|for|compatible with)\s+\S*\s*$/.test(preceding)) return true;
    idx = lower.indexOf(b, idx + b.length);
  }
  return false;
}

export function checkVero(input: VeroCheckInput, config: SsfConfig): VeroCheckResult {
  const reasons: string[] = [];
  let blocked = false;
  let flagged = false;
  const haystack = `${input.title} ${input.description}`.toLowerCase();

  for (const phrase of LOGO_CATALOG_PHRASES) {
    if (haystack.includes(phrase)) {
      blocked = true;
      reasons.push(`References manufacturer packaging/photo ("${phrase}") — use supplier-licensed images and generic packaging language only`);
    }
  }

  if (haystack.includes("genuine") && !input.isGenuineLine) {
    blocked = true;
    reasons.push('Uses "genuine" but this SKU is not on a Genuine/OEM catalog line');
  }

  for (const brand of input.brands) {
    if (hasBareBrandMention(input.title, brand) || hasBareBrandMention(input.description, brand)) {
      flagged = true;
      reasons.push(`"${brand}" appears outside fitment context ("fits ${brand}...") — brand names must only appear as compatibility, not as a claim of origin`);
    }
  }

  for (const restricted of config.vero_review_brands) {
    if (input.brands.some((b) => b.toLowerCase() === restricted)) {
      flagged = true;
      reasons.push(`${restricted} is a VeRO-sensitive brand — manual review required before publish regardless of other checks`);
    }
  }

  reasons.push("Reminder (not automatable here): confirm listing images are supplier-licensed, not scraped from the manufacturer.");

  return { blocked, flagged, reasons };
}
