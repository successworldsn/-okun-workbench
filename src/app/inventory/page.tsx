import { getInventory } from "@/lib/db";
import { Page, Section, Card, Badge, Button, usd } from "@/components/ui";
import { HealthPanel } from "@/components/HealthPanel";
import { advanceStatus, moveLocation } from "./actions";
import type { InventoryStatus } from "@/lib/types";

export const revalidate = 0;

const NEXT_STATUS: Record<InventoryStatus, InventoryStatus | null> = {
  acquired: "at_shop",
  at_shop: "listed",
  listed: "sold",
  sold: "shipped",
  shipped: null,
  returned: null,
};

const ageDays = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);

export default async function InventoryPage() {
  const items = await getInventory();

  return (
    <Page title="Inventory" subtitle="Acquired → at shop → listed → sold → shipped. Red = over 45 days.">
      <HealthPanel module="salvage" returnPath="/inventory" />
      <Section title={`Active (${items.filter((i) => !["sold", "shipped", "returned"].includes(i.status)).length})`}>
        <div className="space-y-3">
          {items
            .filter((i) => !["shipped", "returned"].includes(i.status))
            .map((item) => {
              const age = ageDays(item.acquired_at);
              const stale = age > 45 && item.status !== "sold";
              const next = NEXT_STATUS[item.status];
              return (
                <Card key={item.id} className={stale ? "border-status-red/40 bg-status-red/10" : ""}>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-bone">{item.description}</p>
                      <p className="text-xs text-ash">
                        {item.vehicle_source ?? "—"} {item.part_number ? `· ${item.part_number}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge value={item.status} />
                      <span className={`text-[11px] ${stale ? "font-semibold text-status-red" : "text-muted"}`}>{age}d</span>
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ash">
                    <span>buy {usd(item.buy_price)}</span>
                    {item.list_price && <span>list {usd(item.list_price)}</span>}
                    {item.local_only && <span className="rounded bg-elevated px-1.5 py-0.5">local-only</span>}
                    <form action={moveLocation} className="ml-auto flex items-center gap-1">
                      <input type="hidden" name="id" value={item.id} />
                      <input type="hidden" name="current_status" value={item.status} />
                      <select name="location" defaultValue={item.location} className="rounded-md border border-elevated px-2 py-1 text-xs">
                        <option value="shop">shop</option>
                        <option value="home">home</option>
                        <option value="storage">storage</option>
                        <option value="transit">transit</option>
                      </select>
                      <button type="submit" className="rounded-md bg-elevated px-2 py-1 text-xs font-medium text-ash hover:bg-elevated">
                        move
                      </button>
                    </form>
                  </div>

                  {next && (
                    <form action={advanceStatus} className="mt-3 flex gap-2">
                      <input type="hidden" name="id" value={item.id} />
                      <input type="hidden" name="status" value={next} />
                      {next === "sold" && (
                        <input
                          type="number"
                          name="sale_price"
                          placeholder="sale price"
                          step="1"
                          className="w-28 rounded-lg border border-elevated px-2 py-2 text-sm"
                          required
                        />
                      )}
                      <Button type="submit" variant="ghost" className="flex-1">
                        Mark {next.replace("_", " ")}
                      </Button>
                    </form>
                  )}
                </Card>
              );
            })}
        </div>
      </Section>

      {items.some((i) => ["sold", "shipped", "returned"].includes(i.status)) && (
        <Section title="Closed out">
          <div className="space-y-2">
            {items
              .filter((i) => ["sold", "shipped", "returned"].includes(i.status))
              .map((item) => (
                <Card key={item.id} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-bone">{item.description}</p>
                    <p className="text-xs text-ash">
                      buy {usd(item.buy_price)} → sale {usd(item.sale_price)}
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
