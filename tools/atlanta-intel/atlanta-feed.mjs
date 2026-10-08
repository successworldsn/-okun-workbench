#!/usr/bin/env node
/**
 * Atlanta public-record feed → data/atlanta-intel.json for the God's Eye Deal Desk.
 *
 * Signals first, parcels second: pull the event layers (building permits,
 * Building Complaint records, code-enforcement history), plus any lists you
 * got by records request (tax delinquent, foreclosure notices, probate), then
 * pull parcel + Fulton CAMA rows only for the parcels those signals touch
 * (and every parcel in any --zip you sweep). Every row keeps its source and
 * record date so the desk can badge it VERIFIED / INFERRED / STALE.
 *
 *   node tools/atlanta-intel/atlanta-feed.mjs --discover          # find the layer URLs
 *   node tools/atlanta-intel/atlanta-feed.mjs                      # default: 730 days of permits
 *   node tools/atlanta-intel/atlanta-feed.mjs --since 365 --zip 30310 --zip 30314 \
 *        --tax lists/tax.csv --foreclosure lists/notices.csv --probate lists/estates.csv
 *
 * Layer URLs live in tools/atlanta-intel/sources.json (or env ATL_<KEY>_URL).
 * Run it from a machine whose network can reach gis.atlantaga.gov and
 * services*.arcgis.com. Needs Node >= 22.18 (imports the engine's TypeScript
 * directly, like `npm test`).
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mapPermitRow, mapCodeRow, mapParcel, parcelKey, attachListRow, buildMarket, toDealIntelCsvRow, unmappedFields, pick, FIELDS } from "../../src/lib/re-feed-map.ts";
import { analyzeAll, ownershipYears, rehabEstimate } from "../../src/lib/re-intel.ts";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");

function args() {
  const a = process.argv.slice(2);
  const all = (flag) => a.flatMap((x, i) => (x === flag ? [a[i + 1]] : []));
  const one = (flag, d = null) => all(flag)[0] ?? d;
  return {
    discover: a.includes("--discover"),
    since: Number(one("--since", "730")),
    zips: all("--zip"),
    tax: one("--tax"),
    foreclosure: one("--foreclosure"),
    probate: one("--probate"),
    out: one("--out", join(root, "data", "atlanta-intel.json")),
    maxParcels: Number(one("--max-parcels", "5000")),
  };
}

async function loadSources() {
  const cfg = JSON.parse(await readFile(join(here, "sources.json"), "utf8"));
  for (const [k, v] of Object.entries(cfg.layers)) {
    const env = process.env[`ATL_${k.toUpperCase()}_URL`];
    if (env) v.url = env;
  }
  return cfg;
}

// ─── ArcGIS REST ────────────────────────────────────────────────────────────

async function getJson(url, params) {
  const body = new URLSearchParams({ f: "json", ...params });
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, { method: "POST", body, headers: { "content-type": "application/x-www-form-urlencoded" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      if (j.error) throw new Error(`${j.error.code}: ${j.error.message}`);
      return j;
    } catch (e) {
      if (attempt === 3) throw e;
      await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
    }
  }
}

/** Every feature matching `where`, paged by the layer's maxRecordCount. */
async function query(layerUrl, where, { geometry = false, fields = "*" } = {}) {
  const meta = await getJson(layerUrl, {});
  const page = Math.min(meta.maxRecordCount || 1000, 2000);
  const out = [];
  for (let offset = 0; ; offset += page) {
    const j = await getJson(`${layerUrl}/query`, {
      where,
      outFields: fields,
      returnGeometry: String(geometry),
      outSR: "4326",
      resultOffset: String(offset),
      resultRecordCount: String(page),
    });
    out.push(...(j.features ?? []));
    if (!j.exceededTransferLimit && (j.features ?? []).length < page) break;
  }
  return { meta, features: out };
}

const sqlDate = (d) => `DATE '${d.toISOString().slice(0, 10)}'`;
const fieldIn = (meta, candidates) => (meta.fields ?? []).map((f) => f.name).find((n) => candidates.some((c) => c.toLowerCase().replace(/[^a-z0-9]/g, "") === n.toLowerCase().replace(/[^a-z0-9]/g, "")));

// ─── Discovery ──────────────────────────────────────────────────────────────

async function discover(cfg) {
  for (const [key, layer] of Object.entries(cfg.layers)) {
    console.log(`\n${key}  (${layer.label})`);
    console.log(`  configured: ${layer.url ?? "— not set —"}`);
    for (const title of layer.search ?? []) {
      try {
        const j = await getJson("https://www.arcgis.com/sharing/rest/search", { q: `title:"${title}" AND (type:"Feature Service" OR type:"Map Service")`, num: "8" });
        for (const r of j.results ?? []) console.log(`  candidate: ${r.url}  · "${r.title}" · owner ${r.owner} · modified ${new Date(r.modified).toISOString().slice(0, 10)}`);
      } catch (e) {
        console.log(`  search "${title}" failed: ${e.message}`);
      }
    }
  }
  console.log("\nPaste the right layer URL (ending in /FeatureServer/<n> or /MapServer/<n>) into tools/atlanta-intel/sources.json.");
}

