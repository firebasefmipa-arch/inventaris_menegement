"use client";

import type { ReactNode } from "react";
import { UserSidebar } from "@/components/UserSidebar";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
      return;
    }

    if (status === "authenticated" && session) {
      const role = (session.user as any).role;
      // Admin yang nyasar ke /dashboard → kirim ke /admin
      if (role === "admin" || role === "super_admin") {
        router.replace("/admin");
      }
    }
  }, [status, session, router]);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) return null;

  // Jangan render konten dashboard user untuk admin
  const role = (session.user as any).role;
  if (role === "admin" || role === "super_admin") return null;

  return (
    <div className="flex min-h-screen bg-gray-50">
      <UserSidebar />
      <main className="flex-1 lg:ml-64 min-h-screen">
        <div className="pt-16 lg:pt-6 p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
