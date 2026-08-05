import { db } from "@/db";
import { items, transactions } from "@/db/schema";
import { eq, sql, count } from "drizzle-orm";
import {
  Package,
  ArrowLeftRight,
  Clock,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Boxes,
} from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { id } from "date-fns/locale";

export const dynamic = "force-dynamic";

async function getStats() {
  // ── 3 query paralel menggantikan 7 query serial ──
  const [itemStats, transactionStats, recentTransactions] = await Promise.all([
    // Query 1: semua stats items sekaligus dengan conditional count
    db.select({
      total:     count(),
      available: count(sql`CASE WHEN ${items.status} = 'available' THEN 1 END`),
      borrowed:  count(sql`CASE WHEN ${items.status} = 'borrowed'  THEN 1 END`),
      category:  items.category,
    })
    .from(items)
    .groupBy(items.category),

    // Query 2: stats transaksi sekaligus
    db.select({
      active:  count(sql`CASE WHEN ${transactions.status} = 'active' THEN 1 END`),
      overdue: count(sql`CASE WHEN ${transactions.status} = 'active' AND ${transactions.expectedReturnDate} < NOW() THEN 1 END`),
    })
    .from(transactions),

    // Query 3: 5 transaksi terbaru
    db.select({
      id:           transactions.id,
      status:       transactions.status,
      borrowDate:   transactions.borrowDate,
      quantity:     transactions.quantity,
      itemName:     items.name,
      borrowerName: transactions.borrowerName,
    })
    .from(transactions)
    .leftJoin(items, eq(transactions.itemId, items.id))
    .orderBy(sql`${transactions.createdAt} DESC`)
    .limit(5),
  ]);

  // Agregasi hasil query 1
  const totalItems     = itemStats.reduce((s, r) => s + Number(r.total),     0);
  const availableItems = itemStats.reduce((s, r) => s + Number(r.available), 0);
  const borrowedItems  = itemStats.reduce((s, r) => s + Number(r.borrowed),  0);

  const categories = itemStats.reduce((acc, r) => {
    acc[r.category] = (acc[r.category] ?? 0) + Number(r.total);
    return acc;
  }, {} as Record<string, number>);

  const activeTransactions  = Number(transactionStats[0]?.active  ?? 0);
  const overdueTransactions = Number(transactionStats[0]?.overdue ?? 0);

  return {
    totalItems,
    availableItems,
    borrowedItems,
    activeTransactions,
    overdueTransactions,
    categories,
    recentTransactions,
  };
}

