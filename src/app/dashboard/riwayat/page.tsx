"use client";

import { useEffect, useState } from "react";
import {
  Clock, CheckCircle2, XCircle, AlertTriangle, PackageCheck,
  FileText, Search, RefreshCcw, Package, ArrowUpRight, ChevronDown, ChevronUp,
} from "lucide-react";
import clsx from "clsx";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import Link from "next/link";

type TxItem = {
  itemId: number | null;
  itemName: string | null;
  itemCategory: string | null;
  itemLocation: string | null;
  itemInventoryNumber: string | null;
  quantity: number;
  notes: string | null;
};

type Transaction = {
  id: number;
  quantity: number;
  status: string;
  signedDocumentUrl: string | null;
  borrowDate: string;
  expectedReturnDate: string;
  actualReturnDate: string | null;
  notes: string | null;
  rejectionReason: string | null;
  createdAt: string;
  // root-level untuk backward-compat
  itemName: string | null;
  itemCategory: string | null;
  itemLocation: string | null;
  // multi-item
  items: TxItem[];
};

const STATUS_CONFIG: Record<string, { label: string; icon: any; color: string; bg: string; border: string }> = {
  pending_signature: { label: "Perlu Upload Dokumen", icon: FileText, color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200" },
  pending_approval:  { label: "Menunggu Persetujuan", icon: Clock,    color: "text-blue-700",  bg: "bg-blue-50",  border: "border-blue-200"  },
  active:            { label: "Sedang Dipinjam",       icon: PackageCheck, color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200" },
  returned:          { label: "Sudah Dikembalikan",    icon: CheckCircle2, color: "text-gray-700", bg: "bg-gray-100", border: "border-gray-200" },
  rejected:          { label: "Ditolak",               icon: XCircle,  color: "text-red-700",   bg: "bg-red-50",   border: "border-red-200"   },
  overdue:           { label: "Terlambat",             icon: AlertTriangle, color: "text-red-700", bg: "bg-red-50", border: "border-red-200"  },
};

const STATUS_TABS = [
  { key: "", label: "Semua" },
  { key: "active", label: "Aktif" },
  { key: "pending_approval", label: "Menunggu" },
  { key: "pending_signature", label: "Perlu Dokumen" },
  { key: "returned", label: "Selesai" },
  { key: "overdue", label: "Terlambat" },
];

export default function RiwayatPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const url = statusFilter ? `/api/user/transactions?status=${statusFilter}` : "/api/user/transactions";
      const res = await fetch(url);
      const data = await res.json();
      setTransactions(Array.isArray(data) ? data : []);
    } catch {
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [statusFilter]);

  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleCancel = async (txId: number) => {
    if (!confirm("Yakin ingin membatalkan peminjaman ini? Tindakan ini tidak dapat diurungkan.")) return;
    setCancellingId(txId);
    try {
      const res = await fetch(`/api/user/transactions/${txId}/cancel`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal membatalkan");
      await fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Gagal membatalkan peminjaman");
    } finally {
      setCancellingId(null);
    }
  };

  const filtered = transactions.filter((t) => {
    const q = search.toLowerCase();
    if (!q) return true;
    const inRoot = (t.itemName || "").toLowerCase().includes(q);
    const inItems = t.items?.some((i) => (i.itemName || "").toLowerCase().includes(q));
    return inRoot || inItems;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Riwayat Peminjaman</h1>
          <p className="text-sm text-gray-500 mt-1">Semua peminjaman yang pernah kamu ajukan</p>
        </div>
        <button onClick={fetchData}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors self-start sm:self-auto">
          <RefreshCcw className={clsx("w-4 h-4", loading && "animate-spin")} />
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {STATUS_TABS.map((tab) => (
          <button key={tab.key} onClick={() => setStatusFilter(tab.key)}
            className={clsx("shrink-0 px-4 py-2 rounded-full text-xs font-semibold border transition-all",
              statusFilter === tab.key
                ? "bg-indigo-600 border-indigo-600 text-white shadow-sm"
                : "bg-white border-gray-200 text-gray-600 hover:border-indigo-300 hover:text-indigo-600")}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari nama barang..."
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-100 p-5 animate-pulse">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-gray-200 rounded-xl shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-1/3" />
                  <div className="h-3 bg-gray-200 rounded w-1/4" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
          <Package className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <h3 className="font-semibold text-gray-700">Belum ada peminjaman</h3>
          <p className="text-sm text-gray-400 mt-1 mb-5">
            {statusFilter ? "Tidak ada peminjaman dengan status ini" : "Kamu belum pernah meminjam barang"}
          </p>
          <Link href="/dashboard/pinjam"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors">
            Pinjam Sekarang
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((tx) => {
            const cfg = STATUS_CONFIG[tx.status] ?? { label: tx.status, icon: Package, color: "text-gray-600", bg: "bg-gray-50", border: "border-gray-200" };
            const StatusIcon = cfg.icon;
            const borrowDate = new Date(tx.borrowDate);
            const expectedDate = new Date(tx.expectedReturnDate);
            const isOverdue = tx.status === "active" && expectedDate < new Date();
            const isExpanded = expandedIds.has(tx.id);
            const multiItem = tx.items && tx.items.length > 1;
            const needsUpload = tx.status === "pending_signature" && !tx.signedDocumentUrl;

            return (
              <div key={tx.id}
                className={clsx(
                  "bg-white rounded-2xl border shadow-sm transition-shadow hover:shadow-md",
                  needsUpload ? "border-amber-300 ring-1 ring-amber-200" : "border-gray-100"
                )}>
                {/* Perlu upload banner */}
                {needsUpload && (
                  <div className="flex items-center justify-between gap-3 px-5 py-2.5 bg-amber-50 border-b border-amber-200 rounded-t-2xl">
                    <div className="flex items-center gap-2 text-amber-800 text-xs font-semibold">
                      <FileText className="w-4 h-4 text-amber-600 animate-pulse" />
                      Dokumen belum diupload — peminjaman belum diproses
                    </div>
                    <Link href={`/transactions/${tx.id}/upload`}
                      className="flex items-center gap-1.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 px-3 py-1.5 rounded-lg transition-colors shrink-0">
                      Upload Sekarang <ArrowUpRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                )}

                <div className="p-5">
                  <div className="flex items-start gap-4">
                    <div className={clsx("w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border", cfg.bg, cfg.border)}>
                      <StatusIcon className={clsx("w-5 h-5", cfg.color)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <h3 className="font-bold text-gray-900 text-sm">
                            {tx.items && tx.items.length > 0
                              ? tx.items.length === 1
                                ? tx.items[0].itemName || "Barang"
                                : `${tx.items[0].itemName || "Barang"} +${tx.items.length - 1} lainnya`
                              : (tx.itemName || "Barang")}
                          </h3>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {tx.items?.length > 0
                              ? `${tx.items.length} jenis barang • ${tx.quantity} unit total`
                              : `${tx.quantity} unit`}
                          </p>
                        </div>
                        <span className={clsx("text-xs font-semibold px-2.5 py-1 rounded-full border", cfg.bg, cfg.color, cfg.border)}>
                          {isOverdue ? "Terlambat" : cfg.label}
                        </span>
                      </div>

                      {/* Tanggal */}
                      <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-xs text-gray-500">
                        <div>
                          <span className="text-gray-400">Dipinjam</span>
                          <p className="font-medium text-gray-700">{format(borrowDate, "dd MMM yyyy", { locale: idLocale })}</p>
                        </div>
                        <div>
                          <span className="text-gray-400">Batas kembali</span>
                          <p className={clsx("font-medium", isOverdue ? "text-red-600" : "text-gray-700")}>
                            {format(expectedDate, "dd MMM yyyy", { locale: idLocale })}
                          </p>
                        </div>
                        {tx.actualReturnDate && (
                          <div>
                            <span className="text-gray-400">Dikembalikan</span>
                            <p className="font-medium text-emerald-600">
                              {format(new Date(tx.actualReturnDate), "dd MMM yyyy", { locale: idLocale })}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Daftar barang (expandable jika multi) */}
                      {tx.items && tx.items.length > 0 && (
                        <div className="mt-3">
                          {multiItem && (
                            <button onClick={() => toggleExpand(tx.id)}
                              className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700 mb-2">
                              {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                              {isExpanded ? "Sembunyikan" : `Lihat semua ${tx.items.length} barang`}
                            </button>
                          )}
                          {(!multiItem || isExpanded) && (
                            <div className="space-y-1.5 bg-gray-50 rounded-xl p-3 border border-gray-100">
                              {tx.items.map((item, idx) => (
                                <div key={idx} className="flex items-center justify-between text-xs gap-3">
                                  <span className="text-gray-700 font-medium truncate">{item.itemName || "Barang"}</span>
                                  <div className="flex items-center gap-3 shrink-0 text-gray-500">
                                    {item.itemInventoryNumber && (
                                      <span className="text-gray-400">#{item.itemInventoryNumber}</span>
                                    )}
                                    <span className="font-semibold text-gray-900">×{item.quantity}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Catatan & alasan tolak */}
                      {tx.notes && (
                        <p className="mt-2 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 border border-gray-100 line-clamp-2">{tx.notes}</p>
                      )}
                      {tx.status === "rejected" && tx.rejectionReason && (
                        <div className="mt-2 flex items-start gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                          <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                          <p className="text-xs text-red-700"><span className="font-semibold">Alasan ditolak: </span>{tx.rejectionReason}</p>
                        </div>
                      )}

                      {/* Footer */}
                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        <span className="text-xs text-gray-400"># PB-{String(tx.id).padStart(4, "0")}</span>
                        {tx.signedDocumentUrl && (
                          <a href={tx.signedDocumentUrl} target="_blank" rel="noreferrer"
                            className="text-xs text-blue-600 hover:underline font-medium">
                            Lihat Dokumen
                          </a>
                        )}
                        {needsUpload && (
                          <Link href={`/transactions/${tx.id}/upload`}
                            className="flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full hover:bg-amber-100 transition-colors">
                            <FileText className="w-3 h-3" /> Upload Dokumen
                            <ArrowUpRight className="w-3 h-3" />
                          </Link>
                        )}
                        {/* Tombol Batalkan — hanya untuk pending_signature dan pending_approval */}
                        {(tx.status === "pending_signature" || tx.status === "pending_approval") && (
                          <button
                            onClick={() => handleCancel(tx.id)}
                            disabled={cancellingId === tx.id}
                            className="flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-50 border border-red-200 px-2.5 py-1 rounded-full hover:bg-red-100 disabled:opacity-50 transition-colors"
                          >
                            {cancellingId === tx.id ? (
                              <>
                                <RefreshCcw className="w-3 h-3 animate-spin" /> Membatalkan...
                              </>
                            ) : (
                              <>
                                <XCircle className="w-3 h-3" /> Batalkan
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
