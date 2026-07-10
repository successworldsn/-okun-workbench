/**
 * Password hashing — Node's built-in scrypt, no external dependency (matches
 * this app's zero-extra-runtime-dep pattern elsewhere). Only ever imported
 * by the login route/action — never by middleware.ts (Edge runtime, no Node
 * crypto module there; see lib/session.ts for the Edge-safe session half).
 */
import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hashHex] = stored.split(":");
  if (!salt || !hashHex) return false;
  const candidate = scryptSync(password, salt, 64);
  const target = Buffer.from(hashHex, "hex");
  if (candidate.length !== target.length) return false;
  return timingSafeEqual(candidate, target);
}
