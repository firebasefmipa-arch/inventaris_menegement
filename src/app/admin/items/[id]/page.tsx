import { db } from "@/db";
import { items, transactions } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Package,
  MapPin,
  Calendar,
  Edit3,
  Boxes,
  Clock,
  CheckCircle2,
  FileText,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import { format } from "date-fns";
import { id } from "date-fns/locale";

export const dynamic = "force-dynamic";

export default async function ItemDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idStr } = await params;
  const idNum = parseInt(idStr);

  const [item] = await db.select().from(items).where(eq(items.id, idNum));
  if (!item) notFound();

  const itemTransactions = await db
    .select({
      id: transactions.id,
      status: transactions.status,
      quantity: transactions.quantity,
      borrowDate: transactions.borrowDate,
      expectedReturnDate: transactions.expectedReturnDate,
      actualReturnDate: transactions.actualReturnDate,
      notes: transactions.notes,
      borrowerName: transactions.borrowerName,
      borrowerDepartment: transactions.borrowerDepartment,
    })
    .from(transactions)
    .where(eq(transactions.itemId, idNum))
    .orderBy(desc(transactions.createdAt))
    .limit(10);

  const statusConfig = {
    available: {
      label: "Tersedia",
      bg: "bg-emerald-100",
      text: "text-emerald-700",
      border: "border-emerald-200",
    },
    borrowed: {
      label: "Dipinjam",
      bg: "bg-amber-100",
      text: "text-amber-700",
      border: "border-amber-200",
    },
  };

  const config = statusConfig[item.status];

  return (
    <div className="space-y-6 pt-12 lg:pt-0 max-w-4xl">
      {/* Back */}
      <Link
        href="/admin/items"
        className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft className="w-4 h-4" />
        Kembali ke daftar barang
      </Link>

      {/* Item Detail Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 bg-gradient-to-br from-indigo-100 to-purple-100 rounded-2xl flex items-center justify-center">
                <Package className="w-7 h-7 text-indigo-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">{item.name}</h2>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-sm text-gray-500">{item.category}</span>
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${config.bg} ${config.text} ${config.border}`}
                  >
                    {config.label}
                  </span>
                </div>
              </div>
            </div>
            <Link
              href={`/admin/items/${item.id}/edit`}
              className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm font-medium text-gray-700 transition-colors"
            >
              <Edit3 className="w-4 h-4" />
              Edit Barang
            </Link>
          </div>

          {item.description && (
            <p className="text-gray-600 text-sm leading-relaxed mb-6">
              {item.description}
            </p>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Total</p>
              <p className="text-lg font-bold text-gray-900">{item.quantity}</p>
            </div>
            <div className="bg-emerald-50 rounded-xl p-4">
              <p className="text-xs text-emerald-600 mb-1">Tersedia</p>
              <p className="text-lg font-bold text-emerald-700">
                {item.availableQuantity}
              </p>
            </div>
            <div className="bg-amber-50 rounded-xl p-4">
              <p className="text-xs text-amber-600 mb-1">Dipinjam</p>
              <p className="text-lg font-bold text-amber-700">
                {item.quantity - item.availableQuantity}
              </p>
            </div>
            {item.location && (
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-xs text-gray-500 mb-1">Lokasi</p>
                <p className="text-sm font-medium text-gray-900 truncate">
                  {item.location}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Transaction History */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-5">
          Riwayat Peminjaman
        </h3>

        {itemTransactions.length === 0 ? (
          <div className="text-center py-8">
            <Boxes className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">Belum ada riwayat peminjaman</p>
          </div>
        ) : (
          <div className="space-y-3">
            {itemTransactions.map((tx) => {
              const statusMap: Record<string, {
                icon: React.ReactNode;
                bg: string;
                badge: string;
                label: string;
              }> = {
                active: {
                  icon: <Clock className="w-4 h-4 text-amber-600" />,
                  bg: "bg-amber-100",
                  badge: "bg-amber-100 text-amber-700",
                  label: "Dipinjam",
                },
                returned: {
                  icon: <CheckCircle2 className="w-4 h-4 text-emerald-600" />,
                  bg: "bg-emerald-100",
                  badge: "bg-emerald-100 text-emerald-700",
                  label: "Dikembalikan",
                },
                overdue: {
                  icon: <AlertTriangle className="w-4 h-4 text-red-600" />,
                  bg: "bg-red-100",
                  badge: "bg-red-100 text-red-700",
                  label: "Terlambat",
                },
                rejected: {
                  icon: <XCircle className="w-4 h-4 text-red-600" />,
                  bg: "bg-red-100",
                  badge: "bg-red-100 text-red-700",
                  label: "Ditolak",
                },
                pending_approval: {
                  icon: <Clock className="w-4 h-4 text-blue-600" />,
                  bg: "bg-blue-100",
                  badge: "bg-blue-100 text-blue-700",
                  label: "Menunggu Persetujuan",
                },
                pending_signature: {
                  icon: <FileText className="w-4 h-4 text-gray-500" />,
                  bg: "bg-gray-100",
                  badge: "bg-gray-100 text-gray-600",
                  label: "Menunggu TTD",
                },
              };

              const cfg = statusMap[tx.status] ?? statusMap.pending_signature;

              return (
                <div
                  key={tx.id}
                  className="flex items-center gap-4 p-4 rounded-xl hover:bg-gray-50 border border-gray-100"
                >
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${cfg.bg}`}>
                    {cfg.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {tx.borrowerName || "Unknown"}
                    </p>
                    <p className="text-xs text-gray-500">
                      {tx.borrowerDepartment && `${tx.borrowerDepartment} • `}
                      {tx.quantity} unit •{" "}
                      {format(new Date(tx.borrowDate), "dd MMM yyyy", { locale: id })}
                      {" → "}
                      {format(new Date(tx.expectedReturnDate), "dd MMM yyyy", { locale: id })}
                    </p>
                  </div>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium shrink-0 ${cfg.badge}`}>
                    {cfg.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
