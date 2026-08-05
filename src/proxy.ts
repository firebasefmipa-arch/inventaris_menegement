import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export async function proxy(req: NextRequest) {
  const { nextUrl } = req;
  const pathname = nextUrl.pathname;

  const isAdminLogin = pathname === "/admin/login";
  const isAdminRoute = pathname.startsWith("/admin") && !isAdminLogin;
  const isUserDashboard = pathname.startsWith("/dashboard");
  const isCompleteProfile = pathname.startsWith("/register/complete");

  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  });

  const role = token?.role as string | undefined;
  const isLoggedIn = !!token;

  // ── /admin/login: sudah login sbg admin → ke /admin ──
  if (isAdminLogin) {
    if (isLoggedIn && (role === "super_admin" || role === "admin")) {
      return NextResponse.redirect(new URL("/admin", nextUrl.origin));
    }
    return NextResponse.next();
  }

  // ── /admin/*: wajib admin/super_admin ──
  if (isAdminRoute) {
    if (!isLoggedIn) {
      const url = new URL("/admin/login", nextUrl.origin);
      url.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(url);
    }
    if (role !== "admin" && role !== "super_admin") {
      return NextResponse.redirect(new URL("/dashboard", nextUrl.origin));
    }
    // Tambahkan header agar browser tidak cache halaman admin
    const response = NextResponse.next();
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    response.headers.set("Pragma", "no-cache");
    return response;
  }

  // ── /dashboard/*: wajib login ──
  if (isUserDashboard) {
    if (!isLoggedIn) {
      const url = new URL("/login", nextUrl.origin);
      url.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(url);
    }
    const profileComplete = token?.phone && token?.department;
    if (!profileComplete && !isCompleteProfile) {
      return NextResponse.redirect(new URL("/register/complete", nextUrl.origin));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/dashboard/:path*",
    "/register/complete/:path*",
  ],
};
