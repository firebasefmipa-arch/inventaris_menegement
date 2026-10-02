import { and, desc, eq, isNotNull, like, ne, or, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";

/**
 * Pencarian akun untuk daftar saran penerima (form pinjam admin).
 *
 * Hanya akun yang:
 *   1. sudah pernah login        (last_login_at terisi)
 *   2. mengisi data diri lengkap (hp + nim + divisi terisi, bukan NULL/"" )
 *   3. akunnya hidup             (tidak suspended)
 *
 * Dipakai bersama oleh rute /api/cari-user dan penjaga check:sambung — supaya
 * aturannya hanya ada SATU definisi dan tidak bisa melenceng diam-diam.
 */
export function syaratAkunSaran(): SQL | undefined {
  return and(
    isNotNull(users.lastLoginAt),
    // Kolom kosong ditulis "" (bukan NULL) di akun lama — saring dua-duanya.
    ne(users.phone, ""),
    ne(users.nim, ""),
    ne(users.department, ""),
    eq(users.status, "active")
  );
}

// Nama akun bisa memuat tanda persen/garis bawah yang di `LIKE` berarti lain.
function amanLike(s: string) {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export async function cariAkunSaran(cari: string, batas = 8) {
  const q = cari.trim();
  if (q.length < 2) return [];

  const pola = `%${amanLike(q)}%`;
  const baris = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      nim: users.nim,
      department: users.department,
    })
    .from(users)
    .where(and(syaratAkunSaran(), or(like(users.name, pola), like(users.email, pola))))
    .orderBy(desc(users.lastLoginAt))
    .limit(batas);

  return baris.filter((a) => a.name?.trim() && a.email?.trim());
}
