import { db } from "@/db";
import { items } from "@/db/schema";
import { ItemsClient } from "./ItemsClient";

export const dynamic = "force-dynamic";

export default async function ItemsPage() {
  // Fetch all items — filtering is done client-side
  const itemsData = await db.select().from(items).orderBy(items.name);

  // Get unique categories for filter
  const categories = [...new Set(itemsData.map((i) => i.category))];

  return (
    <div className="space-y-6 pt-12 lg:pt-0">
      <ItemsClient items={itemsData} categories={categories} />
    </div>
  );
}
