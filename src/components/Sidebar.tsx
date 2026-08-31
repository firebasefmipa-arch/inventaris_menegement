"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import {
  LayoutDashboard,
  Package,
  ArrowLeftRight,
  Users,
  Menu,
  X,
  Lightbulb,
  LogOut,
  ShieldCheck,
  Shield,
  ClipboardCheck,
  FileArchive,
  Sun,
  Moon,
} from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { useToast } from "./Toaster";
import { useTheme } from "./ThemeProvider";
import clsx from "clsx";

const navItems = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/items", label: "Daftar Barang", icon: Package },
  { href: "/admin/transactions", label: "Peminjaman", icon: ArrowLeftRight },
  { href: "/admin/handovers", label: "Serah Terima", icon: ClipboardCheck },
  { href: "/admin/documents", label: "Dokumen", icon: FileArchive },
  { href: "/admin/users", label: "Daftar Pengguna", icon: Users },
];

export function Sidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const { toast } = useToast();
  const { data: session } = useSession();
  const { theme, toggleTheme } = useTheme();
  const role = (session?.user as any)?.role;

  const handleLogout = async () => {
    try {
      await signOut({ redirectTo: "/admin/login" });
    } catch {
      toast("Gagal logout", "error");
    }
  };

  return (
    <>
      {/* Logout Confirm Modal */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowLogoutConfirm(false)} />
          <div className="relative bg-white dark:bg-[#162035] rounded-2xl shadow-2xl border border-gray-100 dark:border-[#1c2e48] p-6 w-full max-w-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                <LogOut className="w-5 h-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 dark:text-slate-100">Konfirmasi Logout</h3>
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">Yakin ingin keluar dari panel admin?</p>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-gray-100 dark:bg-[#101e33] text-gray-700 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-[#1c2e48] transition-colors"
              >
                Batal
              </button>
              <button
                onClick={handleLogout}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors"
              >
                Ya, Logout
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700 px-4 py-3 flex items-center justify-between">
        <Link href="/admin" className="flex items-center gap-2">
          <Image src="/fmipa-logo.png" alt="Logo FMIPA" width={32} height={32} className="rounded-lg object-contain" />
          <span className="font-bold text-gray-900 dark:text-slate-100">Manajemen Inventaris</span>
        </Link>
        <div className="flex items-center gap-1">
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-500 dark:text-slate-400"
            title={theme === "dark" ? "Mode Terang" : "Mode Gelap"}
          >
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-700 dark:text-slate-300"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-30 bg-black/40 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={clsx(
          "fixed top-0 left-0 z-40 h-full w-64 bg-white dark:bg-slate-900 border-r border-gray-200 dark:border-slate-700 shadow-sm transition-transform duration-300",
          "lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Logo header desktop */}
        <div className="hidden lg:flex flex-col items-start gap-1 px-4 py-4 border-b border-gray-100 dark:border-slate-700/50">
          <div className="w-full bg-white dark:bg-white/90 rounded-xl px-3 py-2 shadow-sm">
            <Image src="/fmipa-logo.png" alt="Logo FMIPA" width={180} height={60} className="object-contain w-full" style={{ maxHeight: 56 }} />
          </div>
          <h1 className="font-bold text-base text-gray-900 dark:text-slate-100 leading-tight mt-2">Manajemen Inventaris</h1>
          <p className="text-sm text-gray-500 dark:text-slate-400">Peminjaman & Serah Terima</p>
        </div>

        {/* Mobile spacing */}
        <div className="lg:hidden h-14" />

        {/* Navigation */}
        <nav className="p-4 space-y-1">
          {navItems.map((item) => {
            const bestMatch = navItems.reduce((best, nav) => {
              if (pathname === nav.href || pathname.startsWith(nav.href + "/")) {
                if (!best || nav.href.length > best.href.length) return nav;
              }
              return best;
            }, null as typeof navItems[0] | null);

            const isActive = bestMatch?.href === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={clsx(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 shadow-sm"
                    : "text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-100 hover:bg-gray-50 dark:hover:bg-slate-800"
                )}
              >
                <item.icon
                  className={clsx(
                    "w-5 h-5",
                    isActive ? "text-indigo-600 dark:text-indigo-400" : "text-gray-400 dark:text-slate-500"
                  )}
                />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="absolute bottom-0 left-0 right-0 p-4 space-y-3 border-t border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-900">
          {/* Role badge */}
          {role === "super_admin" && (
            <div className="bg-gradient-to-r from-purple-500 to-indigo-600 text-white rounded-xl p-3 shadow-lg">
              <div className="flex items-center gap-2 mb-1">
                <ShieldCheck className="w-4 h-4" />
                <span className="text-xs font-bold uppercase tracking-wide">Super Admin</span>
              </div>
              <p className="text-[10px] text-purple-100">Anda memiliki akses penuh ke semua fitur</p>
            </div>
          )}
          {role === "admin" && (
            <div className="bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-1">
                <Shield className="w-4 h-4" />
                <span className="text-xs font-bold uppercase tracking-wide">Admin</span>
              </div>
              <p className="text-[10px] text-indigo-600 dark:text-indigo-400">Anda dapat mengelola barang dan transaksi</p>
            </div>
          )}

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
            onClick={() => setShowLogoutConfirm(true)}
            className="flex items-center justify-center gap-2 w-full px-3 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 shadow-lg shadow-red-500/25 hover:shadow-red-500/40 hover:opacity-95 transition-all"
          >
            <LogOut className="w-4 h-4" />
            Logout Admin
          </button>

          <div className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/30 dark:to-purple-900/30 rounded-xl p-4">
            <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 mb-1 flex items-center gap-1.5">
              <Lightbulb className="w-3.5 h-3.5" />
              Tips
            </p>
            <p className="text-xs text-indigo-600/80 dark:text-indigo-400">
              Pastikan selalu update status pengembalian barang setelah selesai digunakan.
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}
