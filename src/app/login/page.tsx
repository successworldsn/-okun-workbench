import { Card, Button } from "@/components/ui";
import { login } from "./actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const { error, next } = await searchParams;

  return (
    <main className="relative z-[1] mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center px-4">
      <div className="mb-6 text-center">
        <h1 className="font-display text-2xl font-bold text-bone">OKUN Workbench</h1>
        <p className="mt-1 text-xs uppercase tracking-widest text-muted">sign in</p>
      </div>
      <Card className="border-cyan/20">
        {error && <p className="mb-3 text-sm text-status-red">Wrong username or password.</p>}
        <form action={login} className="space-y-3">
          <input type="hidden" name="next" value={next ?? "/"} />
          <div>
            <label className="text-xs text-ash">Username</label>
            <input type="text" name="username" autoComplete="username" required autoFocus className="mt-1 w-full rounded-lg border border-elevated bg-obsidian px-3 py-2 text-sm text-bone" />
          </div>
          <div>
            <label className="text-xs text-ash">Password</label>
            <input type="password" name="password" autoComplete="current-password" required className="mt-1 w-full rounded-lg border border-elevated bg-obsidian px-3 py-2 text-sm text-bone" />
          </div>
          <Button type="submit" className="w-full">
            Sign in
          </Button>
        </form>
      </Card>
    </main>
  );
}
