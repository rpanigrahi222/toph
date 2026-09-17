import { Sidebar } from "@/components/sidebar";
import { db } from "@/db";
import { getDashboardStats } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [farm, stats] = await Promise.all([db.query.farms.findFirst(), getDashboardStats()]);

  return (
    <div className="flex min-h-screen flex-col bg-[#fafafa] lg:flex-row">
      <Sidebar farmName={farm?.name ?? "Toph"} newCount={stats.todayNew} />
      <main className="min-w-0 flex-1 px-4 py-4 sm:px-6 lg:px-7 lg:py-6">{children}</main>
    </div>
  );
}
