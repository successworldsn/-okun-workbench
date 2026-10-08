import { analyzeSites } from "@/lib/ci-intel";
import { demoCapital, demoDeals, demoMemories, demoSignals, demoSites } from "@/lib/ci-demo";
import { loadGrid, loadInfraFeed } from "@/lib/ci-store";
import { CapitalDesk } from "@/components/capital/CapitalDesk";

export const dynamic = "force-dynamic";
export const metadata = { title: "God's Eye · AI Infrastructure Intelligence" };

/**
 * LIVE when the public infrastructure feed is readable: real Georgia plants and
 * substations; funds and signals are the ones you add. Otherwise fictional
 * EXAMPLE data, labeled as such.
 */
export default async function CapitalCommand() {
  const now = new Date();
  const [feed, grid] = await Promise.all([loadInfraFeed(), loadGrid()]);
  if (feed) {
    const sites = analyzeSites(feed.sites, [], [], now);
    const { sites: _omit, ...meta } = feed;
    return <CapitalDesk sites={sites} rawSites={feed.sites} feed={meta} grid={grid} signals={[]} capital={[]} initialDeals={[]} initialMemories={[]} nowIso={now.toISOString()} example={false} />;
  }
  const signals = demoSignals(now);
  const capital = demoCapital(now);
  const sites = analyzeSites(demoSites(now), signals, capital, now);
  return <CapitalDesk sites={sites} signals={signals} capital={capital} initialDeals={demoDeals(now)} initialMemories={demoMemories(now)} nowIso={now.toISOString()} example />;
}
