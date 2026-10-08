import { lazy, Suspense, type ComponentType, type ReactNode } from "react";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function dynamic<P extends Record<string, any>>(load: () => Promise<ComponentType<P>>, opts: { loading?: () => ReactNode } = {}) {
  const L = lazy(async () => ({ default: await load() })) as unknown as ComponentType<P>;
  return function Dynamic(props: P) {
    return <Suspense fallback={opts.loading ? opts.loading() : null}>{<L {...props} />}</Suspense>;
  };
}
