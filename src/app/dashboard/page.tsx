"use client";

import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  ClipboardList,
  History,
  UserCircle,
  ArrowRight,
  PackageCheck,
  Clock,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import { useEffect, useState } from "react";

type TransactionSummary = {
  total: number;
  active: number;
  pending: number;
  overdue: number;
};

export default function DashboardPage() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const [summary, setSummary] = useState<TransactionSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(true);

  useEffect(() => {
    fetch("/api/user/transactions/summary")
      .then((r) => r.json())
      .then((data) => setSummary(data))
      .catch(() => setSummary({ total: 0, active: 0, pending: 0, overdue: 0 }))
      .finally(() => setLoadingSummary(false));
  }, []);

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Selamat pagi";
    if (hour < 15) return "Selamat siang";
    if (hour < 18) return "Selamat sore";
    return "Selamat malam";
  };

  const quickLinks = [
    {
      href: "/dashboard/pinjam",
      icon: ClipboardList,
      label: "Pinjam Barang",
      desc: "Ajukan peminjaman barang baru",
      gradient: "from-indigo-500 to-purple-600",
      bg: "bg-indigo-50",
      text: "text-indigo-700",
    },
    {
      href: "/dashboard/riwayat",
      icon: History,
      label: "Riwayat",
      desc: "Lihat semua peminjaman kamu",
      gradient: "from-emerald-500 to-teal-600",
      bg: "bg-emerald-50",
      text: "text-emerald-700",
    },
    {
      href: "/dashboard/profil",
      icon: UserCircle,
      label: "Profil Saya",
      desc: "Update data diri kamu",
      gradient: "from-amber-500 to-orange-500",
      bg: "bg-amber-50",
      text: "text-amber-700",
    },
  ];

  return (
    <div className="space-y-8">
      {/* Welcome Banner */}
      <div className="relative bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl p-6 sm:p-8 overflow-hidden text-white">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute -top-8 -right-8 w-48 h-48 rounded-full bg-white" />
          <div className="absolute -bottom-12 -left-8 w-64 h-64 rounded-full bg-white" />
        </div>
        <div className="relative">
          <div className="flex items-center gap-2 text-indigo-200 text-sm mb-2">
            <Sparkles className="w-4 h-4" />
            <span>Dashboard Pengguna</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold">
            {greeting()}, {user?.name?.split(" ")[0] || "Pengguna"}!
          </h1>
          <p className="mt-2 text-indigo-200 text-sm">
            {user?.department ? `${user.department} • ` : ""}
            {user?.email}
          </p>
          <Link
            href="/dashboard/pinjam"
            className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 bg-white text-indigo-700 rounded-xl text-sm font-semibold hover:bg-indigo-50 transition-colors shadow-sm"
          >
            Pinjam Sekarang
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          {
            icon: PackageCheck,
            label: "Total Peminjaman",
            value: loadingSummary ? "..." : summary?.total ?? 0,
            color: "text-indigo-600",
            bg: "bg-indigo-50",
          },
          {
            icon: Clock,
            label: "Sedang Dipinjam",
            value: loadingSummary ? "..." : summary?.active ?? 0,
            color: "text-emerald-600",
            bg: "bg-emerald-50",
          },
          {
            icon: ClipboardList,
            label: "Menunggu Proses",
            value: loadingSummary ? "..." : summary?.pending ?? 0,
            color: "text-amber-600",
            bg: "bg-amber-50",
          },
          {
            icon: AlertCircle,
            label: "Terlambat",
            value: loadingSummary ? "..." : summary?.overdue ?? 0,
            color: "text-red-600",
            bg: "bg-red-50",
          },
        ].map(({ icon: Icon, label, value, color, bg }) => (
          <div key={label} className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <div className={`w-10 h-10 ${bg} rounded-xl flex items-center justify-center mb-3`}>
              <Icon className={`w-5 h-5 ${color}`} />
            </div>
            <p className="text-2xl font-bold text-gray-900">{value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Quick Links */}
      <div>
        <h2 className="text-lg font-bold text-gray-900 mb-4">Menu Utama</h2>
        <div className="grid sm:grid-cols-3 gap-4">
          {quickLinks.map(({ href, icon: Icon, label, desc, gradient, bg, text }) => (
            <Link
              key={href}
              href={href}
              className="group bg-white rounded-2xl border border-gray-100 p-6 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
            >
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center mb-4 shadow-lg group-hover:scale-105 transition-transform`}>
                <Icon className="w-6 h-6 text-white" />
              </div>
              <h3 className="font-bold text-gray-900">{label}</h3>
              <p className="text-xs text-gray-500 mt-1">{desc}</p>
              <div className={`mt-3 inline-flex items-center gap-1 text-xs font-semibold ${text}`}>
                Buka <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Info Banner */}
      <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5 flex gap-4">
        <AlertCircle className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-blue-800">Cara Meminjam Barang</p>
          <p className="text-xs text-blue-600 mt-1 leading-relaxed">
            Buka menu <strong>Pinjam Barang</strong>, pilih barang yang diinginkan, isi data, lalu submit. 
            Admin akan memproses permintaanmu dan menghubungimu untuk pengambilan barang.
          </p>
        </div>
      </div>
    </div>
  );
}
