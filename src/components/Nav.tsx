import Link from "next/link";
import { canAccessPath } from "@/lib/route-access";
import { logout } from "@/app/login/actions";
import type { SessionPayload } from "@/lib/types";

const links = [
  { href: "/", label: "Today" },
  { href: "/buy-queue", label: "Buy Queue" },
  { href: "/inventory", label: "Inventory" },
  { href: "/ledger", label: "Ledger" },
  { href: "/ssf/catalog", label: "SSF Catalog" },
  { href: "/ssf/scan", label: "SSF Scan" },
  { href: "/ssf/listings", label: "SSF Listings" },
  { href: "/ssf/orders", label: "SSF Orders" },
  { href: "/retainers", label: "Retainers" },
  { href: "/retainers/gift-protocol", label: "Gift Protocol" },
  { href: "/deals", label: "Deals" },
  { href: "/facebook", label: "Facebook" },
  { href: "/catalog-checklist", label: "Catalog" },
];

function HexMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" className="shrink-0" aria-hidden="true">
      <polygon points="12,1 22,6.5 22,17.5 12,23 2,17.5 2,6.5" fill="none" stroke="#06B6D4" strokeWidth="1.4" />
      <polygon points="12,6 17,8.8 17,14.2 12,17 7,14.2 7,8.8" fill="none" stroke="#8B5CF6" strokeWidth="1.1" />
    </svg>
  );
}

export function Nav({ session }: { session: SessionPayload | null }) {
  const visibleLinks = session ? links.filter((l) => canAccessPath(session.accessScope, l.href)) : links;

  return (
    <nav className="sticky top-0 z-10 border-b border-elevated bg-obsidian/90 backdrop-blur">
      <div className="mx-auto flex max-w-2xl items-center gap-1 overflow-x-auto px-4 py-3">
        <span className="mr-4 flex shrink-0 items-center gap-2 whitespace-nowrap font-display font-bold tracking-tight text-bone">
          <HexMark />
          OKUN Workbench
        </span>
        {visibleLinks.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="whitespace-nowrap rounded-control px-3 py-1.5 text-sm font-medium text-ash hover:bg-elevated hover:text-bone"
          >
            {l.label}
          </Link>
        ))}
        {session && (
          <form action={logout} className="ml-auto shrink-0">
            <span className="mr-2 whitespace-nowrap text-xs text-muted">{session.name}</span>
            <button type="submit" className="whitespace-nowrap rounded-control px-3 py-1.5 text-sm font-medium text-ash hover:bg-elevated hover:text-bone">
              Sign out
            </button>
          </form>
        )}
      </div>
    </nav>
  );
}
