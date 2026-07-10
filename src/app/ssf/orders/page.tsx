import { getSsfOrders } from "@/lib/db";
import { Page, Section, Card, Button, usd, countdown } from "@/components/ui";
import { HealthPanel } from "@/components/HealthPanel";
import { submitFulfillmentMode, submitTracking } from "./actions";

export const revalidate = 0;

export default async function SsfOrdersPage() {
  const orders = await getSsfOrders();
  const awaitingPlacement = orders.filter((o) => !o.fulfillment_mode);
  const awaitingTracking = orders.filter((o) => o.fulfillment_mode && !o.tracking_number);
  const shipped = orders.filter((o) => o.tracking_number);

  return (
    <Page title="SSF Orders" subtitle="eBay sale → place order → tracking → auto-upload (once eBay API is live).">
      <HealthPanel module="ssf" returnPath="/ssf/orders" />
      <Section title={`Awaiting order placement (${awaitingPlacement.length})`}>
        <div className="space-y-3">
          {awaitingPlacement.length === 0 && <p className="text-sm text-muted">Nothing waiting.</p>}
          {awaitingPlacement.map((o) => (
            <Card key={o.id} className="border-status-amber/40 bg-status-amber/10">
              <p className="font-semibold text-bone">{o.buyer_name ?? "Buyer"} — {o.ebay_order_id}</p>
              <p className="text-xs text-ash">
                our cost {usd(o.our_cost)} · sold {usd(o.sale_price)}
                {o.deadline_at && <> · deadline {countdown(o.deadline_at)}</>}
              </p>
              <form action={submitFulfillmentMode} className="mt-2 flex gap-2">
                <input type="hidden" name="id" value={o.id} />
                <select name="fulfillment_mode" className="flex-1 rounded-lg border border-elevated px-3 py-2 text-sm" required>
                  <option value="">Fulfillment…</option>
                  <option value="dropship">Dropship (Net10th)</option>
                  <option value="ship_to_shop">Ship to shop, reship</option>
                </select>
                <Button type="submit">Place</Button>
              </form>
            </Card>
          ))}
        </div>
      </Section>

      <Section title={`Awaiting tracking (${awaitingTracking.length})`}>
        <div className="space-y-3">
          {awaitingTracking.length === 0 && <p className="text-sm text-muted">Nothing waiting.</p>}
          {awaitingTracking.map((o) => (
            <Card key={o.id}>
              <p className="font-semibold text-bone">{o.buyer_name ?? "Buyer"} — {o.ebay_order_id}</p>
              <p className="text-xs text-ash">{o.fulfillment_mode === "dropship" ? "Dropship" : "Ship to shop"} · sold {usd(o.sale_price)}</p>
              <form action={submitTracking} className="mt-2 flex gap-2">
                <input type="hidden" name="id" value={o.id} />
                <input type="text" name="tracking_number" placeholder="tracking number" required className="flex-1 rounded-lg border border-elevated px-3 py-2 text-sm" />
                <Button type="submit">Add</Button>
              </form>
            </Card>
          ))}
        </div>
      </Section>

      {shipped.length > 0 && (
        <Section title={`Shipped (${shipped.length})`}>
          <div className="space-y-2">
            {shipped.map((o) => (
              <Card key={o.id} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-bone">{o.buyer_name ?? "Buyer"} — {o.ebay_order_id}</p>
                  <p className="text-xs text-ash">tracking {o.tracking_number}</p>
                </div>
                <p className="text-sm font-semibold text-status-green">{usd(o.sale_price)}</p>
              </Card>
            ))}
          </div>
        </Section>
      )}
    </Page>
  );
}
