import { db } from "@/db";
import { items } from "@/db/schema";
import { auth } from "@/auth";
import { ItemsClient } from "./ItemsClient";

export const dynamic = "force-dynamic";

export default async function ItemsPage() {
  // SEMUA barang dikirim, termasuk yang stok 0 (habis diserahkan). Barang begitu
  // tidak dihapus — cuma disembunyikan dari daftar sampai ada yang mengembalikan.
  // Penyaringannya di sisi tampilan, karena bergantung pada peran:
  //   admin      → tersembunyi, ada saklar "Tampilkan yang habis"
  //   super_admin → tampil langsung, bertanda "Habis"
  const itemsData = await db.select().from(items).orderBy(items.name);

  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;

  // Get unique categories for filter
  const categories = [...new Set(itemsData.map((i) => i.category))];

  return (
    <div className="space-y-6 pt-12 lg:pt-0">
      <ItemsClient
        items={itemsData}
        categories={categories}
        canSeeHidden={role === "super_admin"}
      />
    </div>
  );
}
