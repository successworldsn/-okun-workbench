/**
 * Usman's access_scope is "parts_only" — Module 1 (salvage) + Module 2 (SSF)
 * only, per the spec's "Usman (parts modules only)". Pure + Edge-safe so
 * middleware.ts can import it directly.
 */
const PARTS_ONLY_PREFIXES = ["/buy-queue", "/inventory", "/ledger", "/ssf"];

export function canAccessPath(accessScope: "full" | "parts_only", pathname: string): boolean {
  if (accessScope === "full") return true;
  if (pathname === "/") return true; // Today Screen dashboard — visible to both
  return PARTS_ONLY_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}
