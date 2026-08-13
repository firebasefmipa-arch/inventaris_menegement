import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { handovers, handoverItems, items } from "@/db/schema";
import { desc, inArray, eq } from "drizzle-orm";
import { HandoversClient } from "./HandoversClient";

export default async function AdminHandoversPage() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session?.user || (role !== "admin" && role !== "super_admin")) {
    redirect("/admin/login");
  }

  const hvList = await db
    .select()
    .from(handovers)
    .orderBy(desc(handovers.createdAt));

  let result: any[] = [];
  if (hvList.length > 0) {
    const hvIds = hvList.map((h) => h.id);
    const hvItemRows = await db
      .select({
        handoverId: handoverItems.handoverId,
        itemId: handoverItems.itemId,
        quantity: handoverItems.quantity,
        notes: handoverItems.notes,
        itemName: items.name,
        itemCategory: items.category,
        itemInventoryNumber: items.inventoryNumber,
        itemAssetNumber: items.assetNumber,
      })
      .from(handoverItems)
      .leftJoin(items, eq(handoverItems.itemId, items.id))
      .where(inArray(handoverItems.handoverId, hvIds));

    const itemsByHv = new Map<number, typeof hvItemRows>();
    for (const row of hvItemRows) {
      const existing = itemsByHv.get(row.handoverId) ?? [];
      existing.push(row);
      itemsByHv.set(row.handoverId, existing);
    }

    result = hvList.map((hv) => {
      const hvItems = itemsByHv.get(hv.id) ?? [];
      return {
        ...hv,
        handoverDate: hv.handoverDate.toISOString(),
        createdAt: hv.createdAt.toISOString(),
        itemName: hvItems[0]?.itemName ?? null,
        items: hvItems,
      };
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Serah Terima Barang</h1>
          <p className="text-sm text-gray-500 mt-1">
            Kelola permintaan serah terima barang secara permanen
          </p>
        </div>
      </div>
      <HandoversClient
        initialData={result}
        isSuperAdmin={role === "super_admin"}
      />
    </div>
  );
}
