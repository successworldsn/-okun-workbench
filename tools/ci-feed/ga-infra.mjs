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
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
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

// ─── enrich: FEMA flood zone at each node, nearest interconnection facility ───
const FEMA = process.env.FEMA_URL || "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28";
async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) await fn(items[i++]); }));
}
let floodHits = 0, floodFail = 0;
await pool(sites, 6, async (s) => {
  try {
    const j = await getJson(`${FEMA}/query`, { geometry: `${s.lng},${s.lat}`, geometryType: "esriGeometryPoint", inSR: "4326", spatialRel: "esriSpatialRelIntersects", outFields: "FLD_ZONE,ZONE_SUBTY", returnGeometry: "false" });
    const a = j.features?.[0]?.attributes;
    if (a?.FLD_ZONE) {
      s.floodZone = String(a.FLD_ZONE);
      s.evidence.flood = ev("fema", `Zone ${a.FLD_ZONE}${a.ZONE_SUBTY ? ` (${String(a.ZONE_SUBTY).toLowerCase()})` : ""} at the node point`);
      floodHits++;
    }
  } catch {
    floodFail++;
  }
});
console.log(`FEMA: ${floodHits} nodes inside a mapped zone, ${floodFail} lookups failed`);
sources.push({ id: "fema", label: "FEMA National Flood Hazard Layer (zone at node point)", url: FEMA, records: floodHits, pulledAt });

