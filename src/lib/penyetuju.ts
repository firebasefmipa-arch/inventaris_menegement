/**
 * Siapa yang menyetujui sebuah pengajuan — dipakai saat mencetak dokumen dan
 * saat memutuskan boleh-tidaknya seseorang menekan tombol Setujui.
 *
 * Tiga keadaan, dibedakan dari isi kolom pengajuan:
 *   approved_at KOSONG                    -> dokumen lama (sebelum fitur ini)
 *                                            kolom tanda tangan dibiarkan kosong
 *   approved_at ada, approved_by KOSONG   -> disetujui superadmin
 *                                            dokumen menulis "Disetujui oleh Admin"
 *   approved_at ada, approved_by ada      -> disetujui admin
 *                                            tanda tangan + nama dicetak
 *
 * Sengaja TIDAK menebak dari peran saat ini: yang dicetak harus sesuai keadaan
 * saat pengajuan itu disetujui, bukan keadaan hari ini.
 */
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export type Penyetuju = { nama: string | null; tandaTangan: string | null } | null;

/** Susun data penyetuju dari nilai kolom baris pengajuan. */
export function penyetujuDari(baris: {
  approvedAt: Date | null;
  approvedBy: string | null;
  approvedSignatureUrl: string | null;
}): Penyetuju {
  if (!baris.approvedAt) return null;
  return { nama: baris.approvedBy ?? null, tandaTangan: baris.approvedSignatureUrl ?? null };
}

/**
 * Tentukan siapa penyetujunya, atau tolak bila belum memenuhi syarat.
 *
 * Admin WAJIB sudah mengunggah tanda tangan di halaman Profil. Superadmin
 * dikecualikan, tetapi namanya tidak dicetak di dokumen.
 */
export async function tentukanPenyetuju(
  userId: string,
  role: string
): Promise<{ penyetuju: Penyetuju } | { tolak: { pesan: string; status: number } }> {
  if (role === "super_admin") {
    return { penyetuju: { nama: null, tandaTangan: null } };
  }

  const [u] = await db
    .select({ name: users.name, signatureUrl: users.signatureUrl })
    .from(users)
    .where(eq(users.id, userId as any))
    .limit(1);

  if (!u?.signatureUrl) {
    return {
      tolak: {
        pesan:
          "Anda belum mengunggah tanda tangan, jadi belum bisa menyetujui pengajuan. " +
          "Unggah tanda tangan dulu di halaman Profil.",
        status: 403,
      },
    };
  }

  return { penyetuju: { nama: u.name ?? null, tandaTangan: u.signatureUrl } };
}

/**
 * Versi ringkas untuk halaman: boleh tidaknya orang ini menyetujui.
 * Dipakai hanya untuk mematikan tombol; penolakan sesungguhnya tetap di server.
 */
export async function cekBolehSetujui(userId: string, role: string): Promise<boolean> {
  if (role === "super_admin") return true;
  if (!userId) return false;
  const [u] = await db
    .select({ signatureUrl: users.signatureUrl })
    .from(users)
    .where(eq(users.id, userId as any))
    .limit(1);
  return Boolean(u?.signatureUrl);
}
