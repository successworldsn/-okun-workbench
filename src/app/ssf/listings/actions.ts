"use server";

import { revalidatePath } from "next/cache";
import { getSsfCatalog, getSsfListings, createSsfListing, updateSsfListingStatus, getSsfGates, updateSsfGates } from "@/lib/db";
import { draftListing } from "@/lib/listing-draft";
import { checkVero } from "@/lib/vero-guard";
import { getSsfConfig } from "@/lib/ssf-config";
import { canQueueNewListing, requiresHumanApproval, applyOutOfStockCancellationPenalty } from "@/lib/ssf-gates";
import { publishListing } from "@/lib/ebay";
import { pricingAge } from "@/lib/ssf-catalog-csv";

async function activeListingCount(): Promise<number> {
  const [live, pending] = await Promise.all([getSsfListings("live"), getSsfListings("pending_approval")]);
  return live.length + pending.length;
}

export async function draftFromCatalog(formData: FormData) {
  const catalogId = formData.get("ssf_catalog_id") as string;
  const catalog = await getSsfCatalog();
  const item = catalog.find((c) => c.id === catalogId);
  if (!item) return;

  const age = pricingAge(item.last_updated);
  if (age.blocked) {
    revalidatePath("/ssf/listings");
    return; // pricing >14d stale — blocked per Module 2a, silently refuse (page shows the stale flag on the catalog item itself)
  }

  const gates = await getSsfGates();
  const count = await activeListingCount();
  const queueCheck = canQueueNewListing(gates, count);
  if (!queueCheck.allowed) {
    revalidatePath("/ssf/listings");
    return;
  }

  const draft = await draftListing(item, false);
  const config = getSsfConfig();
  const vero = checkVero({ title: draft.title, description: draft.description, brands: item.brands, isGenuineLine: false }, config);
  if (vero.blocked) {
    revalidatePath("/ssf/listings");
    return; // hard stop — draft must be rewritten, doesn't queue. Reasons would show in a review UI in a later pass.
  }

  await createSsfListing({
    ssf_catalog_id: item.id,
    title: draft.title,
    vero_flagged: vero.flagged,
    vero_flag_reason: vero.flagged ? vero.reasons.join("; ") : null,
  });
  revalidatePath("/ssf/listings");
}

export async function approveAndPublish(formData: FormData) {
  const id = formData.get("id") as string;
  const listings = await getSsfListings("pending_approval");
  const listing = listings.find((l) => l.id === id);
  if (!listing) return;

  const gates = await getSsfGates();
  const needsApproval = requiresHumanApproval(gates, { ourCost: listing.our_cost ?? null, veroFlagged: listing.vero_flagged });
  // needsApproval is true for everything reaching this human-tap action by construction —
  // this checked path exists so the auto_under_75 tier's non-flagged/cheap SKUs skip it
  // entirely once the Stock-Feed-Guard-equivalent auto-publish path is wired in Phase C.
  void needsApproval;

  const config = getSsfConfig();
  const result = await publishListing({
    sku: listing.ssf_part_number ?? "",
    title: listing.title,
    description: "",
    itemSpecifics: {},
    price: listing.list_price ?? 0,
    quantity: 1,
    handlingTimeDays: config.handling_time_business_days,
  });

  if (result.ok && result.ebayListingId) {
    await updateSsfListingStatus(id, "live", { approvedBy: "u-ej", ebayListingId: result.ebayListingId });
  }
  // eBay not configured yet: leave status as pending_approval. The human tap is recorded
  // by nothing changing visibly wrong — there's no "approved, awaiting API" status in the
  // schema, so the honest thing is: nothing goes live until the API can actually publish it.
  revalidatePath("/ssf/listings");
}

export async function rejectListing(formData: FormData) {
  const id = formData.get("id") as string;
  await updateSsfListingStatus(id, "ended", { endReason: "Rejected in review" });
  revalidatePath("/ssf/listings");
}

export async function recordOutOfStockCancellation() {
  const gates = await getSsfGates();
  const patch = applyOutOfStockCancellationPenalty(gates);
  await updateSsfGates(patch);
  revalidatePath("/ssf/listings");
}