export default async function HomePage() {
  const stats = await getStats();

  const statCards = [
    {
      label: "Total Barang",
      value: stats.totalItems,
      icon: Package,
      color: "from-blue-500 to-blue-600",
      bg: "bg-blue-50",
      iconColor: "text-blue-600",
      href: "/admin/items",
    },
    {
      label: "Barang Tersedia",
      value: stats.availableItems,
      icon: CheckCircle2,
      color: "from-emerald-500 to-emerald-600",
      bg: "bg-emerald-50",
      iconColor: "text-emerald-600",
      href: "/admin/items?status=available",
    },
    {
      label: "Sedang Dipinjam",
      value: stats.borrowedItems,
      icon: Boxes,
      color: "from-amber-500 to-amber-600",
      bg: "bg-amber-50",
      iconColor: "text-amber-600",
      href: "/admin/items?status=borrowed",
    },
    {
      label: "Transaksi Aktif",
      value: stats.activeTransactions,
      icon: ArrowLeftRight,
      color: "from-rose-500 to-rose-600",
      bg: "bg-rose-50",
      iconColor: "text-rose-600",
      href: "/admin/transactions?status=active",
    },
    {
      label: "Terlambat",
      value: stats.overdueTransactions,
      icon: AlertTriangle,
      color: "from-red-500 to-red-600",
      bg: "bg-red-50",
      iconColor: "text-red-600",
      href: "/admin/transactions?status=overdue",
    },
  ];

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="pt-12 lg:pt-0">
        <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
        <p className="text-gray-500 mt-1">
          Ringkasan peminjaman barang hari ini
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {statCards.map((card) => (
          <Link
            key={card.label}
            href={card.href}
            className="group relative bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:shadow-md hover:border-gray-200 transition-all duration-200"
          >
            <div className={`w-10 h-10 ${card.bg} rounded-xl flex items-center justify-center mb-3`}>
              <card.icon className={`w-5 h-5 ${card.iconColor}`} />
            </div>
            <p className="text-2xl font-bold text-gray-900">{card.value}</p>
            <p className="text-xs text-gray-500 mt-1">{card.label}</p>
          </Link>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Recent Transactions */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-lg font-semibold text-gray-900">
              Transaksi Terbaru
            </h3>
            <Link
              href="/admin/transactions"
              className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
            >
              Lihat semua →
            </Link>
          </div>
          <div className="space-y-4">
            {stats.recentTransactions.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-8">
                Belum ada transaksi
              </p>
            ) : (
              stats.recentTransactions.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center gap-4 p-3 rounded-xl hover:bg-gray-50 transition-colors"
                >
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      tx.status === "returned"  ? "bg-emerald-100"
                      : tx.status === "active"  ? "bg-amber-100"
                      : tx.status === "overdue" ? "bg-red-100"
                      : tx.status === "rejected"? "bg-red-100"
                      : "bg-blue-100"           // pending_signature / pending_approval
                    }`}
                  >
                    {tx.status === "returned" ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    ) : tx.status === "active" ? (
                      <Clock className="w-4 h-4 text-amber-600" />
                    ) : tx.status === "overdue" ? (
                      <AlertTriangle className="w-4 h-4 text-red-600" />
                    ) : tx.status === "rejected" ? (
                      <AlertTriangle className="w-4 h-4 text-red-600" />
                    ) : (
                      <Clock className="w-4 h-4 text-blue-600" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {tx.itemName}
                    </p>
                    <p className="text-xs text-gray-500">
                      {tx.borrowerName} • {tx.quantity} unit
                    </p>
                  </div>
                  <div className="text-right">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        tx.status === "returned"          ? "bg-emerald-100 text-emerald-700"
                        : tx.status === "active"          ? "bg-amber-100 text-amber-700"
                        : tx.status === "overdue"         ? "bg-red-100 text-red-700"
                        : tx.status === "rejected"        ? "bg-red-100 text-red-700"
                        : tx.status === "pending_approval"? "bg-blue-100 text-blue-700"
                        : "bg-gray-100 text-gray-700"     // pending_signature
                      }`}
                    >
                      {tx.status === "returned"           ? "Dikembalikan"
                        : tx.status === "active"          ? "Dipinjam"
                        : tx.status === "overdue"         ? "Terlambat"
                        : tx.status === "rejected"        ? "Ditolak"
                        : tx.status === "pending_approval"? "Menunggu Persetujuan"
                        : "Menunggu TTD"}
                    </span>
                    <p className="text-xs text-gray-400 mt-1">
                      {format(new Date(tx.borrowDate), "dd MMM", {
                        locale: id,
                      })}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Categories */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-5">
            Kategori Barang
          </h3>
          {Object.keys(stats.categories).length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-8">
              Belum ada kategori
            </p>
          ) : (
            <div className="space-y-4">
              {Object.entries(stats.categories).map(
                ([category, count], index) => {
                  const colors = [
                    "bg-indigo-100 text-indigo-700",
                    "bg-emerald-100 text-emerald-700",
                    "bg-amber-100 text-amber-700",
                    "bg-rose-100 text-rose-700",
                    "bg-violet-100 text-violet-700",
                    "bg-cyan-100 text-cyan-700",
                  ];
                  const color = colors[index % colors.length];
                  return (
                    <div
                      key={category}
                      className="flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-2 h-2 rounded-full ${
                            color.split(" ")[0].replace("bg-", "bg-")
                          }`}
                        />
                        <span className="text-sm text-gray-700">{category}</span>
                      </div>
                      <span
                        className={`text-xs font-medium px-2.5 py-1 rounded-full ${color}`}
                      >
                        {count}
                      </span>
                    </div>
                  );
                }
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
