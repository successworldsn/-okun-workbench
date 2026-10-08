import type { ReactNode } from "react";

/** Site builds (--site) map app routes onto the static pages: / = Capital Desk, /deals = Deal Desk. */
const SITE: Record<string, string> = { "/": "/", "/capital/command": "/", "/realestate/command": "/deals" };
const isSite = () => !!(globalThis as unknown as { __GE_SITE__?: boolean }).__GE_SITE__;

export default function Link({ href, children, ...rest }: { href: string; children: ReactNode; className?: string; title?: string }) {
  const to = isSite() ? (SITE[href] ?? href) : href === "/" ? "#" : href;
  return (
    <a href={to} {...rest}>
      {children}
    </a>
  );
}
