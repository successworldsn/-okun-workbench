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
 *        --tax lists/tax.csv --foreclosure lists/notices.csv --probate lists/estates.csv \
 *        --deeds lists/deed-index.csv --atl311 lists/atl311.csv --county dekalb:30032,30034 \
 *        --safmr lists/hud-safmr.csv
 *
 * Rents: HUD Small Area FMR (the ZIP sheet from huduser.gov, saved as CSV) by
 * bedroom count, cross-checked with Census ACS median rent. Census ACS also
 * gives 5-year population / income / rent growth per ZIP (CENSUS_API_KEY
 * optional; --acs-year, default 2024; --no-census to skip).
 *
 * Enrichment on every parcel pulled: FEMA flood zone (NFHL), Opportunity Zone
 * tract, distance to the nearest MARTA rail station (GTFS). Deeds + security
 * deeds come from a clerk's index export (GSCCCA or a records request); ATL311
 * from its layer if configured, or a CSV export.
 *
 * Layer URLs live in tools/atlanta-intel/sources.json (or env ATL_<KEY>_URL).
 * Run it from a machine whose network can reach gis.atlantaga.gov and
 * services*.arcgis.com. Needs Node >= 22.18 (imports the engine's TypeScript
 * directly, like `npm test`).
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { inflateRawSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  mapPermitRow, mapCodeRow, mapParcel, parcelKey, attachListRow, buildMarket, toDealIntelCsvRow, unmappedFields, pick, FIELDS,
  mapDeedRow, attachDeeds, map311Row, toPoly, assignFlood, assignOpportunityZones, parseGtfsStations, assignTransit,
  mapSafmr, attachSafmr, parseAcs, attachAcs,
} from "../../src/lib/re-feed-map.ts";
import { analyzeAll, ownershipYears, rehabEstimate } from "../../src/lib/re-intel.ts";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");

function args() {
  const a = process.argv.slice(2);
  const all = (flag) => a.flatMap((x, i) => (x === flag ? [a[i + 1]] : []));
  const one = (flag, d = null) => all(flag)[0] ?? d;
  return {
    discover: a.includes("--discover"),
    searches: all("--search"),
    inspects: all("--inspect"),
    since: Number(one("--since", "730")),
    zips: all("--zip"),
    tax: one("--tax"),
    foreclosure: one("--foreclosure"),
    probate: one("--probate"),
    out: one("--out", join(root, "data", "atlanta-intel.json")),
    maxParcels: Number(one("--max-parcels", "5000")),
    deeds: one("--deeds"),
    atl311: one("--atl311"),
    gtfs: one("--gtfs"),
    counties: all("--county").map((c) => { const [name, zips = ""] = c.split(":"); return { name: name.toLowerCase(), zips: zips.split(",").filter(Boolean) }; }),
    skipEnrich: a.includes("--no-enrich"),
    safmr: one("--safmr"),
    acsYear: Number(one("--acs-year", "2024")),
    noCensus: a.includes("--no-census"),
  };
}

async function loadSources() {
  const cfg = JSON.parse(await readFile(join(here, "sources.json"), "utf8"));
  for (const [k, v] of Object.entries(cfg.layers)) {
    const env = process.env[`ATL_${k.toUpperCase()}_URL`];
    if (env) v.url = env;
  }
  for (const [k, v] of Object.entries(cfg.counties ?? {})) {
    const env = process.env[`COUNTY_${k.toUpperCase()}_URL`];
    if (env) v.url = env;
  }
  return cfg;
}

/** Minimal .zip reader (central directory + deflate) — enough for a GTFS feed. */
function unzip(buf) {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error("not a zip");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = {};
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(p + 10), size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28), extra = buf.readUInt16LE(p + 30), comment = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + size);
    files[name] = method === 8 ? inflateRawSync(raw) : raw;
    p += 46 + nameLen + extra + comment;
  }
  return files;
}

async function loadStations(src) {
  if (/\.txt$/i.test(src)) return parseGtfsStations(await readFile(src, "utf8"));
  const buf = /^https?:/.test(src) ? Buffer.from(await (await fetch(src)).arrayBuffer()) : await readFile(src);
  const stops = Object.entries(unzip(buf)).find(([n]) => /(^|\/)stops\.txt$/.test(n));
  if (!stops) throw new Error("no stops.txt in GTFS zip");
  return parseGtfsStations(stops[1].toString("utf8"));
}

