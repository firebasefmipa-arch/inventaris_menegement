"use server";

import { db } from "@/db";
import { users, transactions, userUnits } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { encryptPassword, decryptPassword, isCipherText } from "@/lib/crypto";
import { normalizeUnit, unitDikenal, UNIT_OPTIONS } from "@/lib/units";

/** Admin WAJIB punya minimal satu unit. Diperiksa di server, bukan cuma di UI. */
async function simpanUnitAdmin(userId: string, units: string[] | null | undefined) {
  if (units === undefined) return; // tak diubah
  const bersih = [...new Set((units ?? []).map((u) => normalizeUnit(u)).filter(Boolean))];

  if (bersih.length === 0) {
    throw new Error("Admin wajib punya minimal 1 unit.");
  }
  const asing = bersih.find((u) => !unitDikenal(u));
  if (asing) throw new Error(`Unit "${asing}" tidak ada di daftar unit.`);

  await db.delete(userUnits).where(eq(userUnits.userId, userId));
  await db.insert(userUnits).values(bersih.map((unit) => ({ userId, unit })));

  // `unit_utama` = unit pertama, dipakai sebagai usulan otomatis saat lain kali
  // orang ini dipromosikan lagi. Bukan sumber kebenaran — daftarnya userUnits.
  await db.update(users).set({ unitUtama: bersih[0] }).where(eq(users.id, userId));
}

export async function toggleUserStatus(userId: string, currentStatus: string) {
  try {
    const session = await auth();
    if (!session?.user) throw new Error("Unauthorized");

    const callerRole = (session.user as any).role;
    if (callerRole !== "admin" && callerRole !== "super_admin") {
      throw new Error("Tidak memiliki akses");
    }
    if (session.user.id === userId) {
      throw new Error("Tidak dapat mengubah status akun sendiri");
    }

    const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!target) throw new Error("User tidak ditemukan");

    if (callerRole === "admin" && target.role === "super_admin") {
      throw new Error("Admin tidak dapat menangguhkan akun Super Admin");
    }
    if (callerRole === "admin" && target.role === "admin") {
      throw new Error("Admin tidak dapat menangguhkan akun Admin lain");
    }

    const newStatus = currentStatus === "suspended" ? "active" : "suspended";
    await db.update(users).set({ status: newStatus }).where(eq(users.id, userId));

    revalidatePath("/admin/users");
    return { success: true, message: `Status berhasil diubah menjadi ${newStatus === "active" ? "Aktif" : "Suspended"}` };
  } catch (error: any) {
    return { success: false, message: error.message || "Terjadi kesalahan" };
  }
}

/**
 * Ubah peran user. Saat NAIK jadi admin, unit wajib disertakan (minimal 1) —
 * tanpa unit, admin tak bisa mengelola apa pun, dan itu hampir pasti
 * kekeliruan. Saat TURUN jadi user biasa, unitnya ikut dilepas supaya tak
 * menyisakan hak akses yang menggantung.
 */
export async function changeUserRole(
  userId: string,
  newRole: "user" | "admin",
  units?: string[]
) {
  try {
    const session = await auth();
    if (!session?.user) throw new Error("Unauthorized");

    const callerRole = (session.user as any).role;
    if (callerRole !== "super_admin") {
      throw new Error("Hanya Super Admin yang dapat mengubah role");
    }
    if (session.user.id === userId) {
      throw new Error("Tidak dapat mengubah role akun sendiri");
    }

    const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!target) throw new Error("User tidak ditemukan");
    if (target.role === "super_admin") throw new Error("Tidak dapat mengubah role Super Admin lain");

    if (newRole === "admin") {
      // Wajib ada unitnya — kalau tak dikirim, pakai usulan unit_utama/department.
      const usul = units ?? (target.unitUtama ? [target.unitUtama] : target.department ? [target.department] : []);
      await simpanUnitAdmin(userId, usul);
    }

    await db.update(users).set({ role: newRole }).where(eq(users.id, userId));

    if (newRole === "user") {
      // Dilepas setelah peran berubah, bukan sebelumnya: kalau dilepas dulu
      // lalu update perannya gagal, admin itu tertinggal tanpa unit.
      await db.delete(userUnits).where(eq(userUnits.userId, userId));
    }

    revalidatePath("/admin/users");
    const action = newRole === "admin" ? "dipromosikan menjadi Admin" : "dikembalikan menjadi User";
    return { success: true, message: `User berhasil ${action}` };
  } catch (error: any) {
    return { success: false, message: error.message || "Terjadi kesalahan" };
  }
}

