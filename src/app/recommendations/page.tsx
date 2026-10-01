import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { loadTasteProfile } from "@/server/routes/recommendations";
import { TasteProfileView } from "./taste-profile";

// The saved profile is loaded here, on the server, so it's on the page from the start. Loading it in
// the browser after the page appeared meant it could arrive while someone was typing and replace
// their prompt.
export default async function TasteProfilePage() {
  const user = await requireUser();
  const initial = await loadTasteProfile(user.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Your taste profile</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Choose what Gemini looks at in{" "}
          <Link href="/settings?tab=preferences" className="text-amber-400">Settings &gt; Preferences</Link>.
        </p>
      </div>
      <TasteProfileView initial={initial} />
    </div>
  );
}
