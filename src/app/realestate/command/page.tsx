import { analyzeAll } from "@/lib/re-intel";
import { getActivity, getDeskStates, loadIntelData, deskTablesReady, MISSING_TABLES } from "@/lib/re-desk-store";
import { CLAUDE_CONFIGURED } from "@/lib/claude";
import { DealDesk } from "@/components/realestate/DealDesk";

export const dynamic = "force-dynamic";
export const metadata = { title: "God's Eye · Deal Desk" };

/** Client payload cap: the top properties by score (the feed can hold thousands). */
const MAX_ON_DESK = 800;

export default async function GodsEyeCommand() {
  const now = new Date();
  const [data, states, activity, ready] = await Promise.all([loadIntelData(now), getDeskStates(), getActivity(), deskTablesReady()]);
  const all = analyzeAll(data.properties, data.market, now);
  // Anything already in the pipeline stays on the desk even if it scores low.
  const keep = all.filter((i, n) => n < MAX_ON_DESK || states[i.p.id]);
  return (
    <DealDesk
      intel={keep}
      initialStates={states}
      initialActivity={activity}
      meta={{ example: data.example, generatedAt: data.generatedAt, sources: data.sources, note: [data.note, ready ? null : MISSING_TABLES].filter(Boolean).join(" · ") || undefined }}
      market={data.market}
      nowIso={now.toISOString()}
      claudeConfigured={CLAUDE_CONFIGURED}
      totalProperties={all.length}
    />
  );
}
