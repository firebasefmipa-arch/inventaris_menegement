import { db } from "@/db";
import { items, kodeTerpakai } from "@/db/schema";
import { eq } from "drizzle-orm";
import { bacaKode } from "@/lib/item-code";

/**
 * Bebaskan satu nomor dari buku register supaya bisa dipakai barang lain.
 *
 * Dipisah dari skrip CLI supaya bisa diuji (lihat scripts/check-kode-barang.ts).
 *
 * Menolak melepas nomor yang MASIH dipakai barang hidup — kalau tidak,
 * nomor itu bisa diberikan ke barang lain dan dua barang berbagi kode.
 * `paksa` menembus penolakan itu; hanya untuk superadmin yang benar-benar tahu.
 */
export type HasilLepas =
  | { ok: true; kode: string; dipaksa: boolean; namaBarang?: string }
  | { ok: false; kode: string; alasan: string };

export async function lepasNomor(kodeMentah: string, paksa = false): Promise<HasilLepas> {
  const kode = String(kodeMentah ?? "").trim().toUpperCase();
  if (!bacaKode(kode)) {
    return { ok: false, kode, alasan: `bentuk kode tidak dikenal (harus FMIPA-XXX-TAHUN-URUT)` };
  }

  const [tercatat] = await db.select().from(kodeTerpakai).where(eq(kodeTerpakai.kode, kode)).limit(1);
  if (!tercatat) {
    return { ok: false, kode, alasan: "tidak ada di register — tidak ada yang perlu dilepas" };
  }

  const [dipakai] = await db.select().from(items).where(eq(items.itemCode, kode)).limit(1);
  if (dipakai && !paksa) {
    return {
      ok: false,
      kode,
      alasan: `masih dipakai barang id=${dipakai.id} "${dipakai.name}"`,
    };
  }

  await db.delete(kodeTerpakai).where(eq(kodeTerpakai.kode, kode));
  return { ok: true, kode, dipaksa: !!dipakai, namaBarang: dipakai?.name };
}
