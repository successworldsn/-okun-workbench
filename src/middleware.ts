/**
 * Route protection — the auth gap flagged as the #1 blocker before this app
 * goes anywhere near a real URL. Runs on Edge, so it uses lib/session.ts
 * (Web Crypto) not lib/auth.ts (Node crypto, password hashing only).
 *
 * DEMO_MODE (no Supabase creds) bypasses auth entirely — there's no real
 * data to protect and no real users configured yet in that state. Checked
 * inline here rather than importing lib/supabase.ts, to keep this file free
 * of any dependency that might not be Edge-safe.
 */
import { NextResponse, type NextRequest } from "next/server";
import { verifySession, SESSION_COOKIE } from "@/lib/session";
import { canAccessPath } from "@/lib/route-access";

const PUBLIC_PATHS = ["/login"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const demoMode = !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (demoMode) return NextResponse.next();

  if (PUBLIC_PATHS.includes(pathname)) return NextResponse.next();

  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (!canAccessPath(session.accessScope, pathname)) {
    return NextResponse.redirect(new URL("/?denied=1", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
