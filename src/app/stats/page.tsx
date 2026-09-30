import { requireUser } from "@/lib/auth";
import { getStats } from "@/lib/queries";
import { StatsPanel } from "@/components/ui";

export default async function StatsPage() {
  const user = await requireUser();
  const stats = await getStats(user.id, true);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Your stats</h1>
      <StatsPanel stats={stats} />
    </div>
  );
}
