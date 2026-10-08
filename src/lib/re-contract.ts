/**
 * Contract tracker for deals under contract: earnest money, due-diligence
 * window, closing date, buyer assignment, and the Georgia wholesale checklist
 * (Georgia closes through a closing attorney). Pure functions; storage is in
 * re-desk-store.ts.
 */
export interface Contract {
  parcelId: string;
  address: string;
  status: "active" | "closed" | "cancelled";
  contractPrice: number;
  effectiveDate: string; // binding agreement date (YYYY-MM-DD)
  emd: number;
  emdDueDays: number; // days after binding to deliver earnest money
  ddDays: number; // due-diligence period (free termination)
  closingDate: string; // YYYY-MM-DD
  closingAttorney?: string;
  buyerId?: string | null;
  buyerName?: string | null;
  assignmentFee?: number | null;
  buyerEmd?: number | null;
  checklist: { label: string; done: boolean }[];
  notes?: string;
  updatedAt: string;
}

export const GA_CHECKLIST = [
  "Purchase agreement signed by all owners on title",
  "Earnest money delivered to the closing attorney",
  "Title search ordered with the closing attorney",
  "Walk-through done; rehab scope and photos captured",
  "Deal sheet sent to matched buyers",
  "Buyer chosen; proof of funds checked",
  "Assignment agreement signed",
  "Buyer's earnest money received",
  "Title clear (liens, back taxes, heirs resolved)",
  "Closing scheduled with the attorney",
  "Closed and assignment fee received",
];

const DAY = 86_400_000;
const ymd = (d: Date) => d.toISOString().slice(0, 10);
export const addDaysYmd = (date: string, n: number) => ymd(new Date(new Date(`${date}T12:00:00Z`).getTime() + n * DAY));

export function newContract(parcelId: string, address: string, price: number, now: Date, opts: Partial<Contract> = {}): Contract {
  const eff = ymd(now);
  return {
    parcelId,
    address,
    status: "active",
    contractPrice: price,
    effectiveDate: eff,
    emd: 1000,
    emdDueDays: 3,
    ddDays: 10,
    closingDate: addDaysYmd(eff, 30),
    checklist: GA_CHECKLIST.map((label, n) => ({ label, done: n === 0 })),
    updatedAt: now.toISOString(),
    ...opts,
  };
}

export type Severity = "done" | "overdue" | "red" | "amber" | "ok";

export interface Deadline {
  key: "emd" | "dd" | "closing";
  label: string;
  date: string;
  daysLeft: number;
  severity: Severity;
  note: string;
}

export function deadlines(c: Contract, now: Date): Deadline[] {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const left = (d: string) => Math.round((Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) - today) / DAY);
  const sev = (n: number, done: boolean): Severity => (done ? "done" : n < 0 ? "overdue" : n <= 2 ? "red" : n <= 5 ? "amber" : "ok");
  const emdDone = c.checklist[1]?.done ?? false;
  const assigned = c.checklist[6]?.done ?? false;
  const closed = c.status !== "active";
  const emdDate = addDaysYmd(c.effectiveDate, c.emdDueDays);
  const ddDate = addDaysYmd(c.effectiveDate, c.ddDays);
  return [
    { key: "emd", label: "Earnest money due", date: emdDate, daysLeft: left(emdDate), severity: sev(left(emdDate), emdDone || closed), note: `${"$" + c.emd.toLocaleString("en-US")} to the closing attorney` },
    { key: "dd", label: "Due diligence ends", date: ddDate, daysLeft: left(ddDate), severity: sev(left(ddDate), assigned || closed), note: assigned ? "Buyer assigned" : "Assign a buyer or terminate before this date to keep your earnest money" },
    { key: "closing", label: "Closing", date: c.closingDate, daysLeft: left(c.closingDate), severity: sev(left(c.closingDate), closed), note: c.closingAttorney ? `at ${c.closingAttorney}` : "closing attorney not set" },
  ];
}

export function progress(c: Contract): number {
  return Math.round((c.checklist.filter((x) => x.done).length / Math.max(1, c.checklist.length)) * 100);
}

/** Deadlines across all active contracts within `days`, soonest first (overdue included). */
export function upcomingDeadlines(contracts: Contract[], now: Date, days = 7): (Deadline & { contract: Contract })[] {
  return contracts
    .filter((c) => c.status === "active")
    .flatMap((c) => deadlines(c, now).map((d) => ({ ...d, contract: c })))
    .filter((d) => d.severity !== "done" && d.daysLeft <= days)
    .sort((a, b) => a.daysLeft - b.daysLeft);
}
