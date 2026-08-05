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

  if (!session?.user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const user = session.user as any;
  const role = user.role;

  // Admin / super_admin → dashboard admin
  if (role === "admin" || role === "super_admin") {
    return NextResponse.redirect(new URL("/admin", req.url));
  }

  // Profil belum lengkap → complete profile
  if (!user.phone || !user.department) {
    return NextResponse.redirect(new URL("/register/complete", req.url));
  }

  // User biasa → halaman pinjam
  return NextResponse.redirect(new URL("/dashboard/pinjam", req.url));
}