// PeeringDB: where networks actually interconnect (carrier hotels, data centers). Distance to the
// nearest one is a fiber PROXY, labeled as such; it is not a carrier route.
let facs = [];
try {
  const r = await fetch(`https://www.peeringdb.com/api/fac?country=US&state__in=${STATE},${STATE_NAMES[STATE]}`, { headers: { "user-agent": "godseye-ga-infra/1.0" }, signal: AbortSignal.timeout(60_000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  facs = ((await r.json()).data ?? []).filter((f) => isFinite(Number(f.latitude)) && isFinite(Number(f.longitude)) && f.latitude != null).map((f) => ({ name: f.name, city: f.city, lat: Number(f.latitude), lng: Number(f.longitude), nets: f.net_count ?? 0 }));
} catch (e) {
  console.log(`PeeringDB unavailable (${e.message}); fiber stays unknown.`);
}
if (facs.length) {
  for (const s of sites) {
    const near = facs.reduce((b, f) => { const d = miles(s, f); return d < b.d ? { d, f } : b; }, { d: Infinity, f: null });
    s.fiber = { longHaulMi: Math.round(near.d * 10) / 10, proxy: "an interconnection facility (fiber proxy)" };
    s.evidence.fiber = { source: "estimate", detail: `Nearest: ${near.f.name}, ${near.f.city} (${near.f.nets} networks) per PeeringDB; proxy for fiber, not a route`, observedAt: pulledAt.slice(0, 10) };
  }
  sources.push({ id: "peeringdb", label: `PeeringDB interconnection facilities in ${STATE} (fiber proxy)`, url: "https://www.peeringdb.com/api/fac", records: facs.length, pulledAt });
}
console.log(`PeeringDB: ${facs.length} facilities`);

if (!sites.length) {
  console.error(`No power nodes built (${plantF.length} plants, ${subF.length} substations); keeping the previous file.`);
  if (plantF[0]) console.error("plant fields:", Object.keys(plantF[0].attributes).join(", "));
  process.exit(1);
}
// ─── media: satellite photo of the strongest nodes (Esri World Imagery export) ───
const SAT_DIR = arg("--sat-dir", "public/ci-sat");
const SAT_N = Number(arg("--sat", "90"));
const IMG = process.env.IMAGERY_URL || "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export";
const mwOf = (s) => s.power.onsiteGenerationMw ?? s.power.estimatedMw ?? 0;
const shoot = [...sites].sort((a, b) => (b.existingUse === "power_plant") - (a.existingUse === "power_plant") || mwOf(b) - mwOf(a) || (b.power.substationKv ?? 0) - (a.power.substationKv ?? 0)).slice(0, SAT_N);
// Keep plants first but always include the 500 kV backbone.
for (const s of sites) if (s.power.substationKv >= 500 && !shoot.includes(s) && shoot.length < SAT_N + 30) shoot.push(s);
await mkdir(SAT_DIR, { recursive: true });
const keep = new Set();
let shots = 0;
await pool(shoot, 4, async (s) => {
  const dy = 0.0075, dx = (dy / Math.cos((s.lat * Math.PI) / 180)) * 1.6; // ~1.7 × 1 km, 16:10
  const q = new URLSearchParams({ bbox: [s.lng - dx, s.lat - dy, s.lng + dx, s.lat + dy].join(","), bboxSR: "4326", imageSR: "3857", size: "560,350", format: "jpg", f: "image" });
  try {
    const r = await fetch(`${IMG}?${q}`, { headers: { "user-agent": "godseye-ga-infra/1.0" }, signal: AbortSignal.timeout(60_000) });
    const buf = Buffer.from(await r.arrayBuffer());
    if (!r.ok || buf.length < 4000 || buf[0] !== 0xff) throw new Error(`HTTP ${r.status}, ${buf.length} bytes`);
    const file = `${s.id.replace(/[^A-Za-z0-9_-]/g, "_")}.jpg`;
    await writeFile(`${SAT_DIR}/${file}`, buf);
    keep.add(file);
    s.media = { sat: `/ci-sat/${file}`, credit: "Imagery © Esri, Maxar, Earthstar Geographics" };
    shots++;
  } catch (e) {
    if (!shots) console.log(`imagery: ${e.message}`);
  }
});
for (const f of await readdir(SAT_DIR)) if (!keep.has(f)) await rm(`${SAT_DIR}/${f}`); // drop photos of nodes no longer in the set
console.log(`imagery: ${shots}/${shoot.length} satellite photos`);
if (shots) sources.push({ id: "imagery", label: "Esri World Imagery (satellite photos of top nodes)", url: IMG.replace(/\/export$/, ""), records: shots, pulledAt });

// ─── grid: ≥230 kV lines + state outline for the map (public geometry, rounded) ───
const r3 = (v) => Math.round(v * 1000) / 1000;
const thin = (path) => path.map(([x, y]) => [r3(x), r3(y)]).filter((p, i, a) => i === 0 || p[0] !== a[i - 1][0] || p[1] !== a[i - 1][1]);
const grid = { type: "FeatureCollection", features: lineF.flatMap((f) => (f.geometry?.paths ?? []).map((path) => ({ type: "Feature", properties: { kind: "line", kv: Number(pick(f.attributes, ["VOLTAGE"])) || 0 }, geometry: { type: "LineString", coordinates: thin(path) } }))).filter((f) => f.geometry.coordinates.length > 1) };
try {
  const TIGER = process.env.STATES_URL || "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/0";
  const j = await getJson(`${TIGER}/query`, { where: `STUSAB='${STATE}'`, outFields: "NAME", returnGeometry: "true", outSR: "4326", maxAllowableOffset: "0.01", geometryPrecision: "3" });
  for (const f of j.features ?? []) grid.features.push({ type: "Feature", properties: { kind: "outline" }, geometry: { type: "Polygon", coordinates: f.geometry.rings } });
  console.log(`outline: ${(j.features ?? []).length} feature(s)`);
} catch (e) {
  console.log(`outline unavailable (${e.message})`);
}
await mkdir(dirname(OUT), { recursive: true });
await writeFile(`${dirname(OUT)}/${STATE.toLowerCase()}-grid.json`, JSON.stringify(grid));

const out = { version: 1, state: STATE, generatedAt: pulledAt, sources, counts: { plants: plantF.length, substations: subs.length, lineFeatures: lineF.length, sites: sites.length }, sites };
await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(out));
console.log(`Wrote ${OUT}: ${sites.length} power nodes (${sites.filter((s) => s.existingUse === "power_plant").length} plants ≥50 MW, ${sites.filter((s) => s.existingUse === "substation").length} substations ≥230 kV).`);
