import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { transactions, transactionItems, items } from "@/db/schema";
import { eq } from "drizzle-orm";
import UploadForm from "./UploadForm";
import Link from "next/link";
import { ArrowLeft, Package, CheckCircle2 } from "lucide-react";

export default async function UploadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { id } = await params;
  const txId = parseInt(id, 10);
  if (isNaN(txId)) redirect("/dashboard/riwayat");

  // Ambil transaksi
  const [tx] = await db
    .select()
    .from(transactions)
    .where(eq(transactions.id, txId))
    .limit(1);

  const role = (session.user as any)?.role;
  if (!tx || (tx.userId !== session.user.id && role !== "admin" && role !== "super_admin")) {
    redirect("/dashboard/riwayat");
  }

  // Ambil semua item dalam transaksi ini
  const txItemRows = await db
    .select({
      itemId: transactionItems.itemId,
      quantity: transactionItems.quantity,
      notes: transactionItems.notes,
      itemName: items.name,
      itemCategory: items.category,
      inventoryNumber: items.inventoryNumber,
      itemLocation: items.location,
    })
    .from(transactionItems)
    .leftJoin(items, eq(transactionItems.itemId, items.id))
    .where(eq(transactionItems.transactionId, txId));

  // Fallback legacy single-item
  let displayItems = txItemRows;
  if (displayItems.length === 0 && tx.itemId) {
    const [item] = await db.select().from(items).where(eq(items.id, tx.itemId)).limit(1);
    if (item) {
      displayItems = [{
        itemId: item.id,
        quantity: tx.quantity,
        notes: tx.notes,
        itemName: item.name,
        itemCategory: item.category,
        inventoryNumber: item.inventoryNumber,
        itemLocation: item.location,
      }];
    }
  }

  // Jika status bukan pending_signature / pending_approval
  if (tx.status !== "pending_signature" && tx.status !== "pending_approval") {
    const statusLabel: Record<string, string> = {
      active: "Sedang Dipinjam",
      returned: "Sudah Dikembalikan",
      rejected: "Ditolak",
      overdue: "Terlambat",
    };
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 max-w-md w-full text-center space-y-4">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8 text-emerald-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">
            {statusLabel[tx.status] || "Status Tidak Valid"}
          </h2>
          <p className="text-sm text-gray-500">
            Transaksi ini sudah tidak memerlukan upload dokumen.
          </p>
          <Link href="/dashboard/riwayat"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors">
            Lihat Riwayat
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Back */}
        <Link href="/dashboard/riwayat"
          className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Kembali ke Riwayat
        </Link>

        {/* Header card */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-extrabold text-gray-900">Lengkapi Dokumen</h1>
              <p className="text-sm text-gray-500 mt-1">
                Kode Peminjaman:{" "}
                <span className="font-bold text-gray-800">
                  PB-{String(tx.id).padStart(4, "0")}
                </span>
              </p>
            </div>
            <span className="shrink-0 text-xs font-semibold px-3 py-1.5 bg-amber-100 text-amber-700 border border-amber-200 rounded-full">
              Menunggu Dokumen
            </span>
          </div>

          {/* Daftar barang */}
          {displayItems.length > 0 && (
            <div className="border border-gray-100 rounded-xl overflow-hidden">
              <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-100 flex items-center gap-2">
                <Package className="w-4 h-4 text-gray-500" />
                <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">
                  Barang yang Dipinjam ({displayItems.length} jenis)
                </span>
              </div>
              <div className="divide-y divide-gray-50">
                {displayItems.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between px-4 py-3 gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {item.itemName || "Barang"}
                      </p>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
                        {item.itemCategory && <span>{item.itemCategory}</span>}
                        {item.inventoryNumber && (
                          <span className="text-gray-400">#{item.inventoryNumber}</span>
                        )}
                        {item.itemLocation && <span>{item.itemLocation}</span>}
                      </div>
                    </div>
                    <span className="shrink-0 text-sm font-bold text-gray-900">
                      ×{item.quantity}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Upload form */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-6">
            <UploadForm
              transactionId={tx.id}
              currentStatus={tx.status}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
