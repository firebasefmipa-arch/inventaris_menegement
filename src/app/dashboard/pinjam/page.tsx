import { db } from "@/db";
import { items } from "@/db/schema";
import { gt, asc } from "drizzle-orm";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { UserPinjamFlow } from "./UserPinjamFlow";

export const dynamic = "force-dynamic";

export default async function DashboardPinjamPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const availableItems = await db
    .select({
      id: items.id,
      name: items.name,
      category: items.category,
      description: items.description,
      quantity: items.quantity,
      availableQuantity: items.availableQuantity,
      location: items.location,
      inventoryNumber: items.inventoryNumber,
      assetNumber: items.assetNumber,
      sn: items.sn,
      condition: items.condition,
      imageUrl: items.imageUrl,
    })
    .from(items)
    .where(gt(items.availableQuantity, 0))
    .orderBy(asc(items.category), asc(items.name));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Pinjam Barang</h1>
        <p className="text-sm text-gray-500 mt-1">
          Pilih barang, isi data, dan submit permintaan peminjaman kamu.
        </p>
      </div>
      <UserPinjamFlow items={availableItems} />
    </div>
  );
}
