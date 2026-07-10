/**
 * Demand-gap scan — stateless. Upload a Terapeak-style SKU CSV, get back a
 * ranked gap list scored against the current catalog. Nothing is persisted;
 * this is a read-only research tool, not a data pipeline.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSsfCatalog } from "@/lib/db";
import { observationsFromSsfDemandCsv } from "@/lib/ssf-demand-csv";
import { scoreSsfGap, rankGaps } from "@/lib/ssf-scoring";
import { getSsfConfig } from "@/lib/ssf-config";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("csv") as File | null;
  if (!file || file.size === 0) {
    return NextResponse.json({ error: "No CSV file provided" }, { status: 400 });
  }

  let observations;
  try {
    observations = observationsFromSsfDemandCsv(await file.text());
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "CSV parse failed" }, { status: 400 });
  }
  if (observations.length === 0) {
    return NextResponse.json({ error: "No data rows found in CSV" }, { status: 400 });
  }

  const catalog = await getSsfCatalog();
  const config = getSsfConfig();
  const catalogByPart = new Map(catalog.map((c) => [c.ssf_part_number, c]));

  const scores = observations.map((obs) => scoreSsfGap(obs, catalogByPart.get(obs.ssf_part_number) ?? null, config));
  return NextResponse.json({ results: rankGaps(scores) });
}
