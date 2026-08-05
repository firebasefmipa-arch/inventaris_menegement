import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";

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

  if (!session?.user) {
    return NextResponse.redirect(new URL("/login", base));
  }

  const user = session.user as any;
  const role = user.role;

  // Admin / super_admin → dashboard admin
  if (role === "admin" || role === "super_admin") {
    return NextResponse.redirect(new URL("/admin", base));
  }

  // Profil belum lengkap → complete profile
  if (!user.phone || !user.department) {
    return NextResponse.redirect(new URL("/register/complete", base));
  }

  // User biasa → halaman pinjam
  return NextResponse.redirect(new URL("/dashboard/pinjam", base));
}
