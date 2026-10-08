/**
 * EXAMPLE data for the Capital Desk. Every site, party, fund, signal and
 * offer here is fictional (example: true, labeled in the UI); coordinates sit
 * in real Georgia counties so the map reads correctly. No real company,
 * plant or person is named. Dates are relative to `now`.
 */
import type { CapitalSource, Signal, Site, CiEvidence } from "./ci-intel.ts";
import type { Deal, Memory } from "./ci-deal.ts";

const ago = (now: Date, d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();
const ev = (now: Date, source: CiEvidence["source"], detail: string, d: number | null): CiEvidence => ({ source, detail, observedAt: d == null ? null : ago(now, d) });

export function demoSites(now: Date): Site[] {
  const S = (x: Omit<Site, "state" | "example">): Site => ({ ...x, state: "GA", example: true });
  return [
    S({ id: "GA-001", name: "Example Riverside Industrial Tract", county: "Douglas", lat: 33.7265, lng: -84.6681, acres: 94, zoning: "heavy_industrial", existingUse: "vacant", owner: "Example Land Holdings LLC", ownerType: "corporate", power: { reportedMw: 180, substationMi: 0.8, substationKv: 230, transmissionMi: 0.6, utility: "Example Electric Co. (fictional)" }, fiber: { longHaulMi: 0.9, carriers: 3 }, water: { source: "reclaimed", mgd: 2 }, floodZone: "X", incentives: ["State data-center equipment tax program (verify)"], evidence: { power: ev(now, "utility_irp", "Large-load filing lists ~180 MW for the area", 60), fiber: ev(now, "company", "Carrier route map", 120), land: ev(now, "county_parcels", "Parcel record", 30), zoning: ev(now, "county_zoning", "M-2 district", 30), water: ev(now, "company", "Reclaimed-water provider statement", 200), flood: ev(now, "fema", "Zone X", 400) } }),
    S({ id: "GA-002", name: "Example Former Generating Station", county: "Floyd", lat: 34.2557, lng: -85.1647, acres: 210, zoning: "heavy_industrial", existingUse: "retired_plant", owner: "Example Power Legacy Corp", ownerType: "corporate", power: { onsiteGenerationMw: 320, substationMi: 0.1, substationKv: 500, transmissionMi: 0.1, utility: "Example Electric Co. (fictional)" }, fiber: { longHaulMi: 4.5, carriers: 1 }, water: { source: "river", mgd: 12 }, floodZone: "AE (edge)", evidence: { generation: ev(now, "eia_860", "Retired units, 320 MW nameplate, interconnection on file", 300), fiber: ev(now, "estimate", "Nearest route along the rail corridor", null), land: ev(now, "county_parcels", "Parcel record", 30), zoning: ev(now, "county_zoning", "Heavy industrial", 30), flood: ev(now, "fema", "Part of the tract in AE", 400) } }),
    S({ id: "GA-003", name: "Example Interstate Logistics Parcel", county: "Coweta", lat: 33.3807, lng: -84.7997, acres: 140, zoning: "industrial", existingUse: "warehouse", owner: "Example Logistics Fund II", ownerType: "corporate", power: { estimatedMw: 90, substationMi: 2.1, substationKv: 115, transmissionMi: 3.5, utility: "Example EMC (fictional)" }, fiber: { longHaulMi: 0.4, carriers: 2 }, water: { source: "municipal", mgd: 0.8 }, floodZone: "X", evidence: { power: ev(now, "estimate", "115 kV substation, typical headroom", null), fiber: ev(now, "company", "I-85 corridor route", 90), land: ev(now, "county_parcels", "Parcel record", 40), zoning: ev(now, "county_zoning", "Light industrial", 40) } }),
    S({ id: "GA-004", name: "Example Farm Assemblage", county: "Newton", lat: 33.6049, lng: -83.7891, acres: 410, zoning: "agricultural", existingUse: "farm", owner: "Example Family Partnership", ownerType: "private", power: { estimatedMw: 250, substationMi: 3.8, substationKv: 230, transmissionMi: 1.2, utility: "Example Electric Co. (fictional)" }, fiber: { longHaulMi: 2.6, carriers: 2 }, water: { source: "municipal", mgd: 1.5 }, floodZone: "X", evidence: { power: ev(now, "hifld", "230 kV line crosses the north edge", 200), fiber: ev(now, "company", "Route map", 150), land: ev(now, "county_parcels", "Three parcels, same family", 50), zoning: ev(now, "county_zoning", "A-1 agricultural", 50) } }),
    S({ id: "GA-005", name: "Example Quarry Edge Site", county: "Bartow", lat: 34.2251, lng: -84.8402, acres: 65, zoning: "industrial", existingUse: "mining", owner: "Example Aggregates Inc", ownerType: "corporate", power: { reportedMw: 60, substationMi: 1.4, substationKv: 115, utility: "Example Electric Co. (fictional)" }, fiber: { longHaulMi: 6, carriers: 1 }, water: { source: "aquifer" }, floodZone: "X", evidence: { power: ev(now, "conversation", "Owner says the quarry service is 60 MW", 20), land: ev(now, "county_parcels", "Parcel record", 60), zoning: ev(now, "county_zoning", "Industrial", 60) } }),
    S({ id: "GA-006", name: "Example Southwest Solar-Adjacent Land", county: "Dougherty", lat: 31.5785, lng: -84.1557, acres: 300, zoning: "agricultural", existingUse: "farm", owner: "Example Farmland Trust", ownerType: "private", power: { estimatedMw: 120, substationMi: 1.0, substationKv: 230, transmissionMi: 0.8, utility: "Example EMC (fictional)" }, fiber: { longHaulMi: 12, carriers: 1 }, water: { source: "aquifer" }, floodZone: "A", evidence: { power: ev(now, "hifld", "230 kV substation", 300), land: ev(now, "county_parcels", "Parcel record", 90), zoning: ev(now, "county_zoning", "Agricultural", 90), flood: ev(now, "fema", "Zone A along the creek", 500) } }),
    S({ id: "GA-007", name: "Example Tech Park Pad", county: "Columbia", lat: 33.5444, lng: -82.1376, acres: 48, zoning: "industrial", existingUse: "vacant", owner: "Example County Development Authority", ownerType: "public", power: { reportedMw: 40, substationMi: 0.5, substationKv: 115, utility: "Example Electric Co. (fictional)" }, fiber: { longHaulMi: 0.7, carriers: 3 }, water: { source: "municipal", mgd: 1 }, floodZone: "X", incentives: ["Local abatement program (verify)"], evidence: { power: ev(now, "company", "Development authority site sheet", 100), fiber: ev(now, "company", "Site sheet", 100), land: ev(now, "county_parcels", "Parcel record", 100), zoning: ev(now, "county_zoning", "Industrial park", 100), water: ev(now, "company", "Site sheet", 100) } }),
    S({ id: "GA-008", name: "Example Mill Village Redevelopment", county: "Whitfield", lat: 34.7698, lng: -84.9702, acres: 38, zoning: "mixed", existingUse: "industrial_plant", owner: "Example Textile Estate", ownerType: "estate", power: { onsiteGenerationMw: 25, reportedMw: 35, substationMi: 0.3, substationKv: 115, utility: "Example Electric Co. (fictional)" }, fiber: { longHaulMi: 1.8, carriers: 2 }, water: { source: "municipal", mgd: 0.5 }, floodZone: "X", evidence: { power: ev(now, "conversation", "Plant manager: 35 MW service", 45), generation: ev(now, "eia_860", "25 MW cogeneration unit", 300), land: ev(now, "county_parcels", "Parcel record", 30), zoning: ev(now, "county_zoning", "Mixed use overlay", 30) } }),
    S({ id: "GA-009", name: "Example Airport Corridor Land", county: "Fayette", lat: 33.4501, lng: -84.4549, acres: 72, zoning: "commercial", existingUse: "vacant", owner: "Example Holdings 7 LLC", ownerType: "corporate", power: { estimatedMw: 45, substationMi: 2.8, substationKv: 115 }, fiber: { longHaulMi: 1.1, carriers: 2 }, water: { source: "municipal" }, floodZone: "X", evidence: { power: ev(now, "estimate", "Distance + kV screen", null), fiber: ev(now, "company", "Route map", 120), land: ev(now, "county_parcels", "Parcel record", 30), zoning: ev(now, "county_zoning", "Commercial", 30) } }),
    S({ id: "GA-010", name: "Example Coastal Port Logistics Tract", county: "Effingham", lat: 32.2471, lng: -81.2932, acres: 180, zoning: "industrial", existingUse: "vacant", owner: "Example Port Partners", ownerType: "corporate", power: { estimatedMw: 150, substationMi: 1.6, substationKv: 230, transmissionMi: 1.0, utility: "Example Electric Co. (fictional)" }, fiber: { longHaulMi: 3.2, carriers: 2 }, water: { source: "river", mgd: 3 }, floodZone: "AE", evidence: { power: ev(now, "hifld", "230 kV substation", 250), land: ev(now, "county_parcels", "Parcel record", 60), zoning: ev(now, "county_zoning", "Industrial", 60), flood: ev(now, "fema", "Zone AE", 500) } }),
  ];
}

export function demoSignals(now: Date): Signal[] {
  const G = (x: Omit<Signal, "example">): Signal => ({ ...x, example: true });
  return [
    G({ id: "SG-1", kind: "dc_announcement", title: "Example hyperscale campus announced, 300 MW", date: ago(now, 40).slice(0, 10), lat: 33.78, lng: -84.6, county: "Douglas", mw: 300, party: "Example Cloud Co. (fictional)", evidence: ev(now, "news", "Press release (example)", 40) }),
    G({ id: "SG-2", kind: "large_load_filing", title: "Utility large-load pipeline update adds 2 GW in metro west", date: ago(now, 75).slice(0, 10), lat: 33.75, lng: -84.7, mw: 2000, party: "Example Electric Co. (fictional)", evidence: ev(now, "utility_irp", "IRP update (example)", 75) }),
    G({ id: "SG-3", kind: "transmission_project", title: "New 500 kV line approved, Floyd → Bartow", date: ago(now, 120).slice(0, 10), lat: 34.24, lng: -85.0, evidence: ev(now, "utility_irp", "Transmission plan (example)", 120) }),
    G({ id: "SG-4", kind: "plant_retirement", title: "Retirement filed for an Example coal unit (fictional)", date: ago(now, 200).slice(0, 10), lat: 34.26, lng: -85.17, mw: 320, evidence: ev(now, "eia_860", "Planned retirement (example)", 200) }),
    G({ id: "SG-5", kind: "land_sale", title: "Industrial land sold at $310K/acre near I-85 (example)", date: ago(now, 90).slice(0, 10), lat: 33.4, lng: -84.75, amountUsd: 21_700_000, evidence: ev(now, "county_parcels", "Recorded deed (example)", 90) }),
    G({ id: "SG-6", kind: "funding_round", title: "Example Data Center Developer raises $1.2B for Southeast campuses", date: ago(now, 30).slice(0, 10), lat: 33.75, lng: -84.39, amountUsd: 1_200_000_000, party: "Example DC Developer A (fictional)", evidence: ev(now, "sec_filing", "Form D (example)", 30) }),
    G({ id: "SG-7", kind: "moratorium", title: "Example county pauses data-center rezonings for 6 months", date: ago(now, 50).slice(0, 10), lat: 31.6, lng: -84.2, county: "Dougherty", evidence: ev(now, "news", "County commission minutes (example)", 50) }),
    G({ id: "SG-8", kind: "substation_project", title: "New 230 kV substation planned, Newton County", date: ago(now, 150).slice(0, 10), lat: 33.62, lng: -83.8, evidence: ev(now, "utility_irp", "Substation plan (example)", 150) }),
    G({ id: "SG-9", kind: "fiber_build", title: "Long-haul fiber build along I-75 north (example)", date: ago(now, 110).slice(0, 10), lat: 34.2, lng: -84.8, evidence: ev(now, "company", "Carrier announcement (example)", 110) }),
    G({ id: "SG-10", kind: "ppa", title: "Example nuclear PPA signed for 500 MW with a cloud buyer", date: ago(now, 65).slice(0, 10), lat: 33.14, lng: -81.76, mw: 500, party: "Example Cloud Co. (fictional)", evidence: ev(now, "news", "Press release (example)", 65) }),
  ];
}

export function demoCapital(now: Date): CapitalSource[] {
  const C = (x: Omit<CapitalSource, "example">): CapitalSource => ({ ...x, example: true });
  return [
    C({ id: "CP-1", name: "Example DC Developer A (fictional)", kind: "developer", mandate: { assetTypes: ["powered_land", "datacenter"], minMw: 100, maxMw: 1000, regions: ["Southeast"], timelineMonths: 36 }, lastActive: ago(now, 30), evidence: ev(now, "sec_filing", "Raised for Southeast campuses (example)", 30) }),
    C({ id: "CP-2", name: "Example Infrastructure Fund B (fictional)", kind: "infra_fund", mandate: { assetTypes: ["powered_land", "datacenter", "generation"], minMw: 50, maxMw: 600, regions: ["US"], checkMin: 25_000_000, checkMax: 300_000_000 }, lastActive: ago(now, 120), evidence: ev(now, "company", "Stated mandate (example)", 120) }),
    C({ id: "CP-3", name: "Example Family Office C (fictional)", kind: "family_office", mandate: { assetTypes: ["land", "powered_land"], maxMw: 120, regions: ["GA", "SC"], checkMin: 3_000_000, checkMax: 25_000_000 }, lastActive: ago(now, 200), evidence: ev(now, "conversation", "Told us their mandate (example)", 200) }),
    C({ id: "CP-4", name: "Example Power Repurposing Co. (fictional)", kind: "strategic", mandate: { assetTypes: ["stranded_power", "generation"], minMw: 100, regions: ["Southeast"] }, lastActive: ago(now, 60), evidence: ev(now, "news", "Bought two retired sites (example)", 60) }),
    C({ id: "CP-5", name: "Example Cloud Co. (fictional)", kind: "hyperscaler", mandate: { assetTypes: ["datacenter", "powered_land"], minMw: 200, regions: ["US"] }, lastActive: ago(now, 40), evidence: ev(now, "news", "Campus announcement (example)", 40) }),
    C({ id: "CP-6", name: "Example Edge DC Developer D (fictional)", kind: "developer", mandate: { assetTypes: ["powered_land", "datacenter"], minMw: 20, maxMw: 80, regions: ["GA", "AL", "TN"], timelineMonths: 18 }, lastActive: ago(now, 90), evidence: ev(now, "company", "Edge strategy (example)", 90) }),
    C({ id: "CP-7", name: "Example Infrastructure Lender E (fictional)", kind: "lender", mandate: { assetTypes: ["datacenter", "generation"], minMw: 50, regions: ["US"], checkMin: 50_000_000 }, lastActive: ago(now, 300), evidence: ev(now, "company", "Lending criteria (example)", 300) }),
  ];
}

export function demoDeals(now: Date): Deal[] {
  return [
    {
      id: "D-0472",
      title: "Example Riverside Industrial Tract · powered land",
      siteId: "GA-001",
      stage: "NEGOTIATION",
      ourRole: "sourcing_consultant",
      parties: [
        { id: "landowner:Example Land Holdings LLC", name: "Example Land Holdings LLC", role: "landowner" },
        { id: "developer:Example DC Developer A (fictional)", name: "Example DC Developer A (fictional)", role: "developer" },
      ],
      counterpartyId: "developer:Example DC Developer A (fictional)",
      assetValue: 18_000_000,
      fee: { kind: "consulting", amount: 150_000 },
      terms: { side: "sell", target: 18_000_000, anchor: 19_500_000, walkAway: 15_500_000, priorities: ["economics", "speed", "relationship", "control", "risk"], nonNegotiables: ["Buyer pays its own diligence", "No exclusivity without a deposit"], maxAutoStepPct: 0.03 },
      offers: [
        { at: ago(now, 12), from: "us", amount: 19_500_000, note: "Opening ask on the owner's behalf (owner-approved range)" },
        { at: ago(now, 1), from: "them", amount: 14_200_000, note: "Developer's first number" },
      ],
      createdAt: ago(now, 30),
      updatedAt: ago(now, 1),
      example: true,
    },
  ];
}

export function demoMemories(now: Date): Memory[] {
  return [
    { id: "M-1", partyName: "Example DC Developer A (fictional)", at: ago(now, 300), kind: "call", summary: "Passed on a 60 MW site last year", facts: [{ key: "rejected", value: "under 100 MW is too small" }, { key: "needs", value: "energization inside 30 months" }] },
    { id: "M-2", partyName: "Example DC Developer A (fictional)", at: ago(now, 1), kind: "offer", summary: "Offered $14.2M on the Riverside tract", facts: [{ key: "budget", value: "board approved up to ~$17M for this market (their words)" }] },
    { id: "M-3", partyName: "Example Infrastructure Fund B (fictional)", at: ago(now, 365), kind: "meeting", summary: "Walked from a $20M land deal", facts: [{ key: "rejected", value: "$20M: needed liquidity within 90 days" }, { key: "prefers", value: "JV with a developer over raw land" }] },
    { id: "M-4", partyName: "Example Land Holdings LLC", at: ago(now, 20), kind: "call", summary: "Owner open to sale or 24-month option", facts: [{ key: "timeline", value: "wants to close before year-end" }, { key: "decision_maker", value: "two managing members must sign" }] },
  ];
}
