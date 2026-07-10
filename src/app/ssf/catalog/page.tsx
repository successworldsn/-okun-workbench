import { getSsfCatalog } from "@/lib/db";
import { pricingAge } from "@/lib/ssf-catalog-csv";
import { Page, Section, Card, Button, usd } from "@/components/ui";
import { HealthPanel } from "@/components/HealthPanel";
import { uploadCatalogCsv } from "./actions";

export const revalidate = 0;

export default async function SsfCatalogPage({ searchParams }: { searchParams: Promise<{ status?: string; message?: string }> }) {
  const { status, message } = await searchParams;
  const catalog = await getSsfCatalog();

  return (
    <Page title="SSF Catalog" subtitle="Manual price-file upload — no EuroLink scraping (ToS risk).">
      <HealthPanel module="ssf" returnPath="/ssf/catalog" />
      {message && (
        <Card className={status === "ok" ? "border-status-green/40 bg-status-green/10" : "border-status-red/40 bg-status-red/10"}>
          <p className="text-sm">{message}</p>
        </Card>
      )}

      <Section title="Upload price file">
        <Card>
          <form action={uploadCatalogCsv} className="space-y-2">
            <input
              type="file"
              name="csv"
              accept=".csv,text/csv"
              required
              className="w-full rounded-lg border border-elevated px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-elevated file:text-bone file:px-3 file:py-1.5 file:text-sm file:font-medium"
            />
            <p className="text-xs text-ash">
              Columns: ssf_part_number, oem_numbers, description, brands, our_cost, list_price, stock_status, warehouse.
              oem_numbers/brands are semicolon-separated.
            </p>
            <Button type="submit">Upload</Button>
          </form>
        </Card>
      </Section>

      <Section title={`SKUs (${catalog.length})`}>
        <div className="space-y-2">
          {catalog.length === 0 && <p className="text-sm text-muted">No catalog data yet — upload a price file.</p>}
          {catalog.map((item) => {
            const age = pricingAge(item.last_updated);
            return (
              <Card key={item.id} className={age.blocked ? "border-status-red/40 bg-status-red/10" : age.amber ? "border-status-amber/40 bg-status-amber/10" : ""}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-bone">{item.ssf_part_number}</p>
                    <p className="text-xs text-ash">{item.description}</p>
                    <p className="text-xs text-muted">{item.brands.join(", ")} · {item.warehouse}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-bone">
                      {usd(item.our_cost)} → {usd(item.list_price)}
                    </p>
                    <p className={`text-xs ${age.blocked ? "font-semibold text-status-red" : age.amber ? "font-semibold text-status-amber" : "text-muted"}`}>
                      {age.days}d old{age.blocked ? " — blocks new listings" : age.amber ? " — stale" : ""}
                    </p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </Section>
    </Page>
  );
}
