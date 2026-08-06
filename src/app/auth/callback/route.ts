import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * Route ini dipanggil setelah Google OAuth selesai.
 * Tugasnya: baca role dari session (yang sudah di-refresh dari DB),
 * lalu redirect ke halaman yang benar.
 */
export async function GET(req: NextRequest) {
  const session = await auth();

  // Gunakan NEXTAUTH_URL sebagai base agar tidak redirect ke localhost
  const base = process.env.NEXTAUTH_URL || `https://${req.headers.get("host")}`;

  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/login", base));
  }

  // Baca langsung dari DB — jangan andalkan token JWT yang mungkin stale
  const [dbUser] = await db
    .select({
      role: users.role,
      phone: users.phone,
      department: users.department,
    })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  if (!dbUser) {
    return NextResponse.redirect(new URL("/login", base));
  }

  const { role, phone, department } = dbUser;

  // Admin / super_admin → dashboard admin
  if (role === "admin" || role === "super_admin") {
    return NextResponse.redirect(new URL("/admin", base));
  }

  // Profil belum lengkap → complete profile
  if (!phone || !department) {
    return NextResponse.redirect(new URL("/register/complete", base));
  }

  // User biasa → halaman pinjam
  return NextResponse.redirect(new URL("/dashboard/pinjam", base));
}
