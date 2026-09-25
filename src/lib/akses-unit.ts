// Pembatasan akses admin menurut UNIT.
//
// Aturan:
//   superadmin → semua unit, termasuk barang tanpa unit
//   admin      → HANYA unit yang ditugaskan (tabel user_unit)
//   user       → tak boleh mengelola sama sekali (tetap seperti sebelumnya)
//   barang tanpa unit → hanya superadmin (unit kosong BUKAN milik bersama)
//
// Semua penolakan terjadi di SERVER. Menyembunyikan tombol di layar saja tidak
// cukup: URL bisa diketik langsung, dan permintaan bisa dibuat di luar aplikasi.
import { db } from "@/db";
import { userUnits } from "@/db/schema";
import { eq } from "drizzle-orm";
import { normalizeUnit } from "@/lib/units";

export type Peran = "user" | "admin" | "super_admin" | null | undefined;

/** Bentuk sesi yang kami butuhkan — sengaja longgar supaya bisa menerima
 *  objek sesi Auth.js apa adanya tanpa cast di tiap pemanggil. */
export type SesiRingkas = { user?: { id?: unknown; role?: unknown } | null } | null | undefined;

function peranDari(session: SesiRingkas): Peran {
  return (session?.user?.role ?? null) as Peran;
}

function idDari(session: SesiRingkas): string | null {
  const id = session?.user?.id;
  return typeof id === "string" ? id : null;
}

/** Unit-unit yang dikelola seorang admin (superadmin → null = semua). */
export async function unitDikelola(userId: string | null | undefined): Promise<string[] | null> {
  if (!userId) return [];
  const rows = await db
    .select({ unit: userUnits.unit })
    .from(userUnits)
    .where(eq(userUnits.userId, userId));
  return rows.map((r) => r.unit);
}

/** Apakah unit ini boleh dikelola pemakai dengan peran + daftar unit tsb? */
export function bolehKelolaUnit(
  role: Peran,
  unitDikelola: string[] | null,
  unitBarang: string | null | undefined
): boolean {
  if (role === "super_admin") return true;
  if (role !== "admin") return false;

  const target = normalizeUnit(unitBarang);
  // Barang tanpa unit bukan milik bersama — hanya superadmin.
  if (!target) return false;

  const daftar = unitDikelola ?? [];
  return daftar.some((u) => normalizeUnit(u) === target);
}

/**
 * Periksa apakah pemakai sesi boleh mengelola barang dengan unit tertentu.
 * Mengembalikan null kalau BOLEH, atau objek pesan kalau TIDAK.
 */
export async function periksaAksesUnit(
  session: SesiRingkas,
  unitBarang: string | null | undefined
): Promise<{ pesan: string; status: number } | null> {
  const role = peranDari(session);

  if (role !== "admin" && role !== "super_admin") {
    return { pesan: "Tidak memiliki akses", status: 401 };
  }
  if (role === "super_admin") return null;

  const daftar = await unitDikelola(idDari(session));
  if (bolehKelolaUnit(role, daftar, unitBarang)) return null;

  const target = normalizeUnit(unitBarang);
  return {
    pesan: target
      ? `Anda tidak mengelola unit "${target}".`
      : "Barang ini belum punya unit — hanya Super Admin yang dapat mengelolanya.",
    status: 403,
  };
}

/**
 * Daftar unit untuk menyaring barang milik pemakai.
 * null = tanpa batasan (superadmin).
 */
export async function batasUnit(session: SesiRingkas): Promise<string[] | null> {
  const role = peranDari(session);
  if (role === "super_admin") return null;
  if (role !== "admin") return [];
  return (await unitDikelola(idDari(session))) ?? [];
}
