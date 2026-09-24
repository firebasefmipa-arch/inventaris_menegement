import { db } from "@/db";
import { items, itemReturns } from "@/db/schema";
import { eq } from "drizzle-orm";
import { unitDiLuar } from "@/lib/unit-di-luar";

/**
 * Catat barang yang kembali ke inventaris.
 *
 * Dipisah dari route supaya bisa diuji langsung (tanpa sesi HTTP) — lihat
 * scripts/check-barang-kembali.ts.
 *
 * Yang penting: stok NAMBAH (`quantity + jumlah`), tidak ditimpa ke angka
 * tertentu — supaya pengembalian bertahap (2 keluar, kembali 1 lalu 1) tetap
 * benar. Peminjaman tidak menyentuh kolom `quantity`, jadi menaikkannya di
 * sini aman.
 *
 * Barang yang stoknya 0 (tersembunyi dari daftar) TETAP bisa dikembalikan;
 * begitu stoknya naik di atas 0 ia otomatis muncul kembali di daftar.
 */
export type HasilPengembalian =
  | { ok: true; message: string; itemId: number; stokBaru: number; masihDiLuar: number }
  | { ok: false; status: number; error: string };

export async function catatPengembalian(input: {
  itemCode: string;
  quantity: number;
  returnedBy: string;
  receivedBy?: string | null;
  receivedById?: string | null;
  notes?: string | null;
}): Promise<HasilPengembalian> {
  const kode = String(input.itemCode ?? "").trim().toUpperCase();
  const jumlah = Number(input.quantity);
  const returnedBy = String(input.returnedBy ?? "").trim();
  const notes = String(input.notes ?? "").trim() || null;

  if (!kode) return { ok: false, status: 400, error: "Kode barang wajib diisi" };
  if (!Number.isInteger(jumlah) || jumlah < 1) {
    return { ok: false, status: 400, error: "Jumlah harus bilangan bulat minimal 1" };
  }
  if (!returnedBy) {
    return { ok: false, status: 400, error: "Nama yang mengembalikan wajib diisi" };
  }

  const [barang] = await db
    .select()
    .from(items)
    .where(eq(items.itemCode, kode))
    .limit(1);

  if (!barang) {
    return {
      ok: false,
      status: 404,
      error: `Kode barang "${kode}" tidak ditemukan. Periksa kembali penulisannya.`,
    };
  }

  const [sisa] = await unitDiLuar(barang.id);
  const diLuar = sisa?.diLuar ?? 0;

  if (diLuar === 0) {
    return {
      ok: false,
      status: 400,
      error: `"${barang.name}" tidak sedang di luar — tidak ada yang perlu dikembalikan.`,
    };
  }
  if (jumlah > diLuar) {
    return {
      ok: false,
      status: 400,
      error: `Jumlah melebihi yang masih di luar. "${barang.name}" sedang di luar ${diLuar} unit.`,
    };
  }

  await db.insert(itemReturns).values({
    itemId: barang.id,
    quantity: jumlah,
    itemName: barang.name,
    itemCode: barang.itemCode,
    returnedBy,
    receivedBy: input.receivedBy ?? null,
    receivedById: input.receivedById ?? null,
    notes,
  });

  await db
    .update(items)
    .set({
      quantity: barang.quantity + jumlah,
      availableQuantity: barang.availableQuantity + jumlah,
      status: "available",
      updatedAt: new Date(),
    })
    .where(eq(items.id, barang.id));

  const masihDiLuar = diLuar - jumlah;

  return {
    ok: true,
    message: `"${barang.name}" +${jumlah} unit. ${
      masihDiLuar > 0 ? `Masih ${masihDiLuar} unit di luar.` : "Semua unit sudah kembali."
    }`,
    itemId: barang.id,
    stokBaru: barang.quantity + jumlah,
    masihDiLuar,
  };
}
