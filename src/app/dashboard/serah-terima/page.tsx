import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { items } from "@/db/schema";
import { eq, gt, and } from "drizzle-orm";
import { UserSerahTerimaFlow } from "./UserSerahTerimaFlow";
import { KONDISI_BAIK } from "@/lib/kondisi";

export default async function SerahTerimaPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const user = session.user as any;
  if (!user.phone || !user.department) redirect("/register/complete");

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
        eq(items.status, "available"),
        eq(items.canHandover, true),
        gt(items.availableQuantity, 0),
        gt(items.quantity, 0),
        // Hanya barang berkondisi tepat "Baik". Memeriksa gembok saja tidak
        // cukup — lihat catatan yang sama di halaman Pinjam.
        eq(items.condition, KONDISI_BAIK)
      )
    );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Serah Terima Barang</h1>
      </div>
      <UserSerahTerimaFlow items={availableItems} />
    </div>
  );
}
