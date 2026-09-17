import { Sidebar } from "@/components/sidebar";
import { db } from "@/db";
import { getDashboardStats } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [farm, stats] = await Promise.all([db.query.farms.findFirst(), getDashboardStats()]);

  return (
    <div className="flex min-h-screen bg-[#fafafa]">
      <Sidebar farmName={farm?.name ?? "Toph"} newCount={stats.todayNew} />
      <main className="min-w-0 flex-1 px-7 py-6">{children}</main>
    </div>
  );
}
