import { getRetainerProspects, getOutreachLog } from "@/lib/db";
import { Page, Section, Card, Button } from "@/components/ui";
import { HealthPanel } from "@/components/HealthPanel";
import { advanceStage, runResearch, draftOutreach, sendOutreach } from "./actions";
import type { RetainerStage } from "@/lib/types";

export const revalidate = 0;

const STAGES: { key: RetainerStage; label: string }[] = [
  { key: "target", label: "Target" },
  { key: "contacted", label: "Contacted" },
  { key: "meeting", label: "Meeting" },
  { key: "proposal", label: "Proposal" },
  { key: "signed", label: "Signed" },
];

export default async function RetainersPage() {
  const [prospects, outreach] = await Promise.all([getRetainerProspects(), getOutreachLog("retainer")]);
  const draftsByProspect = new Map(outreach.filter((o) => o.status === "drafted").map((o) => [o.retainer_prospect_id, o]));

  return (
    <Page title="Retainer Pipeline" subtitle="Target → Contacted → Meeting → Proposal → Signed.">
      <HealthPanel module="retainers" returnPath="/retainers" />
      {STAGES.map(({ key, label }) => {
        const inStage = prospects.filter((p) => p.stage === key);
        if (inStage.length === 0) return null;
        return (
          <Section key={key} title={`${label} (${inStage.length})`}>
            <div className="space-y-3">
              {inStage.map((p) => {
                const draft = draftsByProspect.get(p.id);
                return (
                  <Card key={p.id}>
                    <p className="font-semibold text-bone">{p.name}</p>
                    {p.website && <p className="text-xs text-muted">{p.website}</p>}
                    {p.brief && <p className="mt-1 text-xs text-ash">{p.brief}</p>}
                    {p.suggested_offer && <p className="mt-1 text-xs font-medium text-status-green">{p.suggested_offer}</p>}

                    {!p.brief && (
                      <form action={runResearch} className="mt-2 space-y-1">
                        <input type="hidden" name="id" value={p.id} />
                        <input type="hidden" name="name" value={p.name} />
                        <input type="text" name="notes" placeholder="notes for the researcher (optional)" className="w-full rounded-lg border border-elevated px-2 py-1.5 text-xs" />
                        <Button type="submit" variant="ghost" className="w-full text-xs">Research prospect</Button>
                      </form>
                    )}

                    {draft ? (
                      <Card className="mt-2 border-status-amber/40 bg-status-amber/10">
                        <p className="text-xs text-bone">{draft.message}</p>
                        <form action={sendOutreach} className="mt-1">
                          <input type="hidden" name="outreach_id" value={draft.id} />
                          <input type="hidden" name="prospect_id" value={p.id} />
                          <Button type="submit" variant="ghost" className="w-full text-xs">Mark sent</Button>
                        </form>
                      </Card>
                    ) : (
                      <form action={draftOutreach} className="mt-2">
                        <input type="hidden" name="id" value={p.id} />
                        <input type="hidden" name="name" value={p.name} />
                        <input type="hidden" name="brief" value={p.brief ?? ""} />
                        <Button type="submit" variant="ghost" className="w-full text-xs">Draft outreach</Button>
                      </form>
                    )}

                    {key !== "signed" && (
                      <form action={advanceStage} className="mt-2">
                        <input type="hidden" name="id" value={p.id} />
                        <input type="hidden" name="current_stage" value={p.stage} />
                        <Button type="submit" className="w-full text-xs">Advance stage →</Button>
                      </form>
                    )}
                  </Card>
                );
              })}
            </div>
          </Section>
        );
      })}
    </Page>
  );
}
