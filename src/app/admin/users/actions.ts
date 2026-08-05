"use server";

import { db } from "@/db";
import { users, transactions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";

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

    // Ambil data target user
    const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!target) throw new Error("User tidak ditemukan");

    // Admin biasa TIDAK bisa suspend super_admin
    if (callerRole === "admin" && target.role === "super_admin") {
      throw new Error("Admin tidak dapat menangguhkan akun Super Admin");
    }
    // Admin biasa tidak bisa suspend admin lain
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

export async function changeUserRole(userId: string, newRole: "user" | "admin") {
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

    await db.update(users).set({ role: newRole }).where(eq(users.id, userId));

    revalidatePath("/admin/users");
    const action = newRole === "admin" ? "dipromosikan menjadi Admin" : "dikembalikan menjadi User";
    return { success: true, message: `User berhasil ${action}` };
  } catch (error: any) {
    return { success: false, message: error.message || "Terjadi kesalahan" };
  }
}

/**
 * Hapus user (tanpa hapus history transaksinya).
 * userId di transactions akan menjadi NULL (SET NULL).
 * Hanya super_admin.
 */
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

    // Set userId di transactions menjadi NULL agar history tetap ada
    await db.update(transactions).set({ userId: null }).where(eq(transactions.userId, userId));

    // Hapus user (accounts & sessions ikut terhapus via cascade di DB)
    await db.delete(users).where(eq(users.id, userId));

    revalidatePath("/admin/users");
    return { success: true, message: `Akun "${target.name || target.email}" berhasil dihapus. History transaksinya tetap tersimpan.` };
  } catch (error: any) {
    return { success: false, message: error.message || "Terjadi kesalahan" };
  }
}

/**
 * Hapus semua history transaksi milik user tertentu.
 * Hanya super_admin.
 */
export async function deleteUserTransactions(userId: string) {
  try {
    const session = await auth();
    if (!session?.user) throw new Error("Unauthorized");

    const callerRole = (session.user as any).role;
    if (callerRole !== "super_admin") {
      throw new Error("Hanya Super Admin yang dapat menghapus history transaksi");
    }

    const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!target) throw new Error("User tidak ditemukan");

    const deleted = await db.delete(transactions).where(eq(transactions.userId, userId));

    revalidatePath("/admin/users");
    revalidatePath("/admin/transactions");
    return { success: true, message: `History transaksi "${target.name || target.email}" berhasil dihapus` };
  } catch (error: any) {
    return { success: false, message: error.message || "Terjadi kesalahan" };
  }
}

/**
 * Buat akun admin native (username + password).
 * Akun ini bisa login di /admin/login tanpa Google OAuth.
 * Hanya super_admin yang bisa membuat.
 */
export async function createNativeAdmin(data: {
  name: string;
  email: string;
  password: string;
  phone?: string;
  department?: string;
}) {
  try {
    const session = await auth();
    if (!session?.user) throw new Error("Unauthorized");

    const callerRole = (session.user as any).role;
    if (callerRole !== "super_admin") {
      throw new Error("Hanya Super Admin yang dapat membuat akun Admin native");
    }

    const { name, email, password, phone, department } = data;

    if (!name.trim() || !email.trim() || !password.trim()) {
      throw new Error("Nama, email, dan password wajib diisi");
    }
    if (password.length < 8) {
      throw new Error("Password minimal 8 karakter");
    }

    // Cek email sudah dipakai
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email.trim()))
      .limit(1);

    if (existing) throw new Error(`Email "${email}" sudah terdaftar`);

    // Hash password dengan bcrypt
    const bcrypt = (await import("bcryptjs")).default;
    const hashedPassword = await bcrypt.hash(password, 10);

    await db.insert(users).values({
      name: name.trim(),
      email: email.trim(),
      password: hashedPassword,
      phone: phone?.trim() || null,
      department: department?.trim() || null,
      role: "admin",
      status: "active",
      emailVerified: new Date(),
    });

    revalidatePath("/admin/users");
    return { success: true, message: `Akun Admin "${name.trim()}" berhasil dibuat` };
  } catch (error: any) {
    return { success: false, message: error.message || "Terjadi kesalahan" };
  }
}
