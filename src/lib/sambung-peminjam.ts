import { and, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { transactions } from "@/db/schema";

/**
 * Menyambungkan transaksi catatan-admin yang "nyangkut" ke akun pemiliknya.
 *
 * Kenapa perlu: waktu admin mencatat pinjam untuk seseorang, bisa jadi orang
 * itu BELUM punya akun (atau emailnya beda). Transaksinya tetap disimpan, tapi
 * kolom pemiliknya kosong — jadi tak muncul di riwayat siapa pun. Begitu ada
 * yang login memakai email itu, di sinilah transaksinya ditempelkan.
 *
 * Aturan:
 *   - HANYA menyentuh baris yang pemiliknya masih kosong (`user_id IS NULL`),
 *     jadi transaksi milik orang lain tak akan pernah ikut tertarik.
 *   - Email dibandingkan tanpa peduli besar-kecil huruf dan spasi pinggir.
 *   - Gagal di sini TIDAK boleh menggagalkan login.
 *
 * BELUM menyentuh SERAH TERIMA: tabel `handovers` tidak punya kolom email
 * penerima sama sekali, jadi tak ada yang bisa dicocokkan. Untuk ke sana perlu
 * kolom baru dulu (Tahap 2).
 *
 * Aman dipanggil tiap kali ada yang berhasil masuk.
 */
export async function sambungkanTransaksiTertunda(
  userId: string,
  email: string | null | undefined
): Promise<number> {
  const surel = String(email ?? "").trim().toLowerCase();
  if (!userId || !surel) return 0;

  const res = await db
    .update(transactions)
    .set({ userId })
    .where(
      and(
        isNull(transactions.userId),
        sql`LOWER(TRIM(${transactions.borrowerEmail})) = ${surel}`
      )
    );

  return Number((res[0] as any)?.affectedRows ?? 0);
}
