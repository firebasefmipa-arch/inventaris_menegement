import { db } from "@/db";
import { items, transactions, users, transactionItems } from "@/db/schema";
import { eq, sql, count, and, lte, inArray, gt } from "drizzle-orm";
import {
  Package,
  ArrowLeftRight,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Boxes,
} from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import { DueSoonCard } from "@/components/DueSoonCard";

export const dynamic = "force-dynamic";

async function getStats() {
  const now = new Date();
  // Batas: 24 jam dari sekarang
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  // ── 4 query paralel ──
  const [itemStats, transactionStats, recentTransactions, dueSoonRaw] = await Promise.all([
    // Query 1: semua stats items sekaligus dengan conditional count
    db.select({
      total:     count(),
      available: count(sql`CASE WHEN ${items.status} = 'available' THEN 1 END`),
      borrowed:  count(sql`CASE WHEN ${items.status} = 'borrowed'  THEN 1 END`),
      category:  items.category,
    })
    .from(items)
    .where(gt(items.quantity, 0))
    .groupBy(items.category),

    // Query 2: stats transaksi sekaligus
    // "Terlambat" dihitung dari TANGGAL — kolom status "overdue" tidak pernah
    // ditulis oleh kode mana pun, jadi menghitungnya dari status selalu 0.
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

    // Query 4: transaksi aktif yang SUDAH LEWAT tenggat atau tenggat <= 24 jam
    db.select({
      id:                 transactions.id,
      borrowerName:       transactions.borrowerName,
      borrowerPhone:      transactions.borrowerPhone,
      borrowerDepartment: transactions.borrowerDepartment,
      expectedReturnDate: transactions.expectedReturnDate,
      itemName:           items.name,
      quantity:           transactions.quantity,
    })
    .from(transactions)
    .leftJoin(items, eq(transactions.itemId, items.id))
    .where(
      and(
        eq(transactions.status, "active"),
        lte(transactions.expectedReturnDate, in24h),
      )
    )
    .orderBy(transactions.expectedReturnDate),
  ]);

  // Nama barang lengkap dari pivot (multi-barang → transactions.item_id NULL)
  const dueItemRows = dueSoonRaw.length > 0
    ? await db
        .select({
          transactionId: transactionItems.transactionId,
          itemName: items.name,
        })
        .from(transactionItems)
        .leftJoin(items, eq(transactionItems.itemId, items.id))
        .where(inArray(transactionItems.transactionId, dueSoonRaw.map((t) => t.id)))
    : [];

  const dueNamesByTx = new Map<number, string[]>();
  for (const r of dueItemRows) {
    const list = dueNamesByTx.get(r.transactionId) ?? [];
    if (r.itemName) list.push(r.itemName);
    dueNamesByTx.set(r.transactionId, list);
  }

  const dueSoon = dueSoonRaw.map((t) => ({
    id: t.id,
    borrowerName: t.borrowerName,
    borrowerPhone: t.borrowerPhone,
    expectedReturnDate: t.expectedReturnDate,
    quantity: t.quantity,
    itemNames: dueNamesByTx.get(t.id) ?? (t.itemName ? [t.itemName] : []),
  }));

  // Agregasi hasil query 1
  const totalItems     = itemStats.reduce((s, r) => s + Number(r.total),     0);
  const availableItems = itemStats.reduce((s, r) => s + Number(r.available), 0);
  const borrowedItems  = itemStats.reduce((s, r) => s + Number(r.borrowed),  0);

  const activeTransactions  = Number(transactionStats[0]?.active  ?? 0);
  const overdueTransactions = Number(transactionStats[0]?.overdue ?? 0);

  return {
    totalItems,
    availableItems,
    borrowedItems,
    activeTransactions,
    overdueTransactions,
    recentTransactions,
    dueSoon,
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
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {statCards.map((card) => (
          <Link
            key={card.label}
            href={card.href}
            className="group relative bg-white rounded-2xl shadow-sm border border-gray-100 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 overflow-hidden"
          >
            {/* Accent bar top */}
            <div className={`h-1 w-full bg-linear-to-r ${card.color}`} />
            <div className="p-5">
              {/* Baris atas: ikon + angka sejajar */}
              <div className="flex items-center justify-between gap-2">
                <div className={`w-10 h-10 ${card.bg} rounded-xl flex items-center justify-center shrink-0`}>
                  <card.icon className={`w-5 h-5 ${card.iconColor}`} />
                </div>
                <p className="text-3xl font-extrabold text-gray-900 tabular-nums leading-none">{card.value}</p>
              </div>
              {/* Label bawah */}
              <p className={`text-xs font-semibold mt-3 ${card.iconColor} opacity-70`}>{card.label}</p>
            </div>
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

        {/* Due Soon — sudah lewat tenggat atau ≤ 24 jam */}
        <DueSoonCard rows={stats.dueSoon as any} variant="admin" limit={10} />
      </div>
    </div>
  );
}
