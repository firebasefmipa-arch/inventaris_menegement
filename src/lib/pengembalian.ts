import { db } from "@/db";
import { items, itemReturns } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

/**
 * Kembalikan stok yang tadinya ditahan (transaksi/serah terima ditolak).
 *
 * Dulu di tiap jalur penolakan ini dilakukan dengan pola baca-lalu-tulis:
 * baca `available_quantity`, tambahkan di JavaScript, lalu tulis kembali.
 * Kalau dua penolakan terjadi bersamaan, keduanya membaca angka yang sama dan
 * yang satu menimpa hasil yang lain — stok akhirnya kurang dari seharusnya.
 * Di sini penambahannya dilakukan oleh database dalam satu perintah, jadi
 * tidak ada angka yang perlu dibaca lebih dulu.
 */
export async function kembalikanKeStok(
  daftar: { itemId: number; quantity: number }[]
): Promise<void> {
  for (const d of daftar) {
    if (!d.itemId || d.quantity <= 0) continue;
    await db
      .update(items)
      .set({
        availableQuantity: sql`${items.availableQuantity} + ${d.quantity}`,
        status: sql`CASE WHEN ${items.availableQuantity} + ${d.quantity} > 0 THEN 'available' ELSE 'borrowed' END`,
        updatedAt: new Date(),
      })
      .where(eq(items.id, d.itemId));
  }
}

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
 *
 * SELURUH proses berjalan dalam SATU transaksi dan baris barangnya DIKUNCI
 * (`FOR UPDATE`) sebelum sisa "di luar" dihitung. Tanpa kunci itu, dua
 * pengembalian yang datang bersamaan sama-sama membaca "sisa 1 unit", keduanya
 * lolos, dan stok bertambah dua kali dari satu unit yang keluar.
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

  try {
    return await db.transaction(async (tx) => {
      // Kunci baris barang ini sampai transaksi selesai. Permintaan lain yang
      // menyentuh barang yang sama akan menunggu di sini, jadi perhitungan
      // sisa di bawah selalu memakai angka yang sudah final.
      const terkunci = await tx.execute(sql`
        SELECT id, name, item_code, quantity, available_quantity
          FROM items WHERE item_code = ${kode} LIMIT 1 FOR UPDATE
      `);
      const rows = (Array.isArray(terkunci) ? terkunci[0] : terkunci) as unknown as any[];
      const barang = (Array.isArray(rows) ? rows[0] : rows) as any;

      if (!barang) {
        return {
          ok: false as const,
          status: 404,
          error: `Kode barang "${kode}" tidak ditemukan. Periksa kembali penulisannya.`,
        };
      }

      // Sisa "di luar" = jumlah diserahkan (serah terima selesai) − jumlah kembali.
      const hitung = await tx.execute(sql`
        SELECT
          (SELECT COALESCE(SUM(hi.quantity), 0)
             FROM handover_items hi
             JOIN handovers h ON h.id = hi.handover_id
            WHERE h.status = 'completed' AND hi.item_id = ${barang.id}) AS diserahkan,
          (SELECT COALESCE(SUM(quantity), 0)
             FROM item_returns WHERE item_id = ${barang.id}) AS kembali
      `);
      const hRows = (Array.isArray(hitung) ? hitung[0] : hitung) as unknown as any[];
      const h = (Array.isArray(hRows) ? hRows[0] : hRows) as any;
      const diLuar = (Number(h?.diserahkan) || 0) - (Number(h?.kembali) || 0);

      if (diLuar <= 0) {
        return {
          ok: false as const,
          status: 400,
          error: `"${barang.name}" tidak sedang di luar — tidak ada yang perlu dikembalikan.`,
        };
      }
      if (jumlah > diLuar) {
        return {
          ok: false as const,
          status: 400,
          error: `Jumlah melebihi yang masih di luar. "${barang.name}" sedang di luar ${diLuar} unit.`,
        };
      }

      await tx.insert(itemReturns).values({
        itemId: barang.id,
        quantity: jumlah,
        itemName: barang.name,
        itemCode: barang.item_code,
        returnedBy,
        receivedBy: input.receivedBy ?? null,
        receivedById: input.receivedById ?? null,
        notes,
      });

      await tx
        .update(items)
        .set({
          quantity: Number(barang.quantity) + jumlah,
          availableQuantity: Number(barang.available_quantity) + jumlah,
          status: "available",
          updatedAt: new Date(),
        })
        .where(eq(items.id, barang.id));

      const masihDiLuar = diLuar - jumlah;

      return {
        ok: true as const,
        message: `"${barang.name}" +${jumlah} unit. ${
          masihDiLuar > 0 ? `Masih ${masihDiLuar} unit di luar.` : "Semua unit sudah kembali."
        }`,
        itemId: Number(barang.id),
        stokBaru: Number(barang.quantity) + jumlah,
        masihDiLuar,
      };
    });
  } catch (error) {
    console.error("catatPengembalian error:", error);
    return {
      ok: false,
      status: 500,
      error: "Gagal mencatat pengembalian. Coba lagi sebentar lagi.",
    };
  }
}
