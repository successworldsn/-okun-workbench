import { getOpenDeals, getOutreachLog } from "@/lib/db";
import { Page, Section, Card, Button } from "@/components/ui";
import { toggleChecklistItem, draftBlast, sendBlast } from "./actions";

export const revalidate = 0;

const daysLeft = (deadline: string) => Math.ceil((new Date(deadline).getTime() - Date.now()) / 86_400_000);

export default async function DealsPage() {
  const deals = await getOpenDeals();
  const outreach = await getOutreachLog("deal_buyer");

  return (
    <Page title="Deal Tracker" subtitle="Checklist, countdown, buyer outreach.">
      {deals.length === 0 && <p className="text-sm text-muted">No open deals.</p>}
      {deals.map((deal) => {
        const left = daysLeft(deal.deadline);
        const dealOutreach = outreach.filter((o) => o.deal_id === deal.id);
        const drafts = dealOutreach.filter((o) => o.status === "drafted");
        const sent = dealOutreach.filter((o) => o.status === "sent");

        return (
          <div key={deal.id}>
            <Section title={deal.name}>
              <Card className={left < 7 ? "border-status-red/40 bg-status-red/10" : ""}>
                <p className={`text-2xl font-bold ${left < 7 ? "text-status-red" : "text-bone"}`}>
                  {left} {left === 1 ? "day" : "days"} left
                </p>
                <p className="text-xs text-ash">closes {new Date(deal.deadline).toLocaleDateString()}</p>
              </Card>
            </Section>

            <Section title="Checklist">
              <div className="space-y-1.5">
                {deal.checklist.map((item, i) => (
                  <form key={i} action={toggleChecklistItem}>
                    <input type="hidden" name="deal_id" value={deal.id} />
                    <input type="hidden" name="index" value={i} />
                    <button type="submit" className="flex w-full items-center gap-2 rounded-lg border border-elevated bg-surface px-3 py-2 text-left text-sm">
                      <span className={`flex h-4 w-4 items-center justify-center rounded border ${item.done ? "border-status-green bg-status-green text-white" : "border-elevated"}`}>
                        {item.done && "✓"}
                      </span>
                      <span className={item.done ? "text-muted line-through" : "text-bone"}>{item.label}</span>
                    </button>
                  </form>
                ))}
              </div>
            </Section>

            <Section title="Buyer outreach">
              <Card>
                <form action={draftBlast} className="space-y-2">
                  <input type="hidden" name="deal_id" value={deal.id} />
                  <input type="hidden" name="deal_name" value={deal.name} />
                  <input type="text" name="details" placeholder="address/area, price point, ARV..." className="w-full rounded-lg border border-elevated px-3 py-2 text-sm" />
                  <Button type="submit" variant="ghost" className="w-full">Draft buyer blast</Button>
                </form>
              </Card>

              {drafts.length > 0 && (
                <div className="mt-2 space-y-2">
                  {drafts.map((o) => (
                    <Card key={o.id} className="border-status-amber/40 bg-status-amber/10">
                      <p className="text-xs text-bone">{o.message}</p>
                      <form action={sendBlast} className="mt-1">
                        <input type="hidden" name="outreach_id" value={o.id} />
                        <Button type="submit" variant="ghost" className="w-full text-xs">Mark sent</Button>
                      </form>
                    </Card>
                  ))}
                </div>
              )}

              {sent.length > 0 && (
                <div className="mt-2 space-y-2">
                  {sent.map((o) => (
                    <Card key={o.id} className="flex items-center justify-between">
                      <p className="text-xs text-ash">{o.message}</p>
                      <span className="text-[11px] text-muted">sent {new Date(o.sent_at!).toLocaleDateString()}</span>
                    </Card>
                  ))}
                </div>
              )}
            </Section>
          </div>
        );
      })}
    </Page>
  );
}
