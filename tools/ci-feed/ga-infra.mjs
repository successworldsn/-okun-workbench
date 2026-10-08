#!/usr/bin/env node
/**
 * Georgia AI-infrastructure feed for the Capital Desk: real power plants and
 * high-voltage substations as "power nodes", each with the distance to the
 * nearest ≥230 kV transmission line and substation. Public infrastructure
 * data only (no people), so the output is safe to commit:
 * data/public/ga-infra.json, read by /capital/command.
 *
 *   node tools/ci-feed/ga-infra.mjs [--state GA] [--out data/public/ga-infra.json]
 *
 * Layers are found by ArcGIS Online search and checked by their fields, so a
 * re-published layer doesn't need a code change; override with
 * PLANTS_URL / SUBSTATIONS_URL / LINES_URL. Runs on GitHub's runners
 * (.github/workflows/ga-infra-feed.yml).
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const args = process.argv.slice(2);
const arg = (f, d) => (args.includes(f) ? args[args.indexOf(f) + 1] : d);
const STATE = arg("--state", "GA");
const OUT = arg("--out", "data/public/ga-infra.json");
const BBOX = { GA: [-85.61, 30.36, -80.84, 35.0] }[STATE];
const STATE_NAMES = { GA: "Georgia" };
const ENV = { geometry: BBOX.join(","), geometryType: "esriGeometryEnvelope", inSR: "4326", spatialRel: "esriSpatialRelIntersects" };
/** The bbox catches neighbors along the border; keep rows whose state field says this state (any spelling). */
const inState = (row) => {
  const v = pick(row, ["State", "STATE", "StateName", "STATE_NAME"]);
  return v == null || [STATE, STATE_NAMES[STATE]].some((x) => norm(x) === norm(v));
};

async function getJson(url, params = {}) {
  const body = new URLSearchParams({ f: "json", ...params });
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(url, { method: "POST", body, headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "godseye-ga-infra/1.0" }, signal: AbortSignal.timeout(90_000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      if (j.error) throw new Error(`${j.error.code}: ${j.error.message}`);
      return j;
    } catch (e) {
      if (i === 3) throw e;
      await new Promise((r) => setTimeout(r, 2000 * 2 ** i));
    }
  }
}

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
const fieldOf = (meta, cands) => (meta.fields ?? []).map((f) => f.name).find((n) => cands.some((c) => norm(c) === norm(n)));
const pick = (row, cands) => {
  for (const c of cands) for (const k of Object.keys(row)) if (norm(k) === norm(c) && row[k] != null && row[k] !== "") return row[k];
  return null;
};

async function queryAll(url, where, extra = {}) {
  const meta = await getJson(url);
  const page = Math.min(meta.maxRecordCount || 1000, 2000);
  const oid = meta.objectIdField || (meta.fields ?? []).find((f) => f.type === "esriFieldTypeOID")?.name;
  const out = [];
  for (let off = 0; ; off += page) {
    const j = await getJson(`${url}/query`, { where, outFields: "*", returnGeometry: "true", outSR: "4326", resultOffset: String(off), resultRecordCount: String(page), ...(oid ? { orderByFields: oid } : {}), ...extra });
    const got = j.features ?? [];
    out.push(...got);
    if (!got.length || (!j.exceededTransferLimit && got.length < page)) break;
  }
  return { meta, features: out };
}

/** Find a layer by search, keep the first whose fields include every required alias group. */
async function findLayer(envName, queries, required, minInState = 1) {
  if (process.env[envName]) return { url: process.env[envName], title: "(env override)" };
  for (const q of queries) {
    const j = await getJson("https://www.arcgis.com/sharing/rest/search", { q: `${q} AND (type:"Feature Service" OR type:"Map Service")`, num: "15", sortField: "numviews", sortOrder: "desc" }).catch(() => ({ results: [] }));
    for (const r of j.results ?? []) {
      if (!r.url) continue;
      const svc = await getJson(r.url).catch(() => null);
      const layers = svc?.layers ?? (svc?.fields ? [{ id: null }] : []);
      for (const l of layers.slice(0, 6)) {
        const lu = l.id == null ? r.url : `${r.url.replace(/\/$/, "")}/${l.id}`;
        const meta = await getJson(lu).catch(() => null);
        if (!meta || !required.every((group) => fieldOf(meta, group))) continue;
        // Regional copies (e.g. one FEMA region) pass the field check but hold nothing here.
        const n = await getJson(`${lu}/query`, { where: "1=1", returnCountOnly: "true", ...ENV }).then((c) => c.count ?? 0).catch(() => 0);
        console.log(`  candidate ${r.title} · ${meta.name}: ${n} features in ${STATE} bbox`);
        if (n >= minInState) return { url: lu, title: `${r.title} · ${meta.name} (owner ${r.owner})` };
      }
    }
  }
  throw new Error(`No layer found for ${envName} (${queries.join(" | ")})`);
}

