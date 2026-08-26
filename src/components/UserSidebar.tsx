"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import {
  LayoutDashboard, ClipboardList, History,
  UserCircle, Menu, X, LogOut, ChevronRight, ClipboardCheck,
} from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { useToast } from "./Toaster";
import clsx from "clsx";

export function UserSidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { data: session } = useSession();
  const { toast } = useToast();
  const [pendingDocs, setPendingDocs] = useState(0);

  // Fetch jumlah transaksi yang butuh upload dokumen
  useEffect(() => {
    let cancelled = false;
    const fetchPending = async () => {
      try {
        const res = await fetch("/api/user/transactions/summary");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setPendingDocs(data.pendingSignature ?? 0);
      } catch { /* silent */ }
    };
    fetchPending();
    // Re-fetch setiap 30 detik agar badge ter-update
    const interval = setInterval(fetchPending, 30_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const handleLogout = async () => {
    try {
      await signOut({ callbackUrl: "/" });
    } catch {
      toast("Gagal logout", "error");
    }
  };

  const isActive = (href: string, exact = false) => {
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(href + "/");
  };

  const user = session?.user as any;

  const navItems = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, exact: true },
    { href: "/dashboard/pinjam", label: "Pinjam Barang", icon: ClipboardList },
    { href: "/dashboard/serah-terima", label: "Serah Terima", icon: ClipboardCheck },
    {
      href: "/dashboard/riwayat",
      label: "Riwayat",
      icon: History,
      badge: pendingDocs > 0 ? pendingDocs : 0,
      badgeTitle: "Dokumen belum diupload",
    },
    { href: "/dashboard/profil", label: "Profil Saya", icon: UserCircle },
  ];

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="hidden lg:flex items-center gap-3 px-6 py-5 border-b border-gray-100">
        <Image src="/fmipa-logo.png" alt="Logo FMIPA" width={36} height={36} className="rounded-xl object-contain" />
        <div>
          <h1 className="font-bold text-lg text-gray-900">Manajemen Inventaris</h1>
          <p className="text-xs text-gray-500">Portal Mahasiswa</p>
        </div>
      </div>

      {/* Mobile spacing */}
      <div className="lg:hidden h-14" />

      {/* User info */}
      {user && (
        <div className="mx-4 mt-4 p-3 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl border border-indigo-100">
          <div className="flex items-center gap-3">
            {user.image ? (
              <img src={user.image} alt={user.name || "User"}
                className="w-9 h-9 rounded-full object-cover ring-2 ring-white shadow" />
            ) : (
              <div className="w-9 h-9 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-sm">
                {(user.name || "U")[0].toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{user.name || "Pengguna"}</p>
              <p className="text-xs text-gray-500 truncate">{user.department || "—"}</p>
            </div>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="p-4 space-y-1 flex-1 mt-2">
        {navItems.map((item) => {
          const active = isActive(item.href, item.exact);
          return (
            <Link key={item.href} href={item.href}
              onClick={() => setMobileOpen(false)}
              className={clsx(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group",
                active ? "bg-indigo-50 text-indigo-700 shadow-sm" : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
              )}
            >
              <div className="relative shrink-0">
                <item.icon className={clsx("w-5 h-5",
                  active ? "text-indigo-600" : "text-gray-400 group-hover:text-gray-600")} />
                {/* Badge notifikasi */}
                {(item as any).badge > 0 && (
                  <span
                    title={(item as any).badgeTitle}
                    className="absolute -top-2 -right-2 min-w-[16px] h-4 px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse shadow-sm"
                  >
                    {(item as any).badge > 9 ? "9+" : (item as any).badge}
                  </span>
                )}
              </div>
              <span className="flex-1">{item.label}</span>
              {/* Label peringatan jika ada pending dokumen */}
              {(item as any).badge > 0 && !active && (
                <span className="text-[10px] font-bold text-red-500 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-full">
                  Perlu Aksi
                </span>
              )}
              {active && <ChevronRight className="w-4 h-4 text-indigo-400" />}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 space-y-2 border-t border-gray-100">
        <button
          onClick={handleLogout}
          className="flex items-center justify-center gap-2 w-full px-3 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-500 hover:bg-red-600 shadow-sm transition-all"
        >
          <LogOut className="w-4 h-4" /> Keluar
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <Link href="/dashboard" className="flex items-center gap-2">
          <Image src="/fmipa-logo.png" alt="Logo FMIPA" width={32} height={32} className="rounded-lg object-contain" />
          <span className="font-bold text-gray-900">Manajemen Inventaris</span>
        </Link>
        <div className="flex items-center gap-2">
          {/* Badge mobile di header */}
          {pendingDocs > 0 && (
            <Link href="/dashboard/riwayat"
              className="relative p-2 text-gray-600 hover:text-gray-900"
              title={`${pendingDocs} dokumen perlu diupload`}>
              <History className="w-5 h-5" />
              <span className="absolute top-0 right-0 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                {pendingDocs > 9 ? "9+" : pendingDocs}
              </span>
            </Link>
          )}
          <button onClick={() => setMobileOpen(!mobileOpen)} className="p-2 rounded-lg hover:bg-gray-100">
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-30 bg-black/40 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={clsx(
        "fixed top-0 left-0 z-40 h-full w-64 bg-white border-r border-gray-200 shadow-sm transition-transform duration-300",
        "lg:translate-x-0",
        mobileOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <SidebarContent />
      </aside>
    </>
  );
}
