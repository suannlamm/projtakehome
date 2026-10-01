import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { NavLinks, UserMenu } from "@/components/actions";
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
          <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-2 gap-y-2 px-4 py-3 text-sm">
            <Link href="/" className="mr-3 text-lg font-bold text-amber-400">
              Reel
            </Link>
            {user ? (
              <>
                <NavLinks />
                <UserMenu username={user.username} />
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
