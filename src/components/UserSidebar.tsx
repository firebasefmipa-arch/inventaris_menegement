"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import {
  LayoutDashboard, ClipboardList, History,
  UserCircle, Menu, X, LogOut, ChevronRight, ClipboardCheck,
  Sun, Moon,
} from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { useToast } from "./Toaster";
import { useTheme } from "./ThemeProvider";
import clsx from "clsx";

export function UserSidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { data: session } = useSession();
  const { toast } = useToast();
  const { theme, toggleTheme } = useTheme();
  const [pendingDocs, setPendingDocs] = useState(0);

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
      <div className="hidden lg:flex flex-col items-start gap-1 px-4 py-4 border-b border-gray-100 dark:border-slate-700">
        <div className="w-full">
          <Image src="/fmipa-logo.png" alt="Logo FMIPA" width={180} height={60} className="object-contain mb-3" style={{ maxHeight: 60 }} />
        </div>
        <h1 className="font-bold text-base text-gray-900 dark:text-slate-100 leading-tight">Manajemen Inventaris</h1>
        <p className="text-sm text-gray-500 dark:text-slate-400">Peminjaman & Serah Terima</p>
      </div>

      {/* Mobile spacing */}
      <div className="lg:hidden h-14" />

      {/* User info */}
      {user && (
        <div className="mx-4 mt-4 p-3 bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/30 dark:to-purple-900/30 rounded-xl border border-indigo-100 dark:border-indigo-800">
          <div className="flex items-center gap-3">
            {user.image ? (
              <img src={user.image} alt={user.name || "User"}
                className="w-9 h-9 rounded-full object-cover ring-2 ring-white dark:ring-slate-700 shadow" />
            ) : (
              <div className="w-9 h-9 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-sm">
                {(user.name || "U")[0].toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-slate-100 truncate">{user.name || "Pengguna"}</p>
              <p className="text-xs text-gray-500 dark:text-slate-400 truncate">{user.department || "—"}</p>
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
                active
                  ? "bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 shadow-sm"
                  : "text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-100 hover:bg-gray-50 dark:hover:bg-slate-800"
              )}
            >
              <div className="relative shrink-0">
                <item.icon className={clsx("w-5 h-5",
                  active ? "text-indigo-600 dark:text-indigo-400" : "text-gray-400 dark:text-slate-500 group-hover:text-gray-600 dark:group-hover:text-slate-300")} />
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
              {(item as any).badge > 0 && !active && (
                <span className="text-[10px] font-bold text-red-500 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 px-1.5 py-0.5 rounded-full">
                  Perlu Aksi
                </span>
              )}
              {active && <ChevronRight className="w-4 h-4 text-indigo-400" />}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 space-y-2 border-t border-gray-100 dark:border-slate-700">
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="flex items-center justify-center gap-2 w-full px-3 py-2.5 rounded-xl text-sm font-medium text-gray-600 dark:text-slate-300 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 transition-all"
        >
          {theme === "dark"
            ? <><Sun className="w-4 h-4 text-yellow-500" /> Mode Terang</>
            : <><Moon className="w-4 h-4 text-indigo-500" /> Mode Gelap</>
          }
        </button>
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
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700 px-4 py-3 flex items-center justify-between">
        <Link href="/dashboard" className="flex items-center gap-2">
          <Image src="/fmipa-logo.png" alt="Logo FMIPA" width={32} height={32} className="rounded-lg object-contain" />
          <span className="font-bold text-gray-900 dark:text-slate-100">Manajemen Inventaris</span>
        </Link>
        <div className="flex items-center gap-1">
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-500 dark:text-slate-400"
            title={theme === "dark" ? "Mode Terang" : "Mode Gelap"}
          >
            {theme === "dark" ? <Sun className="w-4 h-4 text-yellow-500" /> : <Moon className="w-4 h-4" />}
          </button>
          {pendingDocs > 0 && (
            <Link href="/dashboard/riwayat"
              className="relative p-2 text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-100"
              title={`${pendingDocs} dokumen perlu diupload`}>
              <History className="w-5 h-5" />
              <span className="absolute top-0 right-0 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                {pendingDocs > 9 ? "9+" : pendingDocs}
              </span>
            </Link>
          )}
          <button onClick={() => setMobileOpen(!mobileOpen)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-700 dark:text-slate-300">
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
        "fixed top-0 left-0 z-40 h-full w-64 bg-white dark:bg-slate-900 border-r border-gray-200 dark:border-slate-700 shadow-sm transition-transform duration-300",
        "lg:translate-x-0",
        mobileOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <SidebarContent />
      </aside>
    </>
  );
}
