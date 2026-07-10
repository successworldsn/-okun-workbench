import { getBuyQueue } from "@/lib/db";
import { Page, Section, Card, Badge, Button, usd, countdown } from "@/components/ui";
import { HealthPanel } from "@/components/HealthPanel";
import { markBought, markPassed } from "./actions";

export const revalidate = 0;

export default async function BuyQueuePage() {
  const items = await getBuyQueue();
  const pending = items.filter((i) => i.status === "pending");
  const decided = items.filter((i) => i.status !== "pending");

  return (
    <Page title="Buy Queue" subtitle="Soonest auction close first. One tap: bought or pass.">
      <HealthPanel module="salvage" returnPath="/buy-queue" />
      <Section title={`Open (${pending.length})`}>
        <div className="space-y-3">
          {pending.length === 0 && <p className="text-sm text-muted">Nothing in the queue.</p>}
          {pending.map((item) => {
            const closesSoon = new Date(item.auction_close_at).getTime() - Date.now() < 4 * 3_600_000;
            return (
              <Card key={item.id} className={closesSoon ? "border-status-red/40 bg-status-red/10" : ""}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-bone">
                      {item.vehicle_year} {item.vehicle_make} {item.vehicle_model} {item.vehicle_trim}
                    </p>
                    <p className="text-xs text-ash">
                      {item.auction_source} · lot {item.lot_number} · score {item.scanner_score ?? "—"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-bold ${closesSoon ? "text-status-red" : "text-bone"}`}>
                      {countdown(item.auction_close_at)}
                    </p>
                    <p className="text-xs text-ash">max bid {usd(item.suggested_max_bid)}</p>
                  </div>
                </div>

                {item.component_breakdown && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {Object.entries(item.component_breakdown).map(([part, val]) => (
                      <span key={part} className="rounded bg-elevated px-2 py-0.5 text-[11px] text-ash">
                        {part} {usd(val)}
                      </span>
                    ))}
                  </div>
                )}

                <div className="mt-3 flex gap-2">
                  <form action={markBought} className="flex flex-1 gap-2">
                    <input type="hidden" name="id" value={item.id} />
                    <input
                      type="number"
                      name="bought_price"
                      step="1"
                      defaultValue={item.suggested_max_bid ?? ""}
                      className="w-24 rounded-lg border border-elevated px-2 py-2 text-sm"
                      required
                    />
                    <Button type="submit" variant="primary" className="flex-1">
                      Bought
                    </Button>
                  </form>
                  <form action={markPassed} className="flex flex-1 gap-2">
                    <input type="hidden" name="id" value={item.id} />
                    <input
                      type="text"
                      name="pass_reason"
                      placeholder="reason"
                      className="w-24 rounded-lg border border-elevated px-2 py-2 text-sm"
                    />
                    <Button type="submit" variant="danger" className="flex-1">
                      Pass
                    </Button>
                  </form>
                </div>
              </Card>
            );
          })}
        </div>
      </Section>

      {decided.length > 0 && (
        <Section title={`Decided (${decided.length})`}>
          <div className="space-y-2">
            {decided.map((item) => (
              <Card key={item.id} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-bone">
                    {item.vehicle_year} {item.vehicle_make} {item.vehicle_model}
                  </p>
                  <p className="text-xs text-ash">
                    {item.status === "bought" ? usd(item.bought_price) : item.pass_reason || "passed"}
                  </p>
                </div>
                <Badge value={item.status} />
              </Card>
            ))}
          </div>
        </Section>
      )}
    </Page>
  );
}
