import { getCatalogChecklist } from "@/lib/db";
import { Page, Section } from "@/components/ui";
import { toggleItem } from "./actions";

export const revalidate = 0;

export default async function CatalogChecklistPage() {
  const items = await getCatalogChecklist();
  const categories = [...new Set(items.map((i) => i.category))];
  const done = items.filter((i) => i.done).length;

  return (
    <Page title="Catalog Checklist" subtitle={`Static music-IP checklist. No AI — one sitting. ${done}/${items.length} done.`}>
      {categories.map((cat) => (
        <Section key={cat} title={cat}>
          <div className="space-y-1.5">
            {items
              .filter((i) => i.category === cat)
              .map((item) => (
                <form key={item.id} action={toggleItem}>
                  <input type="hidden" name="id" value={item.id} />
                  <input type="hidden" name="done" value={String(item.done)} />
                  <button type="submit" className="flex w-full items-center gap-2 rounded-lg border border-elevated bg-surface px-3 py-2 text-left text-sm">
                    <span className={`flex h-4 w-4 items-center justify-center rounded border ${item.done ? "border-status-green bg-status-green text-white" : "border-elevated"}`}>
                      {item.done && "✓"}
                    </span>
                    <span className={item.done ? "text-muted line-through" : "text-bone"}>{item.label}</span>
                  </button>
                </form>
              ))}
          </div>
        </Section>
      ))}
    </Page>
  );
}