// ─── CSV lists you obtained by request ──────────────────────────────────────

function parseCsv(text) {
  const rows = [];
  let row = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(f); f = ""; if (row.some((x) => x.trim())) rows.push(row); row = []; }
    else f += c;
  }
  row.push(f);
  if (row.some((x) => x.trim())) rows.push(row);
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), r[i]])));
}

async function readList(path) {
  if (!path) return [];
  return parseCsv(await readFile(path, "utf8"));
}

const normAddr = (s) => String(s ?? "").toUpperCase().replace(/[.,#]/g, " ").replace(/\s+/g, " ").trim();

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const opt = args();
  const cfg = await loadSources();
  if (opt.discover) return discover(cfg);
  const L = cfg.layers;
  const missing = ["parcels", "permits"].filter((k) => !L[k].url);
  if (missing.length) {
    console.error(`Set layer URLs for: ${missing.join(", ")} (run with --discover).`);
    process.exit(1);
  }
  const now = new Date();
  const pulledAt = now.toISOString();
  const since = new Date(now.getTime() - opt.since * 86_400_000);
  const report = [];
  const touched = new Set();
  const byParcel = new Map(); // parcel → { permits, cases }
  const byAddr = new Map(); // normalized address → parcel (filled once parcels arrive)
  const bucket = (k) => byParcel.get(k) ?? (byParcel.set(k, { permits: [], cases: [] }), byParcel.get(k));
  const orphanAddr = []; // rows with an address but no parcel id

  // 1. Permits + Building Complaints
  {
    const { meta } = { meta: await getJson(L.permits.url, {}) };
    const dateField = fieldIn(meta, [...FIELDS.permitDate]);
    const where = dateField ? `${dateField} >= ${sqlDate(since)}` : "1=1";
    const { features } = await query(L.permits.url, where);
    let complaints = 0, permits = 0, minD = null, maxD = null;
    for (const f of features) {
      const r = mapPermitRow(f.attributes);
      const d = r.permit?.issuedAt ?? r.complaint?.openedAt;
      if (d) { minD = !minD || d < minD ? d : minD; maxD = !maxD || d > maxD ? d : maxD; }
      const key = r.parcel ? parcelKey(r.parcel) : null;
      const item = r.complaint ? { case: r.complaint } : { permit: r.permit };
      if (key) {
        const b = bucket(key);
        if (r.complaint) { b.cases.push(r.complaint); complaints++; touched.add(key); }
        else { b.permits.push(r.permit); permits++; if (r.permit.category === "demolition") touched.add(key); }
      } else if (r.address) orphanAddr.push({ addr: normAddr(r.address), ...item });
    }
    report.push({ id: "permits", label: L.permits.label, url: L.permits.url, pulledAt, records: features.length, permits, complaints, minDate: minD, maxDate: maxD, where, unmapped: unmappedFields(features[0]?.attributes, ["parcelId", "permitType", "permitDate", "permitStatus"]) });
  }

  // 2. Code-enforcement history (2021–2023 published layer)
  if (L.code_history.url) {
    const { features } = await query(L.code_history.url, "1=1");
    for (const f of features) {
      const r = mapCodeRow(f.attributes);
      const key = r.parcel ? parcelKey(r.parcel) : null;
      if (key) {
        bucket(key).cases.push(r.case);
        if (r.case.open || r.case.vacant || r.case.boarded) touched.add(key);
      } else if (r.address) orphanAddr.push({ addr: normAddr(r.address), case: r.case });
    }
    const ds = features.map((f) => mapCodeRow(f.attributes).case.openedAt).filter(Boolean).sort();
    report.push({ id: "code_history", label: L.code_history.label, url: L.code_history.url, pulledAt, records: features.length, minDate: ds[0] ?? null, maxDate: ds.at(-1) ?? null, unmapped: unmappedFields(features[0]?.attributes, ["parcelId", "caseType", "caseOpened"]) });
  }

  // 3. Lists from records requests
  const lists = { tax: await readList(opt.tax), foreclosure: await readList(opt.foreclosure), probate: await readList(opt.probate) };
  for (const [kind, rows] of Object.entries(lists)) {
    for (const r of rows) {
      const pid = pick(r, [...FIELDS.parcelId]);
      if (pid) touched.add(parcelKey(pid));
    }
    if (rows.length) report.push({ id: kind === "tax" ? "tax_delinquent" : kind === "foreclosure" ? "foreclosure_notice" : "probate", label: `${kind} list (records request)`, url: opt[kind], pulledAt, records: rows.length });
  }

  // 4. Parcels (+ CAMA) for every touched parcel and every swept ZIP
  const idField = L.parcels.idField || "PARCELID";
  const parcels = new Map();
  const ingest = (features, cama) => {
    for (const f of features) {
      const key = parcelKey(pick(f.attributes, [...FIELDS.parcelId]));
      if (!key || parcels.has(key)) continue;
      parcels.set(key, mapParcel(f.attributes, f.geometry, cama.get(key), pulledAt));
    }
  };
  const camaFor = async (keys) => {
    const m = new Map();
    if (!L.cama.url || !keys.length) return m;
    const camaId = L.cama.idField || idField;
    for (let i = 0; i < keys.length; i += 150) {
      const ids = keys.slice(i, i + 150).map((k) => `'${k}'`).join(",");
      const { features } = await query(L.cama.url, `UPPER(REPLACE(REPLACE(${camaId},' ',''),'-','')) IN (${ids})`);
      features.forEach((f) => m.set(parcelKey(pick(f.attributes, [...FIELDS.parcelId])), f.attributes));
    }
    return m;
  };
  const touchedList = [...touched].slice(0, opt.maxParcels);
  for (let i = 0; i < touchedList.length; i += 150) {
    const chunk = touchedList.slice(i, i + 150);
    const ids = chunk.map((k) => `'${k}'`).join(",");
    const { features } = await query(L.parcels.url, `UPPER(REPLACE(REPLACE(${idField},' ',''),'-','')) IN (${ids})`, { geometry: true });
    ingest(features, await camaFor(chunk));
  }
  for (const zip of opt.zips) {
    const zipField = L.parcels.zipField || "SITEZIP";
    const { features } = await query(L.parcels.url, `${zipField} LIKE '${zip}%'`, { geometry: true });
    const keys = features.map((f) => parcelKey(pick(f.attributes, [...FIELDS.parcelId]))).filter((k) => !parcels.has(k));
    const cama = await camaFor(keys);
    ingest(features, cama);
  }
  report.push({ id: "coa_parcels", label: L.parcels.label, url: L.parcels.url, pulledAt, records: parcels.size });
  if (L.cama.url) report.push({ id: "fulton_cama", label: L.cama.label, url: L.cama.url, pulledAt, records: [...parcels.values()].filter((p) => p.provenance?.yearBuilt?.source === "fulton_cama").length });

  // 5. Join everything onto the parcel
  for (const p of parcels.values()) byAddr.set(normAddr(p.address), p);
  for (const [key, b] of byParcel) {
    const p = parcels.get(key);
    if (!p) continue;
    p.permits.push(...b.permits);
    p.codeCases.push(...b.cases);
  }
  let addrMatched = 0;
  for (const o of orphanAddr) {
    const p = [...byAddr.entries()].find(([a]) => o.addr.startsWith(a) && a.length > 6)?.[1];
    if (!p) continue;
    addrMatched++;
    if (o.case) p.codeCases.push(o.case);
    if (o.permit) p.permits.push(o.permit);
  }
  for (const [kind, rows] of Object.entries(lists)) {
    for (const r of rows) {
      const pid = pick(r, [...FIELDS.parcelId]);
      const p = (pid && parcels.get(parcelKey(pid))) || byAddr.get(normAddr(pick(r, [...FIELDS.address])));
      if (p) attachListRow(p, kind, r, pulledAt);
    }
  }

  const props = [...parcels.values()].filter((p) => p.address);
  const market = buildMarket(props, now);
  const out = { version: 1, generatedAt: pulledAt, sinceDays: opt.since, sweptZips: opt.zips, sources: report, market, properties: props };
  await mkdir(dirname(opt.out), { recursive: true });
  await writeFile(opt.out, JSON.stringify(out));

  // Same properties in the Atlanta Deal Intelligence worksheet's import format.
  const intel = analyzeAll(props, market, now);
  const csvRows = intel.map((i) => toDealIntelCsvRow(i.p, { equityPct: i.value.equityPct, yearsOwned: ownershipYears(i.p, now), arv: i.value.arv, rehab: rehabEstimate(i.p, i.engines.distress.score).value }));
  if (csvRows.length) {
    const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const head = Object.keys(csvRows[0]);
    await writeFile(join(dirname(opt.out), "deal-intel-import.csv"), [head.join(","), ...csvRows.map((r) => head.map((h) => q(r[h])).join(","))].join("\n"));
  }

  console.log(`\nWrote ${opt.out}: ${props.length} properties, ${Object.keys(market).length} ZIP market contexts, ${addrMatched} rows matched by address.`);
  for (const r of report) console.log(`  ${r.id.padEnd(20)} ${String(r.records).padStart(7)} records${r.minDate ? `  ${r.minDate.slice(0, 10)} → ${r.maxDate.slice(0, 10)}` : ""}${r.unmapped?.length ? `  (unmapped: ${r.unmapped.join(", ")})` : ""}`);
  console.log("\nTop 15:");
  for (const i of intel.slice(0, 15)) console.log(`  ${String(i.score).padStart(3)}  ${String(i.confidence).padStart(2)}%  ${i.p.address.padEnd(32)} ${i.primarySignal}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
