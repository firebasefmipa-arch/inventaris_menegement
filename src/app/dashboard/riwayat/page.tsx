"use client";

import { useEffect, useState } from "react";
import {
  Clock, CheckCircle2, XCircle, AlertTriangle, PackageCheck,
  FileText, Search, RefreshCcw, Package, ArrowUpRight, ChevronDown, ChevronUp,
  ClipboardCheck, ArrowLeftRight, Layers, Download,
} from "lucide-react";
import clsx from "clsx";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import Link from "next/link";
import { DocActions } from "@/components/DocActions";
import { formatTanggalJamWIB, hariTerlambat } from "@/lib/tanggal";
import { withBase } from "@/lib/basepath";

// ─── Types ────────────────────────────────────────────────────────────────────

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
  grupId: string | null;
  unit: string | null;
  quantity: number;
  status: string;
  signedDocumentUrl: string | null;
  borrowDate: string;
  expectedReturnDate: string;
  actualReturnDate: string | null;
  notes: string | null;
  rejectionReason: string | null;
  createdAt: string;
  itemName: string | null;
  itemCategory: string | null;
  itemLocation: string | null;
  items: TxItem[];
};

type HvItem = {
  itemId: number | null;
  itemName: string | null;
  itemCategory: string | null;
  itemInventoryNumber: string | null;
  itemAssetNumber: string | null;
  quantity: number;
  notes: string | null;
};

type Handover = {
  id: number;
  grupId: string | null;
  unit: string | null;
  receiverName: string;
  receiverNim: string | null;
  unitName: string | null;
  department: string | null;
  phone: string | null;
  purpose: string | null;
  notes: string | null;
  signedDocumentUrl: string | null;
  status: string;
  rejectionReason: string | null;
  handoverDate: string;
  createdAt: string;
  itemName: string | null;
  items: HvItem[];
};

// ─── Status config ────────────────────────────────────────────────────────────