/**
 * Atur ulang daftar unit seorang admin (tambah/cabut) tanpa mengubah perannya.
 * Minimal 1 unit — superadmin tak boleh melucuti sendiri kewenangannya.
 */
export async function aturUnitAdmin(userId: string, units: string[]) {
  try {
    const session = await auth();
    if (!session?.user) throw new Error("Unauthorized");

    const callerRole = (session.user as any).role;
    if (callerRole !== "super_admin") {
      throw new Error("Hanya Super Admin yang dapat mengatur unit admin");
    }

    const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!target) throw new Error("User tidak ditemukan");
    if (target.role !== "admin") throw new Error("Akun ini bukan Admin — atur unit lewat promosi.");

    await simpanUnitAdmin(userId, units);

    revalidatePath("/admin/users");
    const nama = units.map((u) => normalizeUnit(u)).filter(Boolean);
    return {
      success: true,
      message: `Unit untuk "${target.name || target.email}" disimpan: ${nama.join(", ")}`,
    };
  } catch (error: any) {
    return { success: false, message: error.message || "Terjadi kesalahan" };
  }
}

export async function deleteUser(userId: string) {
  try {
    const session = await auth();
    if (!session?.user) throw new Error("Unauthorized");

    const callerRole = (session.user as any).role;
    if (callerRole !== "super_admin") {
      throw new Error("Hanya Super Admin yang dapat menghapus user");
    }
    if (session.user.id === userId) {
      throw new Error("Tidak dapat menghapus akun sendiri");
    }

    const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!target) throw new Error("User tidak ditemukan");
    if (target.role === "super_admin") throw new Error("Tidak dapat menghapus akun Super Admin lain");

    await db.update(transactions).set({ userId: null }).where(eq(transactions.userId, userId));
    await db.delete(users).where(eq(users.id, userId));

    revalidatePath("/admin/users");
    return { success: true, message: `Akun "${target.name || target.email}" berhasil dihapus. History transaksinya tetap tersimpan.` };
  } catch (error: any) {
    return { success: false, message: error.message || "Terjadi kesalahan" };
  }
}

/**
 * Buat akun native (admin atau user biasa) dengan username + password.
 * Menyimpan plain_password agar superadmin bisa melihatnya.
 * Hanya super_admin yang bisa membuat.
 */
export async function createNativeUser(data: {
  name: string;
  email: string;
  password: string;
  role: "admin" | "user";
  phone?: string;
  nim?: string;
  department?: string;
  units?: string[];
}) {
  try {
    const session = await auth();
    if (!session?.user) throw new Error("Unauthorized");

    const callerRole = (session.user as any).role;
    if (callerRole !== "super_admin") {
      throw new Error("Hanya Super Admin yang dapat membuat akun native");
    }

    const { name, email, password, role, phone, nim, department, units } = data;

    if (!name.trim() || !email.trim() || !password.trim()) {
      throw new Error("Nama, email, dan password wajib diisi");
    }
    if (password.length < 8) {
      throw new Error("Password minimal 8 karakter");
    }
    if (!["admin", "user"].includes(role)) {
      throw new Error("Role tidak valid");
    }

    // Admin tanpa unit tak bisa mengelola apa pun — tolak lebih awal, jangan
    // sampai terlanjur dibuat lalu menggantung tanpa kewenangan.
    if (role === "admin") {
      const daftar = [...new Set((units ?? []).map((u) => normalizeUnit(u)).filter(Boolean))];
      if (daftar.length === 0) {
        throw new Error("Admin wajib diberi minimal 1 unit pengelolaan.");
      }
      const asing = daftar.find((u) => !unitDikenal(u));
      if (asing) throw new Error(`Unit "${asing}" tidak ada di daftar unit.`);
    }

    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email.trim()))
      .limit(1);

    if (existing) throw new Error(`Email "${email}" sudah terdaftar`);

    const bcrypt = (await import("bcryptjs")).default;
    const hashedPassword = await bcrypt.hash(password, 10);

    // id tabel `user` berupa UUID (varchar), bukan auto-increment — jadi
    // dibuat di sini, bukan diambil dari hasil insert.
    const newId = crypto.randomUUID();

    await db.insert(users).values({
      id: newId,
      name: name.trim(),
      email: email.trim(),
      password: hashedPassword,
      plainPassword: encryptPassword(password), // enkripsi sebelum simpan
      phone: phone?.trim() || null,
      nim: nim?.trim() || null,
      department: department?.trim() || null,
      role,
      status: "active",
      emailVerified: new Date(),
    });

    if (role === "admin") await simpanUnitAdmin(newId, units);

    revalidatePath("/admin/users");
    const roleLabel = role === "admin" ? "Admin" : "User";
    return { success: true, message: `Akun ${roleLabel} native "${name.trim()}" berhasil dibuat` };
  } catch (error: any) {
    return { success: false, message: error.message || "Terjadi kesalahan" };
  }
}

