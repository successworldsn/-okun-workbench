/**
 * Owner outreach drafts for the Deal Desk: phone script, text, email, letter.
 * Deterministic templates built only from public-record facts on the property
 * (never from inferences) — Claude may polish them in the server action, but
 * a person approves and sends every one. Nothing here sends anything.
 */
import type { Intel } from "./re-intel.ts";

export type Channel = "script" | "sms" | "email" | "letter";

export const COMPLIANCE: Record<Channel, string> = {
  script: "Scrub the number against the National Do Not Call Registry first. Identify yourself and your company in the first sentence.",
  sms: "Texting a cell number you found in public records without the owner's prior consent can violate the TCPA. Send texts only to owners who gave you their number or replied first, one at a time, by hand.",
  email: "Include your physical mailing address and an opt-out line (CAN-SPAM).",
  letter: "Letters are the lowest-risk first touch. For estates, address the personal representative and keep the tone respectful.",
};

const titleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

/** "SMITH JOHN A" / "EXAMPLE OWNER 02 ESTATE" → a usable salutation. */
export function salutation(owner?: string): string {
  const o = (owner ?? "").trim();
  if (!o) return "Property Owner";
  if (/\b(LLC|INC|CORP|TRUST|LP|LTD|PROPERTIES|HOLDINGS|INVESTMENTS?)\b/i.test(o)) return titleCase(o);
  if (/\b(ESTATE|EST OF|HEIRS?)\b/i.test(o)) return "Personal Representative";
  return "Property Owner";
}

export function draftOutreach(i: Intel, channel: Channel, sender = "[Your name]", company = "[Your company]", phone = "[Your phone]"): string {
  const p = i.p;
  const addr = titleCase(p.address);
  const estate = !!p.probate || /\b(ESTATE|HEIRS?)\b/i.test(p.owner ?? "");
  const hello = `Hello ${salutation(p.owner)},`;
  const ask = estate
    ? `I understand the property at ${addr} may be part of an estate. If the family is deciding what to do with it, I buy houses as-is and can close on the estate's timeline.`
    : `I'm a local buyer interested in ${addr}. If you've ever thought about selling, I can make a cash offer, buy it as-is, and close on your schedule.`;
  switch (channel) {
    case "script":
      return [
        `Hi, this is ${sender} with ${company}. Am I speaking with the owner of ${addr}?`,
        estate ? "I'm sorry for your family's loss. I'm calling because I buy houses as-is, and estates sometimes prefer a simple sale." : "I buy houses in the area as-is and wanted to ask if you'd consider an offer on it.",
        "",
        "If yes → What's the house like right now? Anyone living there? What would you need to get out of it? What's your timeline?",
        "If not now → Would it be OK if I checked back in a few months?",
        "If no → Thank you. I'll take you off my list.",
      ].join("\n");
    case "sms":
      return `Hi, this is ${sender} with ${company}. ${estate ? `I buy houses as-is and wanted to ask whether the family is considering selling ${addr}.` : `Would you consider an offer on ${addr}? I buy as-is, no repairs.`} Reply STOP and I won't text again.`;
    case "email":
      return [
        `Subject: About ${addr}`,
        "",
        hello,
        "",
        ask,
        "",
        "No repairs, no cleaning, no agent commissions. If you're open to a conversation, reply here or call me.",
        "",
        `${sender}`,
        `${company} · ${phone}`,
        "[Your mailing address]",
        "If you'd rather not hear from me again, reply \"remove\" and I won't contact you.",
      ].join("\n");
    case "letter":
      return [
        hello,
        "",
        ask,
        "",
        "Many owners I work with are dealing with repairs, tenants, distance, or a house they simply don't need anymore. I handle the paperwork and closing costs, and you pick the closing date.",
        "",
        `If you'd like to talk, call or text me at ${phone}. If not, no reply is needed and I won't follow up more than once.`,
        "",
        "Sincerely,",
        sender,
        company,
      ].join("\n");
  }
}

/** Plain-English "what should I do?" plan, built only from the engine's output. */
export function planFor(i: Intel, actionVerb: string, actionWhy: string): string {
  const top = i.strategies.filter((s) => s.key !== "no_go").slice(0, 2);
  const lines = [
    `${actionVerb}: ${actionWhy}.`,
    `Score ${i.score}/100 at ${i.confidence}% confidence (${i.why}).`,
    i.strongest.length ? `Strongest signals: ${i.strongest.join("; ")}.` : "No strong signals yet.",
    top.length ? `Best-fit exits: ${top.map((s) => `${s.key.replace("_", " ")} (${s.fit}): ${s.economics}`).join(" | ")}.` : "",
    i.engines.risk.findings.length ? `Watch out: ${i.engines.risk.findings.map((f) => f.text).join("; ")}.` : "",
    `Before an offer: ${i.nextVerification}. Unknown: ${i.unknowns.slice(0, 3).join("; ")}.`,
  ];
  return lines.filter(Boolean).join("\n");
}
