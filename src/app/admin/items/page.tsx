import { db } from "@/db";
import { items } from "@/db/schema";
import { inArray, sql } from "drizzle-orm";
import { auth } from "@/auth";
import { batasUnit } from "@/lib/akses-unit";
import { unitDiLuar } from "@/lib/unit-di-luar";
import { ItemsClient } from "./ItemsClient";

export const dynamic = "force-dynamic";

export default async function ItemsPage() {
  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;

  // SEMUA barang dikirim, termasuk yang stok 0 (habis diserahkan). Barang begitu
  // tidak dihapus — cuma disembunyikan dari daftar sampai ada yang mengembalikan.
  // Penyaringan statusnya di sisi tampilan, karena bergantung pada peran:
  //   admin      → tersembunyi, ada saklar "Tampilkan yang habis"
  //   super_admin → tampil langsung, bertanda "Habis"
  //
  // Tapi BATAS UNIT diperiksa di sini, di server: halaman ini membaca DB
  // langsung sehingga penyaringan di route API tak menolong, dan seluruh daftar
  // akan terkirim ke browser (bisa dibaca siapa pun yang membuka DevTools).
  const batas = await batasUnit(session);
  const itemsData = await db
    .select()
    .from(items)
    .where(batas === null ? undefined : batas.length === 0 ? sql`1 = 0` : inArray(items.unit, batas))
    .orderBy(items.name);

  // Berapa unit tiap barang yang sedang di luar (sudah diserahkan, belum kembali).
  // Hanya yang > 0 yang perlu dikirim. Ikut dibatasi unit, supaya admin tak
  // menerima hitungan barang unit lain yang tak ditampilkan.
  const diLuarList = await unitDiLuar(undefined, batas);
  const diLuar: Record<number, number> = {};
  for (const d of diLuarList) diLuar[d.itemId] = d.diLuar;

  // Get unique categories for filter
  const categories = [...new Set(itemsData.map((i) => i.category))];

  return (
    <div className="space-y-6 pt-12 lg:pt-0">
      <ItemsClient
        items={itemsData}
        categories={categories}
        canSeeHidden={role === "super_admin"}
        diLuar={diLuar}
      />
    </div>
  );
}