// Alias untuk backward-compat dengan halaman create lama
export const createNativeAdmin = createNativeUser;

/**
 * Reset password akun native — generate password baru.
 * Hanya super_admin, hanya untuk akun yang punya password (native).
 */
export async function resetNativePassword(userId: string, newPassword: string) {
  try {
    const session = await auth();
    if (!session?.user) throw new Error("Unauthorized");

    const callerRole = (session.user as any).role;
    if (callerRole !== "super_admin") {
      throw new Error("Hanya Super Admin yang dapat mereset password");
    }

    if (!newPassword || newPassword.length < 8) {
      throw new Error("Password baru minimal 8 karakter");
    }

    const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!target) throw new Error("User tidak ditemukan");
    if (!target.password) throw new Error("Akun ini bukan akun native (tidak punya password)");
    if (target.role === "super_admin") throw new Error("Tidak dapat mereset password Super Admin lain");

    const bcrypt = (await import("bcryptjs")).default;
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await db.update(users).set({
      password: hashedPassword,
      plainPassword: encryptPassword(newPassword), // enkripsi sebelum simpan
    }).where(eq(users.id, userId));

    revalidatePath("/admin/users");
    return { success: true, message: `Password akun "${target.name || target.email}" berhasil direset` };
  } catch (error: any) {
    return { success: false, message: error.message || "Terjadi kesalahan" };
  }
}

/**
 * Dekripsi plain_password untuk ditampilkan di UI.
 * Hanya super_admin, hanya akun native.
 */
export async function getDecryptedPassword(userId: string): Promise<{ success: boolean; password?: string; message?: string }> {
  try {
    const session = await auth();
    if (!session?.user) throw new Error("Unauthorized");

    const callerRole = (session.user as any).role;
    if (callerRole !== "super_admin") {
      throw new Error("Hanya Super Admin yang dapat melihat password");
    }

    const [target] = await db
      .select({ plainPassword: users.plainPassword, password: users.password, name: users.name })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!target) throw new Error("User tidak ditemukan");
    if (!target.password) throw new Error("Akun ini bukan akun native");
    if (!target.plainPassword) return { success: true, password: "(tidak tersedia)" };

    // Dekripsi — handle backward-compat jika ada data lama yang belum terenkripsi
    let decrypted: string;
    if (isCipherText(target.plainPassword)) {
      decrypted = decryptPassword(target.plainPassword);
    } else {
      // Data lama (plain text) — enkripsi sekarang untuk update
      await db.update(users)
        .set({ plainPassword: encryptPassword(target.plainPassword) })
        .where(eq(users.id, userId));
      decrypted = target.plainPassword;
    }

    return { success: true, password: decrypted };
  } catch (error: any) {
    return { success: false, message: error.message || "Gagal mendekripsi password" };
  }
}
