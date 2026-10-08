import type { ReactNode } from "react";
export default function Link({ href, children, ...rest }: { href: string; children: ReactNode; className?: string; title?: string }) {
  return (
    <a href={href === "/" ? "#" : href} {...rest}>
      {children}
    </a>
  );
}