/** Polygons covering the parcels' bounding box, fetched in ~0.05° tiles. */
async function polygonsOver(layerUrl, props, outFields) {
  const pts = props.filter((p) => p.lat != null && p.lng != null);
  if (!pts.length) return [];
  const xs = pts.map((p) => p.lng), ys = pts.map((p) => p.lat);
  const step = 0.05, seen = new Set(), out = [];
  for (let x = Math.min(...xs); x <= Math.max(...xs); x += step)
    for (let y = Math.min(...ys); y <= Math.max(...ys); y += step) {
      if (!pts.some((p) => p.lng >= x && p.lng <= x + step && p.lat >= y && p.lat <= y + step)) continue;
      const feats = [];
      for (let offset = 0; ; offset += 500) {
        const j = await getJson(`${layerUrl}/query`, {
          where: "1=1", geometry: `${x},${y},${x + step},${y + step}`, geometryType: "esriGeometryEnvelope", inSR: "4326",
          spatialRel: "esriSpatialRelIntersects", outFields, returnGeometry: "true", outSR: "4326",
          resultOffset: String(offset), resultRecordCount: "500",
        });
        feats.push(...(j.features ?? []));
        if (!j.exceededTransferLimit && (j.features ?? []).length < 500) break;
      }
      for (const f of feats) {
        const id = JSON.stringify(f.attributes);
        if (seen.has(id)) continue;
        seen.add(id);
        const g = toPoly(f);
        if (g) out.push(g);
      }
    }
  return out;
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

/** One line per sublayer of a service: id, name, geometry, record count, and the date range of its first date field. */
async function describeService(url) {
  const out = [];
  try {
    const svc = await getJson(url, {});
    const layers = svc.layers ?? (svc.fields ? [{ id: null, name: svc.name }] : []);
    for (const l of layers.slice(0, 12)) {
      const lu = l.id == null ? url : `${url.replace(/\/$/, "")}/${l.id}`;
      try {
        const meta = await getJson(lu, {});
        const cnt = await getJson(`${lu}/query`, { where: "1=1", returnCountOnly: "true" }).catch(() => ({}));
        const df = (meta.fields ?? []).find((f) => f.type === "esriFieldTypeDate");
        let range = "";
        if (df) {
          const st = await getJson(`${lu}/query`, { where: "1=1", outStatistics: JSON.stringify([{ statisticType: "min", onStatisticField: df.name, outStatisticFieldName: "mn" }, { statisticType: "max", onStatisticField: df.name, outStatisticFieldName: "mx" }]) }).catch(() => null);
          const a = st?.features?.[0]?.attributes;
          if (a) range = ` · ${df.name} ${new Date(a.mn ?? a.MN).toISOString().slice(0, 10)} → ${new Date(a.mx ?? a.MX).toISOString().slice(0, 10)}`;
        }
        out.push(`    ${lu}\n      "${meta.name}" · ${meta.geometryType ?? "table"} · ${cnt.count ?? "?"} records${range}\n      fields: ${(meta.fields ?? []).map((f) => f.name).slice(0, 40).join(", ")}`);
      } catch (e) {
        out.push(`    ${lu}  (unreadable: ${e.message})`);
      }
    }
  } catch (e) {
    out.push(`    ${url}  (unreadable: ${e.message})`);
  }
  return out;
}

/** City of Atlanta's own ArcGIS servers: list services whose names look relevant. */
async function crawlCity(keywords) {
  const roots = ["https://gis.atlantaga.gov/dpcd/rest/services", "https://gis.atlantaga.gov/gisweb/rest/services", "https://gis.atlantaga.gov/arcgis/rest/services"];
  const hits = [];
  for (const root of roots) {
    try {
      const top = await getJson(root, {});
      const folders = [null, ...(top.folders ?? [])];
      for (const f of folders) {
        const j = f ? await getJson(`${root}/${f}`, {}).catch(() => ({})) : top;
        for (const sv of j.services ?? []) if (keywords.test(sv.name)) hits.push(`${root}/${sv.name}/${sv.type}`);
      }
    } catch (e) {
      console.log(`  ${root}: ${e.message}`);
    }
  }
  return hits;
}

/** Free-text ArcGIS Online searches, then sample rows from specific layers (owner / mailing fields masked). */
async function searchAndInspect(searches, inspects) {
  for (const q of searches) {
    console.log(`\n== search: ${q} ==`);
    try {
      const j = await getJson("https://www.arcgis.com/sharing/rest/search", { q: `${q} AND (type:"Feature Service" OR type:"Map Service")`, num: "10", sortField: "modified", sortOrder: "desc" });
      for (const r of j.results ?? []) {
        if (!r.url) continue;
        console.log(`  candidate: "${r.title}" · owner ${r.owner} · modified ${new Date(r.modified).toISOString().slice(0, 10)}`);
        (await describeService(r.url)).slice(0, 3).forEach((l) => console.log(l));
      }
    } catch (e) {
      console.log(`  failed: ${e.message}`);
    }
  }
  const MASK = /OWN|PSTL|MAIL|GRANTEE|GRANTOR|PHONE|EMAIL/i;
  for (const url of inspects) {
    console.log(`\n== inspect: ${url} ==`);
    try {
      const meta = await getJson(url, {});
      console.log(`  "${meta.name}" · maxRecordCount ${meta.maxRecordCount} · fields: ${(meta.fields ?? []).map((f) => `${f.name}:${String(f.type).replace("esriFieldType", "")}`).join(", ")}`);
      const df = (meta.fields ?? []).find((f) => f.type === "esriFieldTypeDate");
      const j = await getJson(`${url}/query`, { where: "1=1", outFields: "*", returnGeometry: "false", resultRecordCount: "3", ...(df ? { orderByFields: `${df.name} DESC` } : {}) });
      for (const f of j.features ?? []) {
        const row = Object.fromEntries(Object.entries(f.attributes).filter(([, v]) => v != null && v !== "").map(([k, v]) => [k, MASK.test(k) ? "•••" : typeof v === "number" && v > 9e11 ? new Date(v).toISOString().slice(0, 10) : v]));
        console.log(`  sample: ${JSON.stringify(row).slice(0, 1500)}`);
      }
    } catch (e) {
      console.log(`  failed: ${e.message}`);
    }
  }
}

async function discover(cfg) {
  const KEY = /parcel|tax|permit|code|enforce|complain|tolemi|zoning|311|opportun|flood|cama|property/i;
  console.log("== City of Atlanta ArcGIS services matching parcel/permit/code/zoning ==");
  for (const u of await crawlCity(KEY)) {
    console.log(`  ${u}`);
    (await describeService(u)).forEach((l) => console.log(l));
  }
  const all = [...Object.entries(cfg.layers), ...Object.entries(cfg.counties ?? {}).map(([k, v]) => [`county:${k}`, { ...v, label: `${v.county} County parcels` }])];
  for (const [key, layer] of all) {
    console.log(`\n== ${key}  (${layer.label}) ==`);
    console.log(`  configured: ${layer.url ?? "— not set —"}`);
    if (layer.url) (await describeService(layer.url.replace(/\/\d+$/, ""))).forEach((l) => console.log(l));
    const seen = new Set();
    for (const title of layer.search ?? []) {
      try {
        const j = await getJson("https://www.arcgis.com/sharing/rest/search", { q: `${title} AND (type:"Feature Service" OR type:"Map Service")${key.startsWith("county:") ? "" : " AND (atlanta OR georgia OR fulton)"}`, num: "6" });
        for (const r of j.results ?? []) {
          if (!r.url || seen.has(r.url)) continue;
          seen.add(r.url);
          console.log(`  candidate: "${r.title}" · owner ${r.owner} · modified ${new Date(r.modified).toISOString().slice(0, 10)}`);
          (await describeService(r.url)).slice(0, 4).forEach((l) => console.log(l));
        }
      } catch (e) {
        console.log(`  search "${title}" failed: ${e.message}`);
      }
    }
  }
  console.log("\nPut the right layer URL (…/FeatureServer/<n> or …/MapServer/<n>) into tools/atlanta-intel/sources.json.");
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
  if (opt.searches.length || opt.inspects.length) return searchAndInspect(opt.searches, opt.inspects);
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
  // Layers disagree on spacing/dashes, and hosted layers can't REPLACE() in SQL:
  // keep each parcel id exactly as a layer wrote it, keyed by its normalized form.
  const rawIds = new Map();
  const seeRaw = (v) => {
    const k = parcelKey(v);
    if (k) rawIds.set(k, new Set([...(rawIds.get(k) ?? []), String(v).trim()]));
    return k;
  };
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
      const key = r.parcel ? seeRaw(r.parcel) : null;
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
      const key = r.parcel ? seeRaw(r.parcel) : null;
      if (key) {
        bucket(key).cases.push(r.case);
        if (r.case.open || r.case.vacant || r.case.boarded) touched.add(key);
      } else if (r.address) orphanAddr.push({ addr: normAddr(r.address), case: r.case });
    }
    const ds = features.map((f) => mapCodeRow(f.attributes).case.openedAt).filter(Boolean).sort();
    report.push({ id: "code_history", label: L.code_history.label, url: L.code_history.url, pulledAt, records: features.length, minDate: ds[0] ?? null, maxDate: ds.at(-1) ?? null, unmapped: unmappedFields(features[0]?.attributes, ["parcelId", "caseType", "caseOpened"]) });
  }

  // 2b. ATL311 service requests (layer and/or CSV export) — a second, independent distress signal
  {
    const rows = [];
    if (L.atl311?.url) {
      const meta = await getJson(L.atl311.url, {});
      const df = fieldIn(meta, ["CREATED_DATE", "OPENED", "OPEN_DATE", "DATE_CREATED", "REQUESTED_DATE", "CreatedDate"]);
      const { features } = await query(L.atl311.url, df ? `${df} >= ${sqlDate(new Date(now.getTime() - 548 * 86_400_000))}` : "1=1");
      rows.push(...features.map((f) => f.attributes));
    }
    rows.push(...(await readList(opt.atl311)));
    let kept = 0;
    for (const r of rows) {
      const m = map311Row(r);
      if (!m) continue;
      kept++;
      const key = m.parcel ? seeRaw(m.parcel) : null;
      if (key) { bucket(key).cases.push(m.case); touched.add(key); }
      else if (m.address) orphanAddr.push({ addr: normAddr(m.address), case: m.case });
    }
    if (rows.length) {
      const ds = rows.map((r) => map311Row(r)?.case.openedAt).filter(Boolean).sort();
      report.push({ id: "atl311", label: "ATL311 service requests (property condition only)", url: L.atl311?.url ?? opt.atl311, pulledAt, records: kept, minDate: ds[0] ?? null, maxDate: ds.at(-1) ?? null });
    }
  }

  // 3. Lists from records requests
  const lists = { tax: await readList(opt.tax), foreclosure: await readList(opt.foreclosure), probate: await readList(opt.probate) };
  for (const [kind, rows] of Object.entries(lists)) {
    for (const r of rows) {
      const pid = pick(r, [...FIELDS.parcelId]);
      if (pid) touched.add(seeRaw(pid));
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
  const sqlList = (keys) => [...new Set(keys.flatMap((k) => [...(rawIds.get(k) ?? [k])]))].map((v) => `'${v.replace(/'/g, "''")}'`).join(",");
  let camaAsked = 0, camaFound = 0;
  const camaFor = async (keys) => {
    const m = new Map();
    if (!L.cama.url || !keys.length) return m;
    const camaId = L.cama.idField || idField;
    for (let i = 0; i < keys.length; i += 150) {
      const { features } = await query(L.cama.url, `${camaId} IN (${sqlList(keys.slice(i, i + 150))})`);
      features.forEach((f) => m.set(parcelKey(pick(f.attributes, [...FIELDS.parcelId])), f.attributes));
    }
    camaAsked += keys.length;
    camaFound += m.size;
    return m;
  };
  const touchedList = [...touched].slice(0, opt.maxParcels);
  for (let i = 0; i < touchedList.length; i += 150) {
    const chunk = touchedList.slice(i, i + 150);
    const { features } = await query(L.parcels.url, `${idField} IN (${sqlList(chunk)})`, { geometry: true });
    features.forEach((f) => seeRaw(pick(f.attributes, [...FIELDS.parcelId])));
    ingest(features, await camaFor(chunk));
  }
  for (const zip of opt.zips) {
    const zipField = L.parcels.zipField || "SITEZIP";
    const { features } = await query(L.parcels.url, `${zipField} LIKE '${zip}%'`, { geometry: true });
    const keys = features.map((f) => seeRaw(pick(f.attributes, [...FIELDS.parcelId]))).filter((k) => k && !parcels.has(k));
    console.log(`  ZIP ${zip}: ${features.length} parcels`);
    const cama = await camaFor(keys);
    ingest(features, cama);
  }
  if (L.cama.url) console.log(`  CAMA matched ${camaFound} of ${camaAsked} parcels`);
  report.push({ id: "coa_parcels", label: L.parcels.label, url: L.parcels.url, pulledAt, records: parcels.size });

  // 4b. Other metro counties: same mapper, each county's own parcel layer, swept by ZIP
  for (const c of opt.counties) {
    const layer = cfg.counties?.[c.name];
    if (!layer?.url) { console.error(`No parcel layer URL for county "${c.name}" (sources.json → counties).`); continue; }
    let n = 0;
    for (const zip of c.zips) {
      const { features } = await query(layer.url, `${layer.zipField || "ZIP"} LIKE '${zip}%'`, { geometry: true });
      for (const f of features) {
        const key = parcelKey(pick(f.attributes, [...FIELDS.parcelId]));
        if (!key || parcels.has(key)) continue;
        parcels.set(key, mapParcel(f.attributes, f.geometry, undefined, pulledAt, { county: layer.county, source: "county_parcels" }));
        n++;
      }
    }
    report.push({ id: "county_parcels", label: `${layer.county} County parcels (${c.zips.join(", ")})`, url: layer.url, pulledAt, records: n });
  }
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

  // 6. Deed + security-deed index → transfers, open mortgages, satisfactions
  if (opt.deeds) {
    const rows = (await readList(opt.deeds)).map(mapDeedRow);
    const groups = new Map();
    for (const r of rows) {
      const p = (r.parcel && parcels.get(parcelKey(r.parcel))) || (r.address && byAddr.get(normAddr(r.address)));
      if (p) groups.set(p, [...(groups.get(p) ?? []), r]);
    }
    for (const [p, rs] of groups) attachDeeds(p, rs, pulledAt);
    const ds = rows.map((r) => r.date).filter(Boolean).sort();
    report.push({ id: "deeds", label: "Deed + security-deed index", url: opt.deeds, pulledAt, records: rows.length, minDate: ds[0] ?? null, maxDate: ds.at(-1) ?? null, matched: groups.size });
  }

  // 7. Free spatial enrichment: FEMA flood zones, Opportunity Zones, MARTA rail
  if (!opt.skipEnrich) {
    const enrich = async (id, label, url, fn) => {
      if (!url) return;
      try { const n = await fn(); report.push({ id, label, url, pulledAt, records: n }); }
      catch (e) { console.error(`${label}: ${e.message}`); report.push({ id, label, url, pulledAt, records: 0, error: e.message }); }
    };
    await enrich("flood", L.flood.label, L.flood?.url, async () => { const g = await polygonsOver(L.flood.url, props, "FLD_ZONE,ZONE_SUBTY,SFHA_TF"); assignFlood(props, g, pulledAt); return g.length; });
    await enrich("opportunity_zone", L.opportunity_zones.label, L.opportunity_zones?.url, async () => { const g = await polygonsOver(L.opportunity_zones.url, props, "*"); assignOpportunityZones(props, g, pulledAt); return g.length; });
    await enrich("transit", L.marta_gtfs.label, opt.gtfs ?? L.marta_gtfs?.url, async () => { const st = await loadStations(opt.gtfs ?? L.marta_gtfs.url); assignTransit(props, st); return st.length; });
  }
  const market = buildMarket(props, now);

  // 8. Rents + growth: HUD SAFMR (by bedrooms) and Census ACS (cross-check + 5-year trends)
  if (opt.safmr) {
    const rows = await readList(opt.safmr);
    attachSafmr(props, mapSafmr(rows), pulledAt);
    report.push({ id: "hud_safmr", label: "HUD Small Area Fair Market Rents", url: opt.safmr, pulledAt, records: rows.length });
  }
  if (!opt.noCensus) {
    const zips = [...new Set(props.map((p) => p.zip).filter(Boolean))];
    const acs = async (year) => {
      const key = process.env.CENSUS_API_KEY ? `&key=${process.env.CENSUS_API_KEY}` : "";
      const base = process.env.CENSUS_API_BASE || "https://api.census.gov";
      const res = await fetch(`${base}/data/${year}/acs/acs5?get=B25064_001E,B01003_001E,B19013_001E&for=zip%20code%20tabulation%20area:${zips.join(",")}${key}`);
      if (!res.ok) throw new Error(`Census ${year}: HTTP ${res.status}`);
      return parseAcs(await res.json());
    };
    try {
      let year = opt.acsYear, latest;
      try { latest = await acs(year); } catch { year -= 1; latest = await acs(year); }
      const earlier = await acs(year - 5).catch(() => new Map());
      attachAcs(props, market, latest, earlier, year, `${year + 1}-12-01T00:00:00.000Z`);
      report.push({ id: "census_acs", label: `Census ACS ${year} 5-year (vs ${year - 5})`, url: "api.census.gov", pulledAt, records: latest.size });
    } catch (e) {
      console.error(`Census ACS skipped: ${e.message}`);
    }
  }
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
