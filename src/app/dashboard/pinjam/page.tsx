import { db } from "@/db";
import { items } from "@/db/schema";
import { gt, asc, and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { UserPinjamFlow } from "./UserPinjamFlow";
import { KONDISI_BAIK } from "@/lib/kondisi";

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
    .where(
      and(
        gt(items.availableQuantity, 0),
        eq(items.canBorrow, true),
        // Hanya barang berkondisi tepat "Baik" yang boleh terlihat user.
        // Memeriksa gembok saja TIDAK cukup: barang lama dengan kondisi kosong
        // lahir dari default `can_borrow = 1`, jadi ikut bocor ke daftar ini.
        eq(items.condition, KONDISI_BAIK)
      )
    )
    .orderBy(asc(items.category), asc(items.name));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Pinjam Barang</h1>
      </div>
      <UserPinjamFlow items={availableItems} />
    </div>
  );
}
