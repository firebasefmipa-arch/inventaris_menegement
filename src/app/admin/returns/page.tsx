import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { itemReturns } from "@/db/schema";
import { desc } from "drizzle-orm";
import { unitDiLuar } from "@/lib/unit-di-luar";
import { ReturnsClient } from "./ReturnsClient";

export const dynamic = "force-dynamic";

export default async function AdminReturnsPage() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session?.user || (role !== "admin" && role !== "super_admin")) {
    redirect("/admin/login");
  }

  const riwayat = await db
    .select()
    .from(itemReturns)
    .orderBy(desc(itemReturns.returnDate));

  const diLuar = await unitDiLuar();

  return (
    <div className="space-y-6 pt-12 lg:pt-0">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">Pengembalian Barang</h1>
        <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
          Catat barang yang diserahkan lalu kembali ke inventaris. Stoknya bertambah.
        </p>
      </div>
      <ReturnsClient
        initialRiwayat={riwayat.map((r) => ({
          ...r,
          returnDate: r.returnDate.toISOString(),
          createdAt: r.createdAt.toISOString(),
        }))}
        initialDiLuar={diLuar}
      />
    </div>
  );
}
