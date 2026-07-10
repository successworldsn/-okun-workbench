"use client";

import { useState } from "react";
import { Page, Section, Card, Button, usd } from "@/components/ui";

interface GapScore {
  ssf_part_number: string;
  description: string;
  our_cost: number | null;
  reference_price: number;
  sold_count: number;
  active_count: number;
  velocity: number;
  margin_dollars: number | null;
  margin_pct: number | null;
  gap_score: number;
  why: string[];
}

export default function SsfScanPage() {
  const [results, setResults] = useState<GapScore[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    setResults(null);
    try {
      const formData = new FormData(e.currentTarget);
      const res = await fetch("/api/ssf/scan", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Scan failed");
      setResults(data.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Page title="Demand-Gap Scan" subtitle="Terapeak CSV in, ranked SKU opportunities out. Nothing is saved.">
      <Section title="Upload Terapeak SKU export">
        <Card>
          <form onSubmit={onSubmit} className="space-y-2">
            <input
              type="file"
              name="csv"
              accept=".csv,text/csv"
              required
              className="w-full rounded-lg border border-elevated px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-elevated file:text-bone file:px-3 file:py-1.5 file:text-sm file:font-medium"
            />
            <p className="text-xs text-ash">
              Columns: ssf_part_number, description, sold_count, active_count, median_sold_price, avg_days_to_sell (optional).
            </p>
            <Button type="submit" disabled={loading}>
              {loading ? "Scanning…" : "Scan"}
            </Button>
          </form>
          {error && <p className="mt-2 text-sm text-status-red">{error}</p>}
        </Card>
      </Section>

      {results && (
        <Section title={`Ranked gaps (${results.length})`}>
          <div className="space-y-3">
            {results.map((r) => (
              <Card key={r.ssf_part_number} className={r.gap_score >= 60 ? "border-status-green/40 bg-status-green/10" : ""}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-bone">{r.ssf_part_number}</p>
                    <p className="text-xs text-ash">{r.description}</p>
                  </div>
                  <p className={`text-2xl font-bold ${r.gap_score >= 60 ? "text-status-green" : "text-bone"}`}>{r.gap_score}</p>
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-ash">
                  <span>sold {r.sold_count}</span>
                  <span>active {r.active_count}</span>
                  <span>velocity {r.velocity}x</span>
                  <span>ref price {usd(r.reference_price)}</span>
                  {r.margin_pct !== null && <span>margin {Math.round(r.margin_pct * 100)}%</span>}
                </div>
                <ul className="mt-2 list-inside list-disc text-xs text-ash">
                  {r.why.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        </Section>
      )}
    </Page>
  );
}
