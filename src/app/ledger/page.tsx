import { getLedger } from "@/lib/db";
import { Page, Section, Card, Badge, Button, usd } from "@/components/ui";
import { HealthPanel } from "@/components/HealthPanel";
import { submitExpense } from "./actions";

export const revalidate = 0;

const CATEGORIES = ["Shop supplies", "Fuel/mileage", "Auction fees", "Tools", "Storage", "Other"];

export default async function LedgerPage() {
  const entries = await getLedger(100);
  const totals = entries.reduce(
    (acc, e) => {
      acc.net += e.amount - e.fees - e.shipping;
      if (e.entry_type === "sale") acc.sales += e.amount;
      if (e.entry_type === "buy") acc.buys += Math.abs(e.amount);
      if (e.entry_type === "expense") acc.expenses += Math.abs(e.amount);
      return acc;
    },
    { net: 0, sales: 0, buys: 0, expenses: 0 }
  );

  return (
    <Page title="Ledger" subtitle="Append-only. Every buy, sale, expense, and return lands here.">
      <HealthPanel module="salvage" returnPath="/ledger" />
      <Section title="Two-tap expense">
        <Card>
          <form action={submitExpense} className="space-y-2">
            <div className="flex gap-2">
              <input
                type="number"
                name="amount"
                placeholder="amount"
                step="0.01"
                required
                className="w-28 rounded-lg border border-elevated px-3 py-2 text-sm"
              />
              <select name="category" className="flex-1 rounded-lg border border-elevated px-3 py-2 text-sm">
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <input type="text" name="note" placeholder="note (optional)" className="flex-1 rounded-lg border border-elevated px-3 py-2 text-sm" />
              <Button type="submit">Log</Button>
            </div>
          </form>
        </Card>
      </Section>

      <Section title="Totals (this view)">
        <div className="grid grid-cols-4 gap-2">
          <Card className="text-center">
            <p className="text-lg font-bold text-bone">{usd(totals.sales)}</p>
            <p className="text-[11px] text-ash">sales</p>
          </Card>
          <Card className="text-center">
            <p className="text-lg font-bold text-bone">{usd(totals.buys)}</p>
            <p className="text-[11px] text-ash">buys</p>
          </Card>
          <Card className="text-center">
            <p className="text-lg font-bold text-bone">{usd(totals.expenses)}</p>
            <p className="text-[11px] text-ash">expenses</p>
          </Card>
          <Card className="text-center">
            <p className={`text-lg font-bold ${totals.net >= 0 ? "text-status-green" : "text-status-red"}`}>{usd(totals.net)}</p>
            <p className="text-[11px] text-ash">net</p>
          </Card>
        </div>
      </Section>

      <Section title={`Entries (${entries.length})`}>
        <div className="space-y-2">
          {entries.map((e) => (
            <Card key={e.id} className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Badge value={e.entry_type} />
                  <span className="text-xs text-muted">{new Date(e.created_at).toLocaleString()}</span>
                </div>
                {e.note && <p className="mt-1 text-xs text-ash">{e.note}</p>}
                {e.net_margin !== null && e.net_margin !== undefined && (
                  <p className="mt-1 text-xs text-ash">
                    margin {usd(e.net_margin)} · {e.days_to_sell ?? "—"}d to sell
                  </p>
                )}
              </div>
              <p className={`text-sm font-bold ${e.amount >= 0 ? "text-status-green" : "text-status-red"}`}>{usd(e.amount)}</p>
            </Card>
          ))}
        </div>
      </Section>
    </Page>
  );
}
