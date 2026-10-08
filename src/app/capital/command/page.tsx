import { analyzeSites } from "@/lib/ci-intel";
import { demoCapital, demoDeals, demoMemories, demoSignals, demoSites } from "@/lib/ci-demo";
import { CapitalDesk } from "@/components/capital/CapitalDesk";

export const dynamic = "force-dynamic";
export const metadata = { title: "God's Eye · AI Infrastructure Intelligence" };

/** v1 runs on fictional EXAMPLE data; the free-source feed plan is on the SOURCES view. */
export default function CapitalCommand() {
  const now = new Date();
  const signals = demoSignals(now);
  const capital = demoCapital(now);
  const sites = analyzeSites(demoSites(now), signals, capital, now);
  return <CapitalDesk sites={sites} signals={signals} capital={capital} initialDeals={demoDeals(now)} initialMemories={demoMemories(now)} nowIso={now.toISOString()} example />;
}
