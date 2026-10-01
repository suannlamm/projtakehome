import Link from "next/link";
import { createClient, requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/queries";
import { ProfileForm } from "@/components/actions";
import { DeleteAccount, EmailForm, PasswordForm, SettingToggle } from "./forms";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireUser();
  const tab = (await searchParams).tab === "preferences" ? "preferences" : "account";
  const [profile, { data }] = await Promise.all([getSettings(user.id), (await createClient()).auth.getUser()]);

  return (
    <div className="mx-auto max-w-xl space-y-8">
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Settings</h1>
        <nav className="flex gap-2 text-sm">
          <Link href="/settings" className={`tab ${tab === "account" ? "tab-active" : ""}`}>Account</Link>
          <Link href="/settings?tab=preferences" className={`tab ${tab === "preferences" ? "tab-active" : ""}`}>Preferences</Link>
        </nav>
      </div>

      {tab === "account" ? (
        <>
          <Section title="Profile">
            <ProfileForm initial={{ username: user.username, displayName: profile.displayName }} />
          </Section>
          <Section title="Email">
            <EmailForm current={data.user?.email ?? ""} />
          </Section>
          <Section title="Password">
            <PasswordForm />
          </Section>
          <Section title="Privacy">
            <SettingToggle
              field="isPrivate"
              checked={profile.isPrivate}
              label="Private account"
              hint="People send a request, and you accept it, before they can follow you. Going public accepts every pending request."
            />
          </Section>
          <Section title="Delete account">
            <DeleteAccount username={user.username} />
          </Section>
        </>
      ) : (
        <Section title="Taste profile">
          <p className="text-sm text-zinc-400">What Gemini looks at when it writes your taste profile and picks films.</p>
          <SettingToggle
            field="tasteUsesWatched"
            checked={profile.tasteUsesWatched}
            label="Watched films"
            hint="Films you've watched, with your ratings and reviews."
          />
          <SettingToggle
            field="tasteUsesWatchlist"
            checked={profile.tasteUsesWatchlist}
            label="Watchlist"
            hint="Films you've saved to watch but haven't seen yet."
          />
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-lg border border-zinc-800 p-4">
      <h2 className="font-semibold">{title}</h2>
      {children}
    </section>
  );
}
