import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { DEMO_MODE } from "@/lib/supabase";
import { verifySession, SESSION_COOKIE } from "@/lib/session";

export const metadata: Metadata = {
  title: "OKUN Workbench",
  description: "Two-engine operations console — salvage parts + SSF new-parts channel.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = DEMO_MODE ? null : await verifySession((await cookies()).get(SESSION_COOKIE)?.value);

  return (
    <html lang="en">
      <body className="min-h-screen bg-obsidian font-body text-bone antialiased">
        <div className="sacred-bg" />
        <div className="relative z-[1]">
          <Nav session={session} />
          {DEMO_MODE && (
            <div className="bg-status-amber/10 px-4 py-2 text-center text-xs font-medium text-status-amber">
              Demo mode — SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set, showing sample data.
            </div>
          )}
          {children}
          <footer className="py-8 text-center font-mono text-[10px] tracking-widest text-muted">
            OKUN // Àṣẹ // accumulating truth
          </footer>
        </div>
      </body>
    </html>
  );
}
