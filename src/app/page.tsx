import Link from "next/link";
import { getTodayScreen } from "@/lib/today";
import { getModuleHealth, getExternalBlockers } from "@/lib/db";
import { Page, Section, Card, StatusPill, usd } from "@/components/ui";

export const revalidate = 0;

const MODULE_LABEL: Record<string, string> = {
  salvage: "Salvage",
  ssf: "SSF",
  stock_feed_guard: "Stock-Feed Guard",
  digest: "Digest",
  retainers: "Retainers",
  gift_protocol: "Gift Protocol",
  facebook: "Facebook",
};

export default async function TodayScreen() {
  const [t, health, blockers] = await Promise.all([getTodayScreen(), getModuleHealth(), getExternalBlockers()]);

  return (
    <Page title="Today" subtitle="Everything that needs your attention, ranked.">
      {/* CASH BAR */}
      <Section title="Cash Bar">
        <Card className="border-cyan/30 bg-obsidian shadow-[0_0_40px_-12px_rgba(6,182,212,0.35)]">
          <p className="font-mono text-4xl font-bold text-cyan sm:text-5xl">{usd(t.cashBar.deployable)}</p>
          <p className="mt-1 text-xs uppercase tracking-widest text-ash">deployable</p>
          <div className="mt-3 flex gap-4 text-xs text-muted">
            <span>net cash flow {usd(t.cashBar.netCashFlow)}</span>
            <span>− pending buys {usd(t.cashBar.pendingBuys)}</span>
            <span>− pending SSF {usd(t.cashBar.pendingSsfOrders)}</span>
          </div>
          <p className="mt-2 text-[11px] text-ash">
            Computed from the ledger — not synced to a real bank balance yet.
          </p>
        </Card>
      </Section>

      {/* NEXT ACTIONS */}
      {t.nextActions.length > 0 && (
        <Section title="Next Actions">
          <div className="space-y-2">
            {t.nextActions.map((a, i) => (
              <Link key={i} href={a.href}>
                <Card className={a.urgent ? "border-status-red/40 bg-status-red/10" : ""}>
                  <p className="text-sm font-semibold text-bone">{a.label}</p>
                  <p className="mt-0.5 text-xs text-ash">{a.detail}</p>
                </Card>
              </Link>
            ))}
          </div>
        </Section>
      )}

      {/* DEAL COUNTDOWN */}
      {t.dealCountdown && (
        <Section title="Deal Countdown">
          <Card className={t.dealCountdown.red ? "border-status-red/40 bg-status-red/10" : ""}>
            <p className="text-sm font-semibold text-bone">{t.dealCountdown.name}</p>
            <p className={`mt-1 text-2xl font-bold ${t.dealCountdown.red ? "text-status-red" : "text-bone"}`}>
              {t.dealCountdown.daysLeft} {t.dealCountdown.daysLeft === 1 ? "day" : "days"}
            </p>
          </Card>
        </Section>
      )}

      {/* RETAINER COUNTER */}
      {t.retainerCounter.signed > 0 && (
        <Section title="Retainer Counter">
          <Card>
            <p className="text-2xl font-bold text-bone">
              {t.retainerCounter.signed}/{t.retainerCounter.target}
            </p>
            <p className="mt-0.5 text-xs text-ash">retainers signed</p>
          </Card>
        </Section>
      )}

      {/* SCOREBOARD */}
      <Section title="Today's Scoreboard">
        <div className="grid grid-cols-4 gap-2">
          <Card className="text-center">
            <p className="text-xl font-bold text-bone">{t.scoreboard.bought}</p>
            <p className="text-[11px] text-ash">bought</p>
          </Card>
          <Card className="text-center">
            <p className="text-xl font-bold text-bone">{t.scoreboard.listed}</p>
            <p className="text-[11px] text-ash">listed</p>
          </Card>
          <Card className="text-center">
            <p className="text-xl font-bold text-bone">{t.scoreboard.sold}</p>
            <p className="text-[11px] text-ash">sold</p>
          </Card>
          <Card className="text-center">
            <p className={`text-xl font-bold ${t.scoreboard.net >= 0 ? "text-status-green" : "text-status-red"}`}>{usd(t.scoreboard.net)}</p>
            <p className="text-[11px] text-ash">net</p>
          </Card>
        </div>
      </Section>

      {/* SYSTEM HEALTH */}
      <Section title="System Health">
        <div className="grid grid-cols-2 gap-2">
          {health.map((m) => (
            <div key={m.module} className="flex items-center justify-between rounded-card border border-elevated bg-surface px-3 py-2">
              <span className="text-xs text-ash">{MODULE_LABEL[m.module] ?? m.module}</span>
              <StatusPill status={m.status} label={m.status === "not_set_up" ? "—" : m.status === "attention" ? "!" : m.status === "error" ? "✕" : "✓"} />
            </div>
          ))}
        </div>
      </Section>

      {/* EXTERNAL BLOCKERS */}
      {blockers.length > 0 && (
        <Section title="External Blockers">
          <div className="space-y-2">
            {blockers.map((b) => (
              <Card key={b.id}>
                <p className="text-sm font-semibold text-bone">{b.label}</p>
                {b.submitted_at ? (
                  <p className="mt-0.5 text-xs text-ash">
                    Submitted {new Date(b.submitted_at).toLocaleDateString()}
                    {b.typical_turnaround_days && ` — typically ${b.typical_turnaround_days} business days`}
                  </p>
                ) : (
                  <p className="mt-0.5 text-xs text-status-amber">Not yet submitted</p>
                )}
                {b.note && <p className="mt-1 text-xs text-muted">{b.note}</p>}
              </Card>
            ))}
          </div>
        </Section>
      )}
    </Page>
  );
}
