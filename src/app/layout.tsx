import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "Reel",
  description: "Track films, rate them, follow friends, and get AI recommendations.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  return (
    <html lang="en">
      <body>
        <header className="border-b border-zinc-800">
          <nav className="mx-auto flex max-w-5xl items-center gap-5 px-4 py-3 text-sm">
            <Link href="/" className="text-lg font-bold text-amber-400">
              Reel
            </Link>
            {user ? (
              <>
                <Link href="/search" className="hover:text-amber-400">Search</Link>
                <Link href="/recommendations" className="hover:text-amber-400">For you</Link>
                {user.username && (
                  <Link href={`/u/${user.username}`} className="hover:text-amber-400">@{user.username}</Link>
                )}
                <form action="/auth/signout" method="post" className="ml-auto">
                  <button className="text-zinc-400 hover:text-zinc-100">Sign out</button>
                </form>
              </>
            ) : (
              <Link href="/login" className="btn ml-auto">Sign in</Link>
            )}
          </nav>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
