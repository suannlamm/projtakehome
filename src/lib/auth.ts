import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { profiles } from "@/db/schema";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components can't set cookies; proxy.ts refreshes the session instead.
        }
      },
    },
  });
}

// getUser() validates the token with Supabase; getSession() only reads the cookie and can be spoofed.
export const getUserId = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
});

export const getCurrentUser = cache(async () => {
  const id = await getUserId();
  if (!id) return null;
  const [profile] = await db.select({ username: profiles.username }).from(profiles).where(eq(profiles.id, id));
  return { id, username: profile?.username ?? null };
});

// For pages: signed-out users go to /login, users without a username go to /onboarding.
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.username) redirect("/onboarding");
  return { id: user.id, username: user.username };
}
