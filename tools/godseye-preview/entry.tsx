/** Self-contained God's Eye preview: the real Deal Desk + engines on the EXAMPLE data, no server. */
import { createRoot } from "react-dom/client";
import { analyzeAll } from "@/lib/re-intel";
import { demoMarket, demoProperties } from "@/lib/re-intel-demo";
import { DealDesk } from "@/components/realestate/DealDesk";
import { embedTerrain } from "@/components/realestate/GodsEyeMap";
// DealDesk imports @/app/realestate/actions; build.mjs aliases that path to this same shim file.
import { registerIntel, loadLocal, loadBuyers, loadContracts, loadFieldwork } from "./shims/actions";
import { applyFieldwork } from "@/lib/re-field";

import type { MarketContext, PropertyRecord } from "@/lib/re-intel";
import type { FeedSource } from "@/lib/re-desk-store";

declare const __TERRAIN__: Parameters<typeof embedTerrain>[0];
/** Present when build.mjs ran with --data (a real feed output). */
const REAL = (globalThis as unknown as { __GE_DATA__?: { generatedAt: string; sources: FeedSource[]; market: Record<string, MarketContext>; properties: PropertyRecord[]; total: number } }).__GE_DATA__;

embedTerrain(__TERRAIN__);
const now = new Date();
const market = REAL ? REAL.market : demoMarket(now);
const fieldwork = loadFieldwork();
const intel = analyzeAll((REAL ? REAL.properties : demoProperties(now)).map((p) => applyFieldwork(p, fieldwork[p.id])), market, now);
registerIntel(intel);
const local = loadLocal();

createRoot(document.getElementById("root")!).render(
  <DealDesk
    intel={intel}
    initialStates={local.states}
    initialActivity={local.activity}
    initialBuyers={loadBuyers()}
    initialContracts={loadContracts()}
    initialFieldwork={fieldwork}
    meta={
      REAL
        ? { example: false, generatedAt: REAL.generatedAt, sources: REAL.sources, note: `Browser preview of the ${REAL.generatedAt.slice(0, 10)} Atlanta feed: top ${intel.length.toLocaleString()} leads of ${REAL.total.toLocaleString()} parcels. Public records; your clicks stay in this browser.` }
        : {
            example: true,
            generatedAt: now.toISOString(),
            sources: [],
            note: "Browser preview: fictional EXAMPLE properties, your clicks are saved in this browser only, map shows embedded Atlanta terrain.",
          }
    }
    market={market}
    nowIso={now.toISOString()}
    claudeConfigured={false}
    totalProperties={REAL ? REAL.total : intel.length}
  />,
);
