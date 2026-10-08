#!/usr/bin/env node
/**
 * Upload the feed output to a PRIVATE Supabase Storage bucket so the deployed
 * Deal Desk can read it (lib/re-desk-store.ts). The feed holds owner names
 * from public records, so it never goes into the repo or a public artifact.
 *
 * Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (GitHub repo secrets in CI).
 * Without them it does nothing and says so.
 */
import { readFile } from "node:fs/promises";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucket = process.env.RE_INTEL_BUCKET || "godseye-private";
const files = process.argv.slice(2);

if (!url || !key) {
  console.log("Private upload skipped: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set (add them as repo secrets). The feed output was not kept.");
  process.exit(0);
}
const h = { authorization: `Bearer ${key}`, apikey: key };
// Create the bucket private on first run (409 = already exists).
const mk = await fetch(`${url}/storage/v1/bucket`, { method: "POST", headers: { ...h, "content-type": "application/json" }, body: JSON.stringify({ id: bucket, name: bucket, public: false }) });
if (!mk.ok && mk.status !== 409 && mk.status !== 400) throw new Error(`bucket: HTTP ${mk.status}`);
for (const f of files) {
  const name = f.split("/").pop();
  const body = await readFile(f);
  const res = await fetch(`${url}/storage/v1/object/${bucket}/${name}`, { method: "POST", headers: { ...h, "content-type": name.endsWith(".json") ? "application/json" : name.endsWith(".csv") ? "text/csv" : "text/html", "x-upsert": "true" }, body });
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  console.log(`Uploaded ${name} (${(body.length / 1e6).toFixed(1)} MB) to private bucket "${bucket}".`);
}
