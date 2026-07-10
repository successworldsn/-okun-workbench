import { getSsfCatalog, getSsfListings, getSsfGates } from "@/lib/db";
import { pricingAge } from "@/lib/ssf-catalog-csv";
import { Page, Section, Card, Badge, Button, usd } from "@/components/ui";
import { HealthPanel } from "@/components/HealthPanel";
import { draftFromCatalog, approveAndPublish, rejectListing } from "./actions";
import { EBAY_CONFIGURED } from "@/lib/ebay";

export const revalidate = 0;

export default async function SsfListingsPage() {
  const [catalog, pending, live, ended, gates] = await Promise.all([
    getSsfCatalog(),
    getSsfListings("pending_approval"),
    getSsfListings("live"),
    getSsfListings("ended"),
    getSsfGates(),
  ]);
  const activeCount = pending.length + live.length;
  const draftable = catalog.filter((c) => !pricingAge(c.last_updated).blocked);

  return (
    <Page title="SSF Listings" subtitle="Draft → VeRO guard → human approve → publish.">
      <HealthPanel module="ssf" returnPath="/ssf/listings" />
      <HealthPanel module="stock_feed_guard" returnPath="/ssf/listings" />
      <Section title="Autonomy status">
        <Card className={gates.locked_until && new Date(gates.locked_until) > new Date() ? "border-status-red/40 bg-status-red/10" : ""}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-bone">Tier {gates.tier}</p>
              <p className="text-xs text-ash">
                {activeCount}/{gates.active_listing_cap} active · approval: {gates.approval_mode.replace("_", " ")}
              </p>
            </div>
            {!EBAY_CONFIGURED && <span className="rounded-full bg-status-amber/15 px-2.5 py-1 text-[11px] font-semibold text-status-amber">eBay API not configured</span>}
          </div>
          {gates.locked_until && new Date(gates.locked_until) > new Date() && (
            <p className="mt-2 text-xs font-semibold text-status-red">Locked until {new Date(gates.locked_until).toLocaleDateString()} — {gates.lock_reason}</p>
          )}
        </Card>
      </Section>

      <Section title="Draft a listing">
        <Card>
          <form action={draftFromCatalog} className="flex gap-2">
            <select name="ssf_catalog_id" className="flex-1 rounded-lg border border-elevated px-3 py-2 text-sm" required>
              <option value="">Choose a SKU…</option>
              {draftable.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.ssf_part_number} — {c.description}
                </option>
              ))}
            </select>
            <Button type="submit">Draft</Button>
          </form>
          <p className="mt-2 text-xs text-ash">Stale-priced SKUs (&gt;14d) are excluded — refresh the catalog upload first.</p>
        </Card>
      </Section>

      <Section title={`Pending approval (${pending.length})`}>
        <div className="space-y-2">
          {pending.length === 0 && <p className="text-sm text-muted">Nothing queued.</p>}
          {pending.map((l) => (
            <Card key={l.id} className={l.vero_flagged ? "border-status-amber/40 bg-status-amber/10" : ""}>
              <p className="font-semibold text-bone">{l.title}</p>
              <p className="text-xs text-ash">
                {l.ssf_part_number} · cost {usd(l.our_cost)} · list {usd(l.list_price)}
              </p>
              {l.vero_flagged && <p className="mt-1 text-xs font-medium text-status-amber">⚠ {l.vero_flag_reason}</p>}
              <div className="mt-2 flex gap-2">
                <form action={approveAndPublish} className="flex-1">
                  <input type="hidden" name="id" value={l.id} />
                  <Button type="submit" className="w-full">Approve &amp; Publish</Button>
                </form>
                <form action={rejectListing} className="flex-1">
                  <input type="hidden" name="id" value={l.id} />
                  <Button type="submit" variant="danger" className="w-full">Reject</Button>
                </form>
              </div>
            </Card>
          ))}
        </div>
      </Section>

      {live.length > 0 && (
        <Section title={`Live (${live.length})`}>
          <div className="space-y-2">
            {live.map((l) => (
              <Card key={l.id} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-bone">{l.title}</p>
                  <p className="text-xs text-ash">{l.ssf_part_number} · {usd(l.list_price)}</p>
                </div>
                <Badge value="listed" />
              </Card>
            ))}
          </div>
        </Section>
      )}

      {ended.length > 0 && (
        <Section title={`Ended (${ended.length})`}>
          <div className="space-y-2">
            {ended.map((l) => (
              <Card key={l.id} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-bone">{l.title}</p>
                  <p className="text-xs text-ash">{l.end_reason}</p>
                </div>
                <Badge value="returned" />
              </Card>
            ))}
          </div>
        </Section>
      )}
    </Page>
  );
}
