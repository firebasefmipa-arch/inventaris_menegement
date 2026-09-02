import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { bp } from "@/lib/basepath";

export async function proxy(req: NextRequest) {
  const { nextUrl } = req;
  const pathname = nextUrl.pathname;

  // Strip basePath dari pathname agar logic di bawah tetap berjalan
  // dengan path relatif (tanpa prefix /inventaris)
  const BASE = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const strippedPath = BASE && pathname.startsWith(BASE)
    ? pathname.slice(BASE.length) || "/"
    : pathname;

  const isAdminLogin     = strippedPath === "/admin/login";
  const isAdminRoute     = strippedPath.startsWith("/admin") && !isAdminLogin;
  const isUserDashboard  = strippedPath.startsWith("/dashboard");
  const isCompleteProfile = strippedPath.startsWith("/register/complete");

  const isHttps = process.env.NEXTAUTH_URL?.startsWith("https://");

  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
    secureCookie: isHttps,
    cookieName: isHttps
      ? "__Secure-authjs.session-token"
      : "authjs.session-token",
  });

  const role = token?.role as string | undefined;
  const isLoggedIn = !!token;

  // ── /admin/login: sudah login sbg admin → ke /admin ──
  if (isAdminLogin) {
    if (isLoggedIn && (role === "super_admin" || role === "admin")) {
      return NextResponse.redirect(new URL(bp("/admin"), nextUrl.origin));
    }
    return NextResponse.next();
  }

  // ── /admin/*: wajib admin/super_admin ──
  if (isAdminRoute) {
    if (!isLoggedIn) {
      const url = new URL(bp("/admin/login"), nextUrl.origin);
      url.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(url);
    }
    if (role !== "admin" && role !== "super_admin") {
      return NextResponse.redirect(new URL(bp("/dashboard"), nextUrl.origin));
    }
    const response = NextResponse.next();
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    response.headers.set("Pragma", "no-cache");
    return response;
  }

  // ── /dashboard/*: wajib login ──
  if (isUserDashboard) {
    if (!isLoggedIn) {
      const url = new URL(bp("/login"), nextUrl.origin);
      url.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(url);
    }
    const profileComplete = token?.phone && token?.department;
    if (!profileComplete && !isCompleteProfile) {
      return NextResponse.redirect(new URL(bp("/register/complete"), nextUrl.origin));
    }
  }

  return NextResponse.next();
}

// Matcher static — Next.js otomatis strip basePath sebelum matching
// jadi tidak perlu prefix /inventaris di sini
export const config = {
  matcher: [
    "/admin/:path*",
    "/dashboard/:path*",
    "/register/complete/:path*",
  ],
};
