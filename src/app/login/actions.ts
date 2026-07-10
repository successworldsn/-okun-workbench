"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getUserCredentialByUsername } from "@/lib/db";
import { verifyPassword } from "@/lib/auth";
import { signSession, SESSION_COOKIE } from "@/lib/session";

const SESSION_TTL_SECONDS = 7 * 24 * 3600;

export async function login(formData: FormData) {
  const username = ((formData.get("username") as string) || "").trim().toLowerCase();
  const password = (formData.get("password") as string) || "";
  const next = (formData.get("next") as string) || "/";

  const user = await getUserCredentialByUsername(username);
  if (!user || !verifyPassword(password, user.password_hash)) {
    redirect(`/login?error=1&next=${encodeURIComponent(next)}`);
  }

  const token = await signSession({
    userId: user.id,
    name: user.name,
    role: user.role,
    accessScope: user.access_scope,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_TTL_SECONDS,
    path: "/",
  });

  redirect(next.startsWith("/") ? next : "/");
}

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  redirect("/login");
}
