/** Self-contained Capital Desk preview: the real engine + desk, on the live GA infrastructure feed (--data) or EXAMPLE data. */
import { createRoot } from "react-dom/client";
import { analyzeSites } from "@/lib/ci-intel";
import { demoCapital, demoDeals, demoMemories, demoSignals, demoSites } from "@/lib/ci-demo";
import { CapitalDesk } from "@/components/capital/CapitalDesk";
import { embedTerrain } from "@/components/realestate/GodsEyeMap";
import type { InfraFeed } from "@/lib/ci-store";

declare const __TERRAIN__: Parameters<typeof embedTerrain>[0];
/** Present when build.mjs ran with --app capital --data data/public/ga-infra.json. */
const REAL = (globalThis as unknown as { __GE_DATA__?: InfraFeed & { grid?: GeoJSON.FeatureCollection | null } }).__GE_DATA__;

embedTerrain(__TERRAIN__);
const now = new Date();
const root = createRoot(document.getElementById("root")!);
if (REAL) {
  const { sites: raw, grid, ...meta } = REAL;
  root.render(<CapitalDesk sites={analyzeSites(raw, [], [], now)} rawSites={raw} feed={meta} grid={grid ?? null} signals={[]} capital={[]} initialDeals={[]} initialMemories={[]} nowIso={now.toISOString()} example={false} />);
} else {
  const signals = demoSignals(now);
  const capital = demoCapital(now);
  root.render(<CapitalDesk sites={analyzeSites(demoSites(now), signals, capital, now)} signals={signals} capital={capital} initialDeals={demoDeals(now)} initialMemories={demoMemories(now)} nowIso={now.toISOString()} example />);
}
