import Link from "next/link";
import { Page, Section, Card } from "@/components/ui";
import {
  parseIntel,
  matchesMarket,
  toMarketFilter,
  sortItems,
  MARKET_FILTERS,
  MARKET_LABELS,
  type IntelItem,
  type ParsedIntel,
  type MarketFilter,
} from "@/lib/intel-feed";

// Muse refreshes intel.json ~5 AM and ~5 PM ET; re-reading every 30 minutes is plenty.
export const revalidate = 1800;

const FEED_URL = process.env.INTEL_FEED_URL || "https://mystic-coral-txex.here.now/intel.json";

async function loadIntel(): Promise<ParsedIntel> {
  try {
    const res = await fetch(FEED_URL, { next: { revalidate } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return parseIntel(await res.json());
  } catch (e) {
    return { ...parseIntel(null), notReady: `Could not read Muse's feed (${(e as Error).message}).` };
  }
}

const FEED_SECTIONS = [
  { feed: "city-signals", title: "City signals" },
  { feed: "money-found", title: "Money found" },
  { feed: "money-moving", title: "Money moving" },
] as const;

function Place({ item }: { item: IntelItem }) {
  const where = [item.geo.city, item.geo.county && `${item.geo.county} County`].filter(Boolean).join(", ");
  return (
    <span className="text-xs text-muted">
      <span className="rounded-full bg-cyan/15 px-2 py-0.5 font-semibold text-cyan">{MARKET_LABELS[item.geo.market]}</span>
      {where && <span className="ml-2">{where}</span>}
    </span>
  );
}

function Line({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <p className="mt-1 text-sm text-ash">
      <span className="font-semibold text-bone">{label}: </span>
      {value}
    </p>
  );
}

function ItemCard({ item }: { item: IntelItem }) {
  return (
    <Card className={item.feed === "city-signals" && item.priority === "high" ? "border-gold/50" : ""}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Place item={item} />
        <span className="font-mono text-[11px] text-muted">{item.detected_at}</span>
      </div>
      <a href={item.source_url} target="_blank" rel="noopener noreferrer" className="mt-2 block font-semibold text-bone hover:text-cyan">
        {item.title}
      </a>
      <p className="mt-0.5 text-xs text-muted">
        {item.source}
        {item.category && ` · ${item.category}`}
      </p>
      {item.feed === "city-signals" && (
        <>
          <Line label="Meaning" value={item.meaning} />
          <Line label="Opportunity" value={item.opportunity} />
          <Line label="Action" value={item.action} />
        </>
      )}
      {item.feed === "money-found" && (
        <>
          <Line label="Type" value={item.type} />
          <Line label="Amount" value={item.amount} />
          <Line label="Deadline" value={item.deadline} />
          <Line label="Who can apply" value={item.eligibility_note} />
          <Line label="Action" value={item.action} />
        </>
      )}
      {item.feed === "money-moving" && (
        <>
          <Line label="Type" value={item.type} />
          <Line label="Location" value={item.location} />
          <Line label="Demand named" value={item.commercial_demand.join(", ") || null} />
        </>
      )}
    </Card>
  );
}

export default async function CommandPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const filter: MarketFilter = toMarketFilter((await searchParams).market);
  const intel = await loadIntel();

  const byId = new Map(intel.items.map((i) => [i.id, i]));
  const shown = sortItems(intel.items.filter((i) => matchesMarket(i.geo.market, filter)));
  const count = (f: MarketFilter) => intel.items.filter((i) => matchesMarket(i.geo.market, f)).length;
  // A card belongs to the market if any record it cites does.
  const cards = intel.cards.filter((c) => c.cites.some((id) => matchesMarket(byId.get(id)!.geo.market, filter)));

  return (
    <Page title="Green Advantage Command Center" subtitle="Florida intelligence — Miami-Dade, Alachua (Gainesville), Duval (Jacksonville) and statewide.">
      <div id="intelligence" className="scroll-mt-20">
        <nav className="mb-5 flex gap-2 overflow-x-auto pb-1" aria-label="Market">
          {MARKET_FILTERS.map((f) => (
            <Link
              key={f.key}
              href={`/greenadvantage/command?market=${f.key}#intelligence`}
              className={`whitespace-nowrap rounded-full px-3 py-1 text-sm font-medium ${
                f.key === filter ? "bg-cyan text-obsidian" : "bg-elevated text-ash hover:text-bone"
              }`}
            >
              {f.label}
              {!intel.notReady && <span className="ml-1 opacity-70">{count(f.key)}</span>}
            </Link>
          ))}
        </nav>

        {intel.notReady && (
          <Card className="mb-6 border-status-amber/40 bg-status-amber/10">
            <p className="text-sm font-semibold text-status-amber">Muse's feed is not on the desk yet</p>
            <p className="mt-1 text-sm text-ash">{intel.notReady}</p>
          </Card>
        )}

        {cards.length > 0 && (
          <Section title="Muse's reading">
            <div className="space-y-3">
              {cards.map((c) => (
                <Card key={c.title} className="border-violet/40">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-violet">Muse's reading · interpretation</p>
                  <p className="mt-1 font-semibold text-bone">{c.title}</p>
                  <Line label="Signal" value={c.signal} />
                  <Line label="Meaning" value={c.meaning} />
                  <Line label="Opportunity" value={c.opportunity} />
                  <Line label="Action" value={c.action} />
                  <Line label="Why now" value={c.why_now} />
                  <Line label="What's next" value={c.whats_next} />
                  <ul className="mt-2 space-y-1 border-t border-elevated pt-2">
                    {c.cites.map((id) => {
                      const it = byId.get(id)!;
                      return (
                        <li key={id} className="text-xs">
                          <a href={it.source_url} target="_blank" rel="noopener noreferrer" className="text-cyan hover:underline">
                            {it.title}
                          </a>
                          <span className="text-muted"> · {MARKET_LABELS[it.geo.market]}</span>
                        </li>
                      );
                    })}
                  </ul>
                </Card>
              ))}
            </div>
          </Section>
        )}

        {!intel.notReady &&
          FEED_SECTIONS.map(({ feed, title }) => {
            const list = shown.filter((i) => i.feed === feed);
            return (
              <Section key={feed} title={`${title} (${list.length})`}>
                {list.length === 0 ? (
                  <p className="text-sm text-muted">Nothing in this market today.</p>
                ) : (
                  <div className="space-y-3">
                    {list.map((i) => (
                      <ItemCard key={i.id} item={i} />
                    ))}
                  </div>
                )}
              </Section>
            );
          })}

        {intel.sources.length > 0 && (
          <Section title="Sources">
            <Card>
              <ul className="space-y-1 text-xs">
                {intel.sources.map((s) => (
                  <li key={s.name} className="flex flex-wrap gap-x-2">
                    <span className="font-semibold text-bone">{s.name}</span>
                    <span className={s.status === "live" ? "text-status-green" : "text-status-amber"}>{s.status}</span>
                    {s.newest_record && <span className="text-muted">newest {s.newest_record}</span>}
                    {s.reason && s.status !== "live" && <span className="text-muted">— {s.reason}</span>}
                  </li>
                ))}
              </ul>
            </Card>
          </Section>
        )}

        <p className="text-[11px] text-muted">
          Feed {intel.version ? `v${intel.version}` : "unread"}
          {intel.generatedAt && ` · generated ${intel.generatedAt}`}
          {intel.dropped.length > 0 && ` · ${intel.dropped.length} item(s) held back for failing the desk's rules`}
        </p>
      </div>
    </Page>
  );
}
