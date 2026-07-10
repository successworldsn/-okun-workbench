import { getGiftProspects, getGiftDeliveries, getActiveGiftProspectCount } from "@/lib/db";
import { GIFT_PROTOCOL_CAP, usableFacts } from "@/lib/gift-protocol";
import { Page, Section, Card, Badge, Button } from "@/components/ui";
import { HealthPanel } from "@/components/HealthPanel";
import {
  addProspect,
  approveFact,
  generateBrief,
  generateFlyer,
  selectFlyer,
  toggleChecklistItem,
  updateDeliveryStatus,
  submitTracking,
  submitSigner,
  followedUp,
} from "./actions";
import type { GiftDeliveryStatus } from "@/lib/types";

export const revalidate = 0;

const STATUS_FLOW: GiftDeliveryStatus[] = ["not_started", "packed", "shipped", "in_transit", "delivered_signed"];

export default async function GiftProtocolPage({ searchParams }: { searchParams: Promise<{ status?: string; message?: string }> }) {
  const { status, message } = await searchParams;
  const [prospects, deliveries, activeCount] = await Promise.all([getGiftProspects(), getGiftDeliveries(), getActiveGiftProspectCount()]);
  const deliveryByProspect = new Map(deliveries.map((d) => [d.gift_protocol_prospect_id, d]));

  return (
    <Page title="Gift Protocol" subtitle="Deep personalization + physical delivery. Hard cap of 5, always human-approved.">
      <HealthPanel module="gift_protocol" returnPath="/retainers/gift-protocol" />
      {message && (
        <Card className={status === "ok" ? "border-status-green/40 bg-status-green/10" : "border-status-red/40 bg-status-red/10"}>
          <p className="text-sm">{message}</p>
        </Card>
      )}

      <Section title="Cap status">
        <Card className={activeCount >= GIFT_PROTOCOL_CAP ? "border-status-amber/40 bg-status-amber/10" : ""}>
          <p className="text-2xl font-bold text-bone">
            {activeCount}/{GIFT_PROTOCOL_CAP}
          </p>
          <p className="text-xs text-ash">active dossiers — this module never auto-upgrades autonomy; every step here is a human tap.</p>
        </Card>
      </Section>

      {activeCount < GIFT_PROTOCOL_CAP && (
        <Section title="Add a target">
          <Card>
            <form action={addProspect} className="space-y-2">
              <input type="text" name="business_name" placeholder="business name" required className="w-full rounded-lg border border-elevated px-3 py-2 text-sm" />
              <div className="flex gap-2">
                <input type="text" name="category" placeholder="category" className="flex-1 rounded-lg border border-elevated px-3 py-2 text-sm" />
                <input type="text" name="owner_name" placeholder="owner name (if known)" className="flex-1 rounded-lg border border-elevated px-3 py-2 text-sm" />
              </div>
              <div className="flex gap-2">
                <input type="text" name="address" placeholder="address" className="flex-1 rounded-lg border border-elevated px-3 py-2 text-sm" />
                <input type="text" name="phone" placeholder="phone" className="flex-1 rounded-lg border border-elevated px-3 py-2 text-sm" />
              </div>
              <input type="text" name="website_current" placeholder="current website (if any)" className="w-full rounded-lg border border-elevated px-3 py-2 text-sm" />
              <Button type="submit" className="w-full">Add dossier</Button>
            </form>
          </Card>
        </Section>
      )}

      {prospects
        .filter((p) => p.status === "active")
        .map((p) => {
          const delivery = deliveryByProspect.get(p.id);
          const usable = usableFacts(p.dossier);
          const currentStatusIdx = delivery ? STATUS_FLOW.indexOf(delivery.delivery_status) : 0;
          const nextStatus = delivery && currentStatusIdx >= 0 && currentStatusIdx < STATUS_FLOW.length - 1 ? STATUS_FLOW[currentStatusIdx + 1] : null;

          return (
            <Section key={p.id} title={p.business_name}>
              <Card>
                <p className="text-xs text-ash">
                  {p.category ?? "—"} {p.address && `· ${p.address}`} {p.phone && `· ${p.phone}`}
                </p>
                {p.owner_name ? (
                  <p className="mt-1 text-sm">
                    <span className="font-medium text-bone">{p.owner_name}</span> <Badge value={p.owner_confidence ?? undefined} />
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-muted">Owner not confirmed</p>
                )}
                {p.website_current && <p className="mt-1 text-xs text-muted">Current site: {p.website_current}</p>}

                {p.do_not_use_notes && (
                  <Card className="mt-2 border-status-red/40 bg-status-red/10">
                    <p className="text-xs font-semibold text-status-red">Do not use in outreach:</p>
                    <p className="text-xs text-status-red">{p.do_not_use_notes}</p>
                  </Card>
                )}
              </Card>

              <Card className="mt-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-ash">Dossier ({usable.length}/{p.dossier.length} usable)</p>
                <div className="mt-2 space-y-2">
                  {p.dossier.map((f, i) => (
                    <div key={i} className={`rounded-lg border p-2 text-xs ${f.confidence === "confirmed" ? "border-elevated" : f.approved_for_use ? "border-status-amber/30 bg-status-amber/10" : "border-elevated bg-elevated opacity-60"}`}>
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-bone">{f.fact}</p>
                        <Badge value={f.confidence} />
                      </div>
                      <p className="mt-0.5 text-muted">{f.source_note}</p>
                      {f.confidence === "single_source" && !f.approved_for_use && (
                        <form action={approveFact} className="mt-1">
                          <input type="hidden" name="id" value={p.id} />
                          <input type="hidden" name="fact_index" value={i} />
                          <button type="submit" className="text-[11px] font-semibold text-status-amber underline">
                            Approve for use
                          </button>
                        </form>
                      )}
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="mt-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-ash">Free-site brief</p>
                {p.site_brief ? (
                  <div className="mt-1 space-y-1 text-xs text-ash">
                    <p><span className="font-medium">Voice:</span> {p.site_brief.brandVoice}</p>
                    <p><span className="font-medium">Palette:</span> {p.site_brief.palette}</p>
                    <p><span className="font-medium">Trust elements:</span> {p.site_brief.trustElements.join(", ")}</p>
                    <p><span className="font-medium">Visual language:</span> {p.site_brief.visualLanguage}</p>
                  </div>
                ) : (
                  <form action={generateBrief} className="mt-1">
                    <input type="hidden" name="id" value={p.id} />
                    <Button type="submit" variant="ghost" className="w-full text-xs">Generate brief</Button>
                  </form>
                )}
              </Card>

              <Card className="mt-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-ash">Flyer copy</p>
                {p.flyer_copy_options.length === 0 ? (
                  <form action={generateFlyer} className="mt-1">
                    <input type="hidden" name="id" value={p.id} />
                    <Button type="submit" variant="ghost" className="w-full text-xs">Generate flyer copy</Button>
                  </form>
                ) : (
                  <div className="mt-1 space-y-1.5">
                    {p.flyer_copy_options.map((opt, i) => (
                      <form key={i} action={selectFlyer} className="flex items-center gap-2">
                        <input type="hidden" name="id" value={p.id} />
                        <input type="hidden" name="selected" value={opt} />
                        <p className={`flex-1 rounded-lg border p-2 text-xs ${p.flyer_copy_selected === opt ? "border-status-green/60 bg-status-green/10 font-medium" : "border-elevated"}`}>{opt}</p>
                        {p.flyer_copy_selected !== opt && (
                          <button type="submit" className="text-[11px] font-semibold text-ash underline">pick</button>
                        )}
                      </form>
                    ))}
                  </div>
                )}
              </Card>

              <Card className="mt-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-ash">Package assembly (manual, per target)</p>
                <div className="mt-1 space-y-1">
                  {delivery?.checklist.map((item, i) => (
                    <form key={i} action={toggleChecklistItem}>
                      <input type="hidden" name="prospect_id" value={p.id} />
                      <input type="hidden" name="index" value={i} />
                      <button type="submit" className="flex w-full items-center gap-2 rounded-lg border border-elevated bg-surface px-2 py-1.5 text-left text-xs">
                        <span className={`flex h-3.5 w-3.5 items-center justify-center rounded border ${item.done ? "border-status-green bg-status-green text-white" : "border-elevated"}`}>
                          {item.done && "✓"}
                        </span>
                        <span className={item.done ? "text-muted line-through" : "text-bone"}>{item.label}</span>
                      </button>
                    </form>
                  ))}
                </div>
              </Card>

              <Card className="mt-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-ash">Physical delivery</p>
                <p className="mt-1 text-xs text-ash">{delivery?.ship_method}</p>
                <div className="mt-1 flex items-center gap-2">
                  <Badge value={delivery?.delivery_status} />
                  {delivery?.tracking_number && <span className="text-xs text-ash">{delivery.tracking_number}</span>}
                </div>

                {delivery?.delivery_status === "not_started" || !delivery?.tracking_number ? (
                  <form action={submitTracking} className="mt-2 space-y-1.5">
                    <input type="hidden" name="prospect_id" value={p.id} />
                    <input type="text" name="tracking_number" placeholder="tracking number (from Pirate Ship)" className="w-full rounded-lg border border-elevated px-2 py-1.5 text-xs" />
                    <input type="date" name="ship_date" className="w-full rounded-lg border border-elevated px-2 py-1.5 text-xs" />
                    <Button type="submit" variant="ghost" className="w-full text-xs">Save tracking</Button>
                  </form>
                ) : null}

                {nextStatus && nextStatus !== "delivered_signed" && (
                  <form action={updateDeliveryStatus} className="mt-2">
                    <input type="hidden" name="prospect_id" value={p.id} />
                    <input type="hidden" name="status" value={nextStatus} />
                    <Button type="submit" variant="ghost" className="w-full text-xs">Mark {nextStatus.replace("_", " ")}</Button>
                  </form>
                )}

                {nextStatus === "delivered_signed" && (
                  <form action={submitSigner} className="mt-2 flex gap-2">
                    <input type="hidden" name="prospect_id" value={p.id} />
                    <input type="text" name="signer_name" placeholder="signer name" required className="flex-1 rounded-lg border border-elevated px-2 py-1.5 text-xs" />
                    <Button type="submit" className="text-xs">Delivered, signed</Button>
                  </form>
                )}

                {delivery?.delivery_status !== "exception" && delivery?.delivery_status !== "delivered_signed" && (
                  <form action={updateDeliveryStatus} className="mt-1">
                    <input type="hidden" name="prospect_id" value={p.id} />
                    <input type="hidden" name="status" value="exception" />
                    <button type="submit" className="text-[11px] font-medium text-status-red underline">mark exception</button>
                  </form>
                )}

                {delivery?.delivery_status === "delivered_signed" && (
                  <Card className={`mt-2 ${delivery.followed_up ? "" : "border-status-green/40 bg-status-green/10"}`}>
                    <p className="text-xs text-bone">
                      Signed by {delivery.signer_name} — call/visit window {delivery.followed_up ? "closed" : `open (by ${delivery.follow_up_date})`}
                    </p>
                    {!delivery.followed_up && (
                      <form action={followedUp} className="mt-1">
                        <input type="hidden" name="prospect_id" value={p.id} />
                        <Button type="submit" variant="ghost" className="w-full text-xs">Mark followed up</Button>
                      </form>
                    )}
                  </Card>
                )}
              </Card>
            </Section>
          );
        })}
    </Page>
  );
}
