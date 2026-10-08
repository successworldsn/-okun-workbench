/** Self-contained God's Eye preview: the real Deal Desk + engines on the EXAMPLE data, no server. */
import { createRoot } from "react-dom/client";
import { analyzeAll } from "@/lib/re-intel";
import { demoMarket, demoProperties } from "@/lib/re-intel-demo";
import { DealDesk } from "@/components/realestate/DealDesk";
import { embedTerrain } from "@/components/realestate/GodsEyeMap";
// DealDesk imports @/app/realestate/actions; build.mjs aliases that path to this same shim file.
import { registerIntel, loadLocal } from "./shims/actions";

declare const __TERRAIN__: Parameters<typeof embedTerrain>[0];

embedTerrain(__TERRAIN__);
const now = new Date();
const market = demoMarket(now);
const intel = analyzeAll(demoProperties(now), market, now);
registerIntel(intel);
const local = loadLocal();

createRoot(document.getElementById("root")!).render(
  <DealDesk
    intel={intel}
    initialStates={local.states}
    initialActivity={local.activity}
    meta={{
      example: true,
      generatedAt: now.toISOString(),
      sources: [],
      note: "Browser preview: fictional EXAMPLE properties, your clicks are saved in this browser only, map shows embedded Atlanta terrain.",
    }}
    market={market}
    nowIso={now.toISOString()}
    claudeConfigured={false}
    totalProperties={intel.length}
  />,
);