const TX_STATUS_CONFIG: Record<string, { label: string; icon: any; color: string; bg: string; border: string }> = {
  pending_signature: { label: "Perlu Upload Dokumen", icon: FileText,      color: "text-amber-700",   bg: "bg-amber-50",   border: "border-amber-200"  },
  pending_approval:  { label: "Menunggu Persetujuan", icon: Clock,          color: "text-blue-700",    bg: "bg-blue-50",    border: "border-blue-200"   },
  active:            { label: "Sedang Dipinjam",       icon: PackageCheck,  color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200"},
  returned:          { label: "Sudah Dikembalikan",    icon: CheckCircle2,  color: "text-gray-700",    bg: "bg-gray-100",   border: "border-gray-200"   },
  rejected:          { label: "Ditolak",               icon: XCircle,       color: "text-red-700",     bg: "bg-red-50",     border: "border-red-200"    },
  overdue:           { label: "Terlambat",             icon: AlertTriangle, color: "text-red-700",     bg: "bg-red-50",     border: "border-red-200"    },
};

const HV_STATUS_CONFIG: Record<string, { label: string; icon: any; color: string; bg: string; border: string }> = {
  pending_signature: { label: "Perlu Upload Dokumen", icon: FileText,     color: "text-amber-700",   bg: "bg-amber-50",   border: "border-amber-200"  },
  pending_approval:  { label: "Menunggu Persetujuan", icon: Clock,        color: "text-blue-700",    bg: "bg-blue-50",    border: "border-blue-200"   },
  completed:         { label: "Selesai",              icon: CheckCircle2, color: "text-teal-700",    bg: "bg-teal-50",    border: "border-teal-200"   },
  rejected:          { label: "Ditolak",              icon: XCircle,      color: "text-red-700",     bg: "bg-red-50",     border: "border-red-200"    },
};

const TX_STATUS_TABS = [
  { key: "", label: "Semua" },
  { key: "active", label: "Aktif" },
  { key: "pending_approval", label: "Menunggu" },
  { key: "pending_signature", label: "Perlu Dokumen" },
  { key: "returned", label: "Selesai" },
  { key: "overdue", label: "Terlambat" },
];

const HV_STATUS_TABS = [
  { key: "", label: "Semua" },
  { key: "pending_signature", label: "Perlu Dokumen" },
  { key: "pending_approval", label: "Menunggu" },
  { key: "completed", label: "Selesai" },
  { key: "rejected", label: "Ditolak" },
];

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function RiwayatPage() {
  const [activeTab, setActiveTab] = useState<"peminjaman" | "serah-terima">("peminjaman");

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Riwayat</h1>
        </div>
      </div>

      {/* Main tab: Peminjaman vs Serah Terima */}
      <div className="flex gap-2 border-b border-gray-200">
        <button
          onClick={() => setActiveTab("peminjaman")}
          className={clsx(
            "flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-all",
            activeTab === "peminjaman"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          )}
        >
          <ArrowLeftRight className="w-4 h-4" />
          Peminjaman
        </button>
        <button
          onClick={() => setActiveTab("serah-terima")}
          className={clsx(
            "flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-all",
            activeTab === "serah-terima"
              ? "border-teal-600 text-teal-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          )}
        >
          <ClipboardCheck className="w-4 h-4" />
          Serah Terima
        </button>
      </div>

      {activeTab === "peminjaman" ? <PeminjamanTab /> : <SerahTerimaTab />}
    </div>
  );
}

// ─── Tab Peminjaman ───────────────────────────────────────────────────────────

function PeminjamanTab() {
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
    if (!confirm("Yakin ingin membatalkan peminjaman ini?")) return;
    setCancellingId(txId);
    try {
      const res = await fetch(`/api/user/transactions/${txId}/cancel`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal membatalkan");
      await fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Gagal membatalkan");
    } finally {
      setCancellingId(null);
    }
  };

  const filtered = transactions.filter((t) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return (t.itemName || "").toLowerCase().includes(q) ||
      t.items?.some((i) => (i.itemName || "").toLowerCase().includes(q));
  });

  return (
    <div className="space-y-4">
      {/* Status filter tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {TX_STATUS_TABS.map((tab) => (
          <button key={tab.key} onClick={() => setStatusFilter(tab.key)}
            className={clsx("shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all",
              statusFilter === tab.key
                ? "bg-indigo-600 border-indigo-600 text-white shadow-sm"
                : "bg-white border-gray-200 text-gray-600 hover:border-indigo-300 hover:text-indigo-600")}>
            {tab.label}
          </button>
        ))}
        <button onClick={fetchData} className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold border bg-white border-gray-200 text-gray-600 hover:bg-gray-50 transition-all">
          <RefreshCcw className={clsx("w-3.5 h-3.5", loading && "animate-spin")} /> Refresh
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari nama barang..."
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
      </div>

      {loading ? <LoadingSkeleton /> : filtered.length === 0 ? (
        <EmptyState
          message={statusFilter ? "Tidak ada peminjaman dengan status ini" : "Kamu belum pernah meminjam barang"}
          actionLabel="Pinjam Sekarang"
          actionHref="/dashboard/pinjam"
        />
      ) : (
        <div className="space-y-3">
          {grupPeminjaman(filtered).map((g) =>
            g.items.length === 1 ? (
              <KartuPeminjaman
                key={g.kunci}
                tx={g.items[0]}
                expanded={expandedIds.has(g.items[0].id)}
                cancellingId={cancellingId}
                onToggle={() => toggleExpand(g.items[0].id)}
                onCancel={handleCancel}
                onRefresh={fetchData}
              />
            ) : (
              // Bingkai kelompok. Tiap bagian TETAP punya kartunya sendiri —
              // yang ditambahkan hanya bingkai yang menjelaskan bahwa
              // potongan-potongan ini berasal dari satu pengajuan.
              <div key={g.kunci} className="rounded-3xl border-2 border-indigo-200/70 bg-indigo-50/40 p-3 sm:p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1">
                  <div className="flex items-center gap-2">
                    <Layers className="h-4 w-4 shrink-0 text-indigo-600" />
                    <span className="text-sm font-bold text-indigo-900">
                      1 pengajuan &middot; {g.items.length} bagian
                    </span>
                    <DokumenGabungan grupId={g.kunci} jenis="transaksi" />
                  </div>
                  <span className={clsx("rounded-full border px-2.5 py-1 text-xs font-semibold", ringkasKelompok(g.items).bg, ringkasKelompok(g.items).color, ringkasKelompok(g.items).border)}>
                    {ringkasKelompok(g.items).label}
                  </span>
                </div>
                <div className="space-y-3">
                  {g.items.map((tx) => (
                    <KartuPeminjaman
                      key={tx.id}
                      tx={tx}
                      expanded={expandedIds.has(tx.id)}
                      cancellingId={cancellingId}
                      onToggle={() => toggleExpand(tx.id)}
                      onCancel={handleCancel}
                      onRefresh={fetchData}
                    />
                  ))}
                </div>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

// ─── Kartu satu peminjaman ────────────────────────────────────────────────────
// Dipakai dua kali: berdiri sendiri, dan di dalam bingkai kelompok. Karena itu
// ia menerima semuanya lewat props, bukan menutup variabel dari halaman.

function KartuPeminjaman({
  tx,
  expanded,
  cancellingId,
  onToggle,
  onCancel,
  onRefresh,
}: {
  tx: Transaction;
  expanded: boolean;
  cancellingId: number | null;
  onToggle: () => void;
  onCancel: (id: number) => void;
  onRefresh: () => void;
}) {
          const cfg = TX_STATUS_CONFIG[tx.status] ?? { label: tx.status, icon: Package, color: "text-gray-600", bg: "bg-gray-50", border: "border-gray-200" };
          const StatusIcon = cfg.icon;
          const borrowDate = new Date(tx.borrowDate);
          const expectedDate = new Date(tx.expectedReturnDate);
          const isOverdue = tx.status === "active" && hariTerlambat(tx.expectedReturnDate) > 0;
          // Sudah kembali tapi dulu telat — badge "Terlambat" tetap tampil.
          const telatKembali = tx.status === "returned"
            ? hariTerlambat(tx.expectedReturnDate, tx.actualReturnDate ?? undefined) > 0
            : false;
          const isExpanded = expanded;
          const multiItem = tx.items && tx.items.length > 1;
          const needsUpload = tx.status === "pending_signature" && !tx.signedDocumentUrl;

          return (
            <div key={tx.id} className={clsx(
              "bg-white rounded-2xl border shadow-sm transition-shadow hover:shadow-md",
              needsUpload ? "border-amber-300 ring-1 ring-amber-200" : "border-gray-100"
            )}>
              {needsUpload && (
                <div className="flex items-center justify-between gap-3 px-5 py-2.5 bg-amber-50 border-b border-amber-200 rounded-t-2xl">
                  <div className="flex items-center gap-2 text-amber-800 text-xs font-semibold">
                    <FileText className="w-4 h-4 text-amber-600 animate-pulse" />
                    Dokumen belum diupload
                  </div>
                  <Link href={`/transactions/${tx.id}/upload`}
                    className="flex items-center gap-1.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 px-3 py-1.5 rounded-lg transition-colors shrink-0">
                    Upload <ArrowUpRight className="w-3.5 h-3.5" />
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
                          {tx.items?.length > 0
                            ? tx.items.length === 1 ? tx.items[0].itemName || "Barang"
                              : `${tx.items[0].itemName || "Barang"} +${tx.items.length - 1} lainnya`
                            : tx.itemName || "Barang"}
                        </h3>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {tx.items?.length > 0
                            ? `${tx.items.length} jenis • ${tx.quantity} unit total`
                            : `${tx.quantity} unit`}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1.5">
                        <span className={clsx("text-xs font-semibold px-2.5 py-1 rounded-full border", cfg.bg, cfg.color, cfg.border)}>
                          {isOverdue ? "Terlambat" : cfg.label}
                        </span>
                        {telatKembali && (
                          <span className="text-xs font-semibold px-2.5 py-1 rounded-full border bg-red-50 text-red-700 border-red-200">
                            Terlambat
                          </span>
                        )}
                      </div>
                    </div>

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
                            {formatTanggalJamWIB(tx.actualReturnDate)}
                          </p>
                        </div>
                      )}
                    </div>

                    {tx.items?.length > 0 && (
                      <div className="mt-3">
                        {multiItem && (
                          <button onClick={() => onToggle()}
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
                                  {item.itemInventoryNumber && <span className="text-gray-400">#{item.itemInventoryNumber}</span>}
                                  <span className="font-semibold text-gray-900">×{item.quantity}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {tx.notes && (
                      <p className="mt-2 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 border border-gray-100 line-clamp-2">{tx.notes}</p>
                    )}
                    {tx.status === "rejected" && tx.rejectionReason && (
                      <div className="mt-2 flex items-start gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                        <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                        <p className="text-xs text-red-700"><span className="font-semibold">Alasan ditolak: </span>{tx.rejectionReason}</p>
                      </div>
                    )}

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="text-xs text-gray-400"># PB-{String(tx.id).padStart(4, "0")}</span>
                      <DocActions
                        signedDocumentUrl={tx.signedDocumentUrl}
                        type="transaction"
                        id={tx.id}
                        onRegenerated={onRefresh}
                      />
                      {needsUpload && (
                        <Link href={`/transactions/${tx.id}/upload`}
                          className="flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full hover:bg-amber-100 transition-colors">
                          <FileText className="w-3 h-3" /> Upload <ArrowUpRight className="w-3 h-3" />
                        </Link>
                      )}
                      {(tx.status === "pending_signature" || tx.status === "pending_approval") && (
                        <button onClick={() => onCancel(tx.id)} disabled={cancellingId === tx.id}
                          className="flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-50 border border-red-200 px-2.5 py-1 rounded-full hover:bg-red-100 disabled:opacity-50 transition-colors">
                          {cancellingId === tx.id
                            ? <><RefreshCcw className="w-3 h-3 animate-spin" /> Membatalkan...</>
                            : <><XCircle className="w-3 h-3" /> Batalkan</>}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
}

// ─── Pengelompokan pecahan per unit ───────────────────────────────────────────

/**
 * Gabungkan peminjaman yang berasal dari SATU pengajuan (grupId sama).
 * Transaksi lama tanpa grupId tetap tampil sendiri-sendiri.
 */
function grupPeminjaman<T extends { id: number; grupId: string | null }>(daftar: T[]): { kunci: string; items: T[] }[] {
  const urut: string[] = [];
  const peta = new Map<string, T[]>();
  for (const tx of daftar) {
    const kunci = tx.grupId || `tunggal-${tx.id}`;
    if (!peta.has(kunci)) {
      peta.set(kunci, []);
      urut.push(kunci);
    }
    peta.get(kunci)!.push(tx);
  }
  return urut.map((kunci) => ({ kunci, items: peta.get(kunci)! }));
}

/**
 * Label ringkas sebuah kelompok.
 *
 * Kalau isinya seragam, tampilkan status itu. Kalau bercampur — inilah kasus
 * "satu bagian disetujui, satu ditolak" — katakan apa adanya, supaya peminjam
 * tidak salah paham bahwa pengajuannya diterima seluruhnya.
 * Kelompok SENGAJA tidak punya status sendiri di database; ini hanya ringkasan
 * tampilan, dan status tiap bagian tetap yang berlaku.
 */
function ringkasKelompok(
  items: { status: string }[],
  config: Record<string, { label: string; color: string; bg: string; border: string }> = TX_STATUS_CONFIG
) {
  const adaTolak = items.some((t) => t.status === "rejected");
  const adaJalan = items.some((t) => t.status !== "rejected");
  if (adaTolak && adaJalan) {
    return { label: "Sebagian ditolak", color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200" };
  }
  const cfg = config[items[0]?.status] ?? { label: items[0]?.status ?? "-", color: "text-gray-700", bg: "bg-gray-100", border: "border-gray-200" };
  return { label: cfg.label, color: cfg.color, bg: cfg.bg, border: cfg.border };
}

// ─── Tab Serah Terima ─────────────────────────────────────────────────────────

function SerahTerimaTab() {
  const [handovers, setHandovers] = useState<Handover[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const url = statusFilter ? `/api/handovers?status=${statusFilter}` : "/api/handovers";
      const res = await fetch(url);
      const data = await res.json();
      setHandovers(Array.isArray(data) ? data : []);
    } catch {
      setHandovers([]);
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

  const handleCancel = async (hvId: number) => {
    if (!confirm("Yakin ingin membatalkan permintaan serah terima ini?")) return;
    setCancellingId(hvId);
    try {
      const res = await fetch(`/api/user/handovers/${hvId}/cancel`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal membatalkan");
      await fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Gagal membatalkan");
    } finally {
      setCancellingId(null);
    }
  };

  const filtered = handovers.filter((h) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return (h.itemName || "").toLowerCase().includes(q) ||
      h.items?.some((i) => (i.itemName || "").toLowerCase().includes(q));
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {HV_STATUS_TABS.map((tab) => (
          <button key={tab.key} onClick={() => setStatusFilter(tab.key)}
            className={clsx("shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all",
              statusFilter === tab.key
                ? "bg-teal-600 border-teal-600 text-white shadow-sm"
                : "bg-white border-gray-200 text-gray-600 hover:border-teal-300 hover:text-teal-600")}>
            {tab.label}
          </button>
        ))}
        <button onClick={fetchData} className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold border bg-white border-gray-200 text-gray-600 hover:bg-gray-50 transition-all">
          <RefreshCcw className={clsx("w-3.5 h-3.5", loading && "animate-spin")} /> Refresh
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari nama barang..."
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
      </div>

      {loading ? <LoadingSkeleton /> : filtered.length === 0 ? (
        <EmptyState
          message={statusFilter ? "Tidak ada serah terima dengan status ini" : "Kamu belum pernah mengajukan serah terima"}
          actionLabel="Ajukan Serah Terima"
          actionHref="/dashboard/serah-terima"
          color="teal"
        />
      ) : (
        <div className="space-y-3">
          {grupPeminjaman(
            filtered.map((h) => ({ ...h, id: h.id }))
          ).map((g) =>
            g.items.length === 1 ? (
              <KartuSerahTerima
                key={g.kunci}
                hv={g.items[0]}
                expanded={expandedIds.has(g.items[0].id)}
                cancellingId={cancellingId}
                onToggle={() => toggleExpand(g.items[0].id)}
                onCancel={handleCancel}
                onRefresh={fetchData}
              />
            ) : (
              <div key={g.kunci} className="rounded-3xl border-2 border-teal-200/70 bg-teal-50/40 p-3 sm:p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1">
                  <div className="flex items-center gap-2">
                    <Layers className="h-4 w-4 shrink-0 text-teal-600" />
                    <span className="text-sm font-bold text-teal-900">
                      1 pengajuan &middot; {g.items.length} bagian
                    </span>
                    <DokumenGabungan grupId={g.kunci} jenis="serah-terima" />
                  </div>
                  <span className={clsx("rounded-full border px-2.5 py-1 text-xs font-semibold", ringkasKelompok(g.items, HV_STATUS_CONFIG).bg, ringkasKelompok(g.items, HV_STATUS_CONFIG).color, ringkasKelompok(g.items, HV_STATUS_CONFIG).border)}>
                    {ringkasKelompok(g.items, HV_STATUS_CONFIG).label}
                  </span>
                </div>
                <div className="space-y-3">
                  {g.items.map((hv) => (
                    <KartuSerahTerima
                      key={hv.id}
                      hv={hv}
                      expanded={expandedIds.has(hv.id)}
                      cancellingId={cancellingId}
                      onToggle={() => toggleExpand(hv.id)}
                      onCancel={handleCancel}
                      onRefresh={fetchData}
                    />
                  ))}
                </div>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

// ─── Kartu satu serah terima ──────────────────────────────────────────────────

function KartuSerahTerima({
  hv,
  expanded,
  cancellingId,
  onToggle,
  onCancel,
  onRefresh,
}: {
  hv: Handover;
  expanded: boolean;
  cancellingId: number | null;
  onToggle: () => void;
  onCancel: (id: number) => void;
  onRefresh: () => void;
}) {
          const cfg = HV_STATUS_CONFIG[hv.status] ?? { label: hv.status, icon: Package, color: "text-gray-600", bg: "bg-gray-50", border: "border-gray-200" };
          const StatusIcon = cfg.icon;
          const handoverDate = new Date(hv.handoverDate);
          const isExpanded = expanded;
          const multiItem = hv.items && hv.items.length > 1;
          const needsUpload = hv.status === "pending_signature" && !hv.signedDocumentUrl;

          return (
            <div key={hv.id} className={clsx(
              "bg-white rounded-2xl border shadow-sm transition-shadow hover:shadow-md",
              needsUpload ? "border-amber-300 ring-1 ring-amber-200" : "border-gray-100"
            )}>
              {needsUpload && (
                <div className="flex items-center justify-between gap-3 px-5 py-2.5 bg-amber-50 border-b border-amber-200 rounded-t-2xl">
                  <div className="flex items-center gap-2 text-amber-800 text-xs font-semibold">
                    <FileText className="w-4 h-4 text-amber-600 animate-pulse" />
                    Dokumen serah terima belum diupload
                  </div>
                  <Link href={`/handovers/${hv.id}/upload`}
                    className="flex items-center gap-1.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 px-3 py-1.5 rounded-lg transition-colors shrink-0">
                    Upload <ArrowUpRight className="w-3.5 h-3.5" />
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
                          {hv.items?.length > 0
                            ? hv.items.length === 1 ? hv.items[0].itemName || "Barang"
                              : `${hv.items[0].itemName || "Barang"} +${hv.items.length - 1} lainnya`
                            : hv.itemName || "Barang"}
                        </h3>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {hv.items?.length > 0 ? `${hv.items.length} jenis barang` : "Serah Terima"}
                        </p>
                      </div>
                      <span className={clsx("text-xs font-semibold px-2.5 py-1 rounded-full border", cfg.bg, cfg.color, cfg.border)}>
                        {cfg.label}
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-500">
                      <div>
                        <span className="text-gray-400">Tanggal</span>
                        <p className="font-medium text-gray-700">{format(handoverDate, "dd MMM yyyy", { locale: idLocale })}</p>
                      </div>
                      {hv.purpose && (
                        <div>
                          <span className="text-gray-400">Keperluan</span>
                          <p className="font-medium text-gray-700 truncate">{hv.purpose}</p>
                        </div>
                      )}
                    </div>

                    {hv.items?.length > 0 && (
                      <div className="mt-3">
                        {multiItem && (
                          <button onClick={() => onToggle()}
                            className="flex items-center gap-1 text-xs font-semibold text-teal-600 hover:text-teal-700 mb-2">
                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            {isExpanded ? "Sembunyikan" : `Lihat semua ${hv.items.length} barang`}
                          </button>
                        )}
                        {(!multiItem || isExpanded) && (
                          <div className="space-y-1.5 bg-teal-50 rounded-xl p-3 border border-teal-100">
                            {hv.items.map((item, idx) => (
                              <div key={idx} className="flex items-center justify-between text-xs gap-3">
                                <span className="text-gray-700 font-medium truncate">{item.itemName || "Barang"}</span>
                                <div className="flex items-center gap-3 shrink-0 text-gray-500">
                                  {(item.itemAssetNumber || item.itemInventoryNumber) && (
                                    <span className="text-gray-400">#{item.itemAssetNumber || item.itemInventoryNumber}</span>
                                  )}
                                  <span className="font-semibold text-gray-900">×{item.quantity}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {hv.status === "rejected" && hv.rejectionReason && (
                      <div className="mt-2 flex items-start gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                        <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                        <p className="text-xs text-red-700"><span className="font-semibold">Alasan ditolak: </span>{hv.rejectionReason}</p>
                      </div>
                    )}

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="text-xs text-gray-400"># ST-{String(hv.id).padStart(4, "0")}</span>
                      <DocActions
                        signedDocumentUrl={hv.signedDocumentUrl}
                        type="handover"
                        id={hv.id}
                        onRegenerated={onRefresh}
                      />
                      {needsUpload && (
                        <Link href={`/handovers/${hv.id}/upload`}
                          className="flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full hover:bg-amber-100 transition-colors">
                          <FileText className="w-3 h-3" /> Upload <ArrowUpRight className="w-3 h-3" />
                        </Link>
                      )}
                      {(hv.status === "pending_signature" || hv.status === "pending_approval") && (
                        <button onClick={() => onCancel(hv.id)} disabled={cancellingId === hv.id}
                          className="flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-50 border border-red-200 px-2.5 py-1 rounded-full hover:bg-red-100 disabled:opacity-50 transition-colors">
                          {cancellingId === hv.id
                            ? <><RefreshCcw className="w-3 h-3 animate-spin" /> Membatalkan...</>
                            : <><XCircle className="w-3 h-3" /> Batalkan</>}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
}

// ─── Tombol dokumen gabungan ──────────────────────────────────────────────────

/**
 * Satu pengajuan = satu dokumen. Tiap bagian punya berkasnya sendiri di
 * penyimpanan (karena disetujui unit yang berbeda), tapi yang dibuka peminjam
 * adalah gabungannya — sesuai kenyataan bahwa ia hanya menandatangani sekali.
 */
function DokumenGabungan({ grupId, jenis }: { grupId: string; jenis: "transaksi" | "serah-terima" }) {
  const url = `/api/grup/${grupId}/dokumen?jenis=${jenis}`;
  return (
    <div className="flex items-center gap-1.5">
      <a
        href={withBase(url + "&inline=1")}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
      >
        <FileText className="h-3 w-3" /> Dokumen Gabungan
      </a>
      <a
        href={withBase(url)}
        download
        className="flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
      >
        <Download className="h-3 w-3" />
      </a>
    </div>
  );
}

// ─── Shared Components ────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
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
  );
}

function EmptyState({ message, actionLabel, actionHref, color = "indigo" }: {
  message: string;
  actionLabel: string;
  actionHref: string;
  color?: "indigo" | "teal";
}) {
  const btnClass = color === "teal"
    ? "bg-teal-600 hover:bg-teal-700"
    : "bg-indigo-600 hover:bg-indigo-700";
  return (
    <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
      <Package className="w-12 h-12 text-gray-200 mx-auto mb-3" />
      <h3 className="font-semibold text-gray-700">Belum ada data</h3>
      <p className="text-sm text-gray-400 mt-1 mb-5">{message}</p>
      <Link href={actionHref}
        className={clsx("inline-flex items-center gap-2 px-5 py-2.5 text-white rounded-xl text-sm font-semibold transition-colors", btnClass)}>
        {actionLabel}
      </Link>
    </div>
  );
}
