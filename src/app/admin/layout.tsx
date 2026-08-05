"use client";

import type { ReactNode } from "react";
import { Sidebar } from "@/components/Sidebar";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect } from "react";

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, status } = useSession();
  const isLoginPage = pathname === "/admin/login";

  useEffect(() => {
    // Skip guard untuk halaman login
    if (isLoginPage) return;

    if (status === "unauthenticated") {
      router.replace("/admin/login");
      return;
    }

    if (status === "authenticated") {
      const role = (session?.user as any)?.role;
      if (role !== "admin" && role !== "super_admin") {
        router.replace("/dashboard");
      }
    }
  }, [status, session, router, isLoginPage]);

  // Halaman login — render langsung tanpa sidebar
  if (isLoginPage) {
    return <>{children}</>;
  }

  // Loading state
  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Belum/tidak terautentikasi — jangan tampilkan konten sama sekali
  if (status === "unauthenticated") {
    return null;
  }

  const role = (session?.user as any)?.role;

  // Bukan admin — jangan tampilkan konten
  if (role !== "admin" && role !== "super_admin") {
    return null;
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 lg:ml-64 min-h-screen">
        <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
