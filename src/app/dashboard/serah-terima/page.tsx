import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { items } from "@/db/schema";
import { eq, gt } from "drizzle-orm";
import { UserSerahTerimaFlow } from "./UserSerahTerimaFlow";

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
    .where(eq(items.status, "available"));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Serah Terima Barang</h1>
        <p className="text-sm text-gray-500 mt-1">
          Ajukan permintaan serah terima barang secara permanen dari Divisi TI FMIPA UII
        </p>
      </div>
      <UserSerahTerimaFlow items={availableItems} />
    </div>
  );
}
