import { getInventory, getFbListingDrafts, getFbInquiries } from "@/lib/db";
import { computeMessengerGateStatus } from "@/lib/fb-gate";
import { Page, Section, Card, Button, usd } from "@/components/ui";
import { HealthPanel } from "@/components/HealthPanel";
import { draftListing, logInquiry } from "./actions";

export const revalidate = 0;

export default async function FacebookPage() {
  const [inventory, drafts, inquiries] = await Promise.all([getInventory(), getFbListingDrafts(), getFbInquiries()]);
  const localOnly = inventory.filter((i) => i.local_only && !["sold", "shipped", "returned"].includes(i.status));
  const draftedIds = new Set(drafts.map((d) => d.inventory_id));
  const undrafted = localOnly.filter((i) => !draftedIds.has(i.id));
  const gate = computeMessengerGateStatus(inquiries.map((i) => i.created_at));

  return (
    <Page title="Facebook" subtitle="Heavy-item Marketplace drafts (manual posting) + inquiry log.">
      <HealthPanel module="facebook" returnPath="/facebook" />
      <Section title="Draft a Marketplace listing">
        <Card>
          {undrafted.length === 0 ? (
            <p className="text-sm text-muted">No local-only heavy items without a draft yet.</p>
          ) : (
            <form action={draftListing} className="flex gap-2">
              <select name="inventory_id" className="flex-1 rounded-lg border border-elevated px-3 py-2 text-sm" required>
                <option value="">Choose an item…</option>
                {undrafted.map((i) => (
                  <option key={i.id} value={i.id}>{i.description}</option>
                ))}
              </select>
              <Button type="submit">Draft</Button>
            </form>
          )}
        </Card>
      </Section>

      <Section title={`Drafts (${drafts.length}) — post these manually, no API automation`}>
        <div className="space-y-3">
          {drafts.map((d) => (
            <Card key={d.id}>
              <p className="font-semibold text-bone">{d.title}</p>
              {d.price && <p className="text-sm text-status-green">{usd(d.price)}</p>}
              <p className="mt-1 text-xs text-ash">{d.description}</p>
              <p className="mt-1 text-xs text-muted">{d.pickup_terms}</p>
            </Card>
          ))}
        </div>
      </Section>

      <Section title="Inquiry log">
        <Card>
          <form action={logInquiry} className="flex gap-2">
            <input type="text" name="note" placeholder="what did they ask about? (optional)" className="flex-1 rounded-lg border border-elevated px-3 py-2 text-sm" />
            <Button type="submit">+1 inquiry</Button>
          </form>
        </Card>
        <div className="mt-2 space-y-1.5">
          {inquiries.slice(0, 10).map((i) => (
            <div key={i.id} className="flex justify-between text-xs text-ash">
              <span>{i.note ?? "—"}</span>
              <span>{new Date(i.created_at).toLocaleDateString()}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Messenger auto-responder">
        <Card className={gate.eligible ? "border-status-green/40 bg-status-green/10" : ""}>
          <p className="text-sm font-semibold text-bone">{gate.eligible ? "Threshold met" : "Not built — gate-locked"}</p>
          <p className="mt-1 text-xs text-ash">
            Unlocks in the backlog at ≥{gate.threshold} legit inquiries/week for {gate.consecutiveWeeksRequired} consecutive weeks. There is nothing to enable here — this is a status readout, not a switch.
          </p>
          <div className="mt-2 space-y-1">
            {gate.weeks.map((w) => (
              <div key={w.weekStart} className="flex justify-between text-xs">
                <span className="text-ash">week of {w.weekStart}</span>
                <span className={w.count >= gate.threshold ? "font-semibold text-status-green" : "text-muted"}>{w.count}</span>
              </div>
            ))}
          </div>
        </Card>
      </Section>
    </Page>
  );
}
