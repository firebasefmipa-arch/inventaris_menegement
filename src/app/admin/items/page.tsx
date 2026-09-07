import { db } from "@/db";
import { items } from "@/db/schema";
import { gt } from "drizzle-orm";
import { ItemsClient } from "./ItemsClient";

export const dynamic = "force-dynamic";

export default async function ItemsPage() {
  // Fetch all items — filtering is done client-side
  // Sembunyikan item quantity=0 (habis diserahterimakan, tidak akan kembali)
  const itemsData = await db
    .select()
    .from(items)
    .where(gt(items.quantity, 0))
    .orderBy(items.name);

  // Get unique categories for filter
  const categories = [...new Set(itemsData.map((i) => i.category))];

  return (
    <div className="space-y-6 pt-12 lg:pt-0">
      <ItemsClient items={itemsData} categories={categories} />
    </div>
  );
}