// ─── geometry ───────────────────────────────────────────────────────────────

const toR = (d) => (d * Math.PI) / 180;
const miles = (a, b) => {
  const h = Math.sin(toR(b.lat - a.lat) / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(toR(b.lng - a.lng) / 2) ** 2;
  return 2 * 3958.8 * Math.asin(Math.sqrt(h));
};
/** Distance (mi) from a point to a polyline, by projecting onto each segment in a local flat frame. */
function pointToPath(p, path) {
  const kx = 69.17 * Math.cos(toR(p.lat)), ky = 69.0;
  let best = Infinity;
  for (let i = 1; i < path.length; i++) {
    const [x1, y1] = [(path[i - 1][0] - p.lng) * kx, (path[i - 1][1] - p.lat) * ky];
    const [x2, y2] = [(path[i][0] - p.lng) * kx, (path[i][1] - p.lat) * ky];
    const dx = x2 - x1, dy = y2 - y1;
    const t = dx || dy ? Math.max(0, Math.min(1, -(x1 * dx + y1 * dy) / (dx * dx + dy * dy))) : 0;
    best = Math.min(best, Math.hypot(x1 + t * dx, y1 + t * dy));
  }
  return best;
}

// ─── main ───────────────────────────────────────────────────────────────────

const now = new Date();
const pulledAt = now.toISOString();
const sources = [];

const plantsL = await findLayer("PLANTS_URL", ['"Power Plants" EIA', "Power Plants"], [["Plant_Code", "PLANT_CODE", "ORISPL"], ["Total_MW", "TOTAL_MW", "Install_MW", "NAMEPLATE", "SUMMER_CAP"]], 100);
const subsL = await findLayer("SUBSTATIONS_URL", ['"Electric Substations" HIFLD', '"Electric Substations"', "Electric Substations"], [["MAX_VOLT"], ["NAME"]], 200);
const linesL = await findLayer("LINES_URL", ['"Electric Power Transmission Lines"', "Transmission Lines"], [["VOLTAGE"], ["VOLT_CLASS", "OWNER", "SUB_1"]], 100);
console.log(`plants: ${plantsL.title}\n  ${plantsL.url}\nsubstations: ${subsL.title}\n  ${subsL.url}\nlines: ${linesL.title}\n  ${linesL.url}`);

const plantF = (await queryAll(plantsL.url, "1=1", ENV)).features.filter((f) => inState(f.attributes));
const sm = await getJson(subsL.url);
const subF = (await queryAll(subsL.url, `${fieldOf(sm, ["MAX_VOLT"])}>=115`, ENV)).features.filter((f) => inState(f.attributes));
const env = { ...ENV, geometryPrecision: "5", maxAllowableOffset: "0.0005" };
const lm = await getJson(linesL.url);
const { features: lineF } = await queryAll(linesL.url, `${fieldOf(lm, ["VOLTAGE"])}>=230`, env);
sources.push({ id: "eia_860", label: plantsL.title, url: plantsL.url, records: plantF.length, pulledAt });
sources.push({ id: "hifld", label: subsL.title, url: subsL.url, records: subF.length, pulledAt });
sources.push({ id: "hifld", label: linesL.title, url: linesL.url, records: lineF.length, pulledAt });
console.log(`${STATE}: ${plantF.length} plants, ${subF.length} substations ≥115 kV, ${lineF.length} line features ≥230 kV`);

const paths = lineF.flatMap((f) => (f.geometry?.paths ?? []).map((path) => ({ path, kv: Number(pick(f.attributes, ["VOLTAGE"])) })));
const nearestLine = (p) => paths.reduce((b, l) => Math.min(b, pointToPath(p, l.path)), Infinity);

const subs = subF
  .map((f) => ({ a: f.attributes, lat: f.geometry?.y, lng: f.geometry?.x }))
  .filter((x) => typeof x.lat === "number" && typeof x.lng === "number")
  .map((x) => ({ id: String(pick(x.a, ["ID", "OBJECTID"])), name: String(pick(x.a, ["NAME"]) ?? "Substation"), county: String(pick(x.a, ["COUNTY"]) ?? "").replace(/ county$/i, ""), kv: Number(pick(x.a, ["MAX_VOLT"])), status: String(pick(x.a, ["STATUS"]) ?? ""), lines: Number(pick(x.a, ["LINES"]) ?? 0), lat: x.lat, lng: x.lng, src: pick(x.a, ["SOURCEDATE", "VAL_DATE", "SOURCE"]) }))
  .filter((x) => !/not in service|retired|proposed/i.test(x.status));

const nearestSub = (p) => subs.reduce((b, s) => {
  const d = miles(p, s);
  return d < b.d ? { d, s } : b;
}, { d: Infinity, s: null });

// Rough deliverable MW by voltage class: a screen, labeled as an estimate everywhere it shows.
const mwByKv = (kv) => (kv >= 500 ? 300 : kv >= 230 ? 150 : kv >= 161 ? 80 : kv >= 115 ? 40 : 10);
const ev = (source, detail) => ({ source, detail, observedAt: pulledAt.slice(0, 10) });

const sites = [];
for (const f of plantF) {
  const a = f.attributes;
  const lat = f.geometry?.y ?? Number(pick(a, ["Latitude", "LATITUDE"]));
  const lng = f.geometry?.x ?? Number(pick(a, ["Longitude", "LONGITUDE"]));
  const mw = Number(pick(a, ["Total_MW", "TOTAL_MW", "Install_MW", "NAMEPLATE", "SUMMER_CAP"]) ?? 0);
  if (!isFinite(lat) || !isFinite(lng) || mw < 50) continue;
  const p = { lat, lng };
  const ns = nearestSub(p);
  const fuel = String(pick(a, ["PrimSource", "PRIMSOURCE", "source_des", "PRIMARY_FUEL"]) ?? "").toLowerCase();
  const code = pick(a, ["Plant_Code", "PLANT_CODE", "ORISPL"]);
  sites.push({
    id: `EIA-${code}`,
    name: `${pick(a, ["Plant_Name", "PLANT_NAME", "NAME"])} (${fuel || "power plant"})`,
    county: String(pick(a, ["County", "COUNTY"]) ?? ns.s?.county ?? ""),
    state: STATE,
    lat,
    lng,
    acres: null,
    zoning: "unknown",
    existingUse: "power_plant",
    owner: pick(a, ["Utility_Na", "UTILITY_NAME", "OPERATOR"]) ?? undefined,
    ownerType: "utility",
    power: { onsiteGenerationMw: Math.round(mw), substationMi: ns.s ? Math.round(ns.d * 10) / 10 : null, substationKv: ns.s?.kv ?? null, transmissionMi: paths.length ? Math.round(nearestLine(p) * 10) / 10 : null, utility: pick(a, ["Utility_Na", "UTILITY_NAME"]) ?? undefined },
    fiber: {},
    water: {},
    evidence: { generation: ev("eia_860", `${Math.round(mw)} MW ${fuel} (EIA-860)`), power: ev("hifld", ns.s ? `${ns.s.name} ${ns.s.kv} kV at ${ns.d.toFixed(1)} mi` : "No substation found nearby") },
    tags: { fuel, coal: /coal/.test(fuel) },
  });
}
for (const s of subs.filter((x) => x.kv >= 230)) {
  const p = { lat: s.lat, lng: s.lng };
  sites.push({
    id: `SUB-${s.id}`,
    name: `${s.name} ${s.kv} kV substation area`,
    county: s.county,
    state: STATE,
    lat: s.lat,
    lng: s.lng,
    acres: null,
    zoning: "unknown",
    existingUse: "substation",
    power: { estimatedMw: mwByKv(s.kv), substationMi: 0, substationKv: s.kv, transmissionMi: paths.length ? Math.round(nearestLine(p) * 10) / 10 : null },
    fiber: {},
    water: {},
    evidence: { power: ev("hifld", `${s.kv} kV substation, ${s.lines || "?"} lines in (MW is a voltage-class estimate)`) },
  });
}

if (!sites.length) {
  console.error(`No power nodes built (${plantF.length} plants, ${subF.length} substations); keeping the previous file.`);
  if (plantF[0]) console.error("plant fields:", Object.keys(plantF[0].attributes).join(", "));
  process.exit(1);
}
const out = { version: 1, state: STATE, generatedAt: pulledAt, sources, counts: { plants: plantF.length, substations: subs.length, lineFeatures: lineF.length, sites: sites.length }, sites };
await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(out));
console.log(`Wrote ${OUT}: ${sites.length} power nodes (${sites.filter((s) => s.existingUse === "power_plant").length} plants ≥50 MW, ${sites.filter((s) => s.existingUse === "substation").length} substations ≥230 kV).`);
