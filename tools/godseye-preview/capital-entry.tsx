/** Self-contained Capital Desk preview: the real engine + desk on EXAMPLE data, no server. */
import { createRoot } from "react-dom/client";
import { analyzeSites } from "@/lib/ci-intel";
import { demoCapital, demoDeals, demoMemories, demoSignals, demoSites } from "@/lib/ci-demo";
import { CapitalDesk } from "@/components/capital/CapitalDesk";
import { embedTerrain } from "@/components/realestate/GodsEyeMap";

declare const __TERRAIN__: Parameters<typeof embedTerrain>[0];

embedTerrain(__TERRAIN__);
const now = new Date();
const signals = demoSignals(now);
const capital = demoCapital(now);
const sites = analyzeSites(demoSites(now), signals, capital, now);

createRoot(document.getElementById("root")!).render(
  <CapitalDesk sites={sites} signals={signals} capital={capital} initialDeals={demoDeals(now)} initialMemories={demoMemories(now)} nowIso={now.toISOString()} example />,
);
