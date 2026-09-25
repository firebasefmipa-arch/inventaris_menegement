import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { itemReturns, items } from "@/db/schema";
import { desc } from "drizzle-orm";
import { unitDiLuar } from "@/lib/unit-di-luar";
import { batasUnit } from "@/lib/akses-unit";
import { ReturnsClient } from "./ReturnsClient";

export const dynamic = "force-dynamic";

export default async function AdminReturnsPage() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session?.user || (role !== "admin" && role !== "super_admin")) {
    redirect("/admin/login");
  }

  // Batas unit WAJIB di sini: halaman ini membaca DB langsung, sehingga
  // penyaringan di /api/admin/returns tak menolong — seluruh riwayat
  // pengembalian unit lain ikut terkirim ke browser.
  const batas = await batasUnit(session);

  // Riwayat pengembalian tak menyimpan unitnya, jadi disaring lewat unit
  // barangnya. Peta id→unit diambil sekali, bukan satu query per baris.
  const unitBarang = new Map<number, string | null>();
  if (batas !== null) {
    const daftarBarang = await db.select({ id: items.id, unit: items.unit }).from(items);
    for (const b of daftarBarang) unitBarang.set(b.id, b.unit);
  }

  const diLuar = await unitDiLuar(undefined, batas);

  const semuaRiwayat = await db
    .select()
    .from(itemReturns)
    .orderBy(desc(itemReturns.returnDate));

  const riwayat = batas === null
    ? semuaRiwayat
    : semuaRiwayat.filter((r) => {
        const unit = unitBarang.get(r.itemId);
        return batas.some((u) => u === unit);
      });

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
