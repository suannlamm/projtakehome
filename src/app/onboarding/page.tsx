import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { UsernameForm } from "@/components/actions";

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.username) redirect("/");

  return (
    <div className="mx-auto max-w-sm space-y-4">
      <h1 className="text-2xl font-bold">Choose a username</h1>
      <p className="text-sm text-zinc-400">This is how other people find and follow you. 3-20 letters, numbers or underscores.</p>
      <UsernameForm />
    </div>
  );
}
