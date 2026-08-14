"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Clock, CheckCircle2, XCircle, FileText, Package,
  Plus, ChevronDown, ChevronUp, RefreshCcw, Search, ClipboardCheck,
} from "lucide-react";
import clsx from "clsx";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { useToast } from "@/components/Toaster";
import { HandoverModal } from "./HandoverModal";

type HvItem = {
  itemId: number | null;
  itemName: string | null;
  itemCategory: string | null;
  itemInventoryNumber: string | null;
  itemAssetNumber: string | null;
  quantity: number;
};

type Handover = {
  id: number;
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

const STATUS_CONFIG: Record<string, { label: string; icon: any; color: string; bg: string; border: string }> = {
  pending_signature: { label: "Perlu Dokumen",        icon: FileText,     color: "text-amber-700",   bg: "bg-amber-50",   border: "border-amber-200" },
  pending_approval:  { label: "Menunggu Persetujuan", icon: Clock,        color: "text-blue-700",    bg: "bg-blue-50",    border: "border-blue-200"  },
  completed:         { label: "Selesai",              icon: CheckCircle2, color: "text-teal-700",    bg: "bg-teal-50",    border: "border-teal-200"  },
  rejected:          { label: "Ditolak",              icon: XCircle,      color: "text-red-700",     bg: "bg-red-50",     border: "border-red-200"   },
};

const STATUS_TABS = [
  { key: "", label: "Semua" },
  { key: "pending_approval", label: "Menunggu" },
  { key: "pending_signature", label: "Perlu Dokumen" },
  { key: "completed", label: "Selesai" },
  { key: "rejected", label: "Ditolak" },
];

export function HandoversClient({ initialData, isSuperAdmin }: {
  initialData: Handover[];
  isSuperAdmin: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();

  const [handovers, setHandovers] = useState<Handover[]>(initialData);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [modalOpen, setModalOpen] = useState(false);

  // Approve/reject state
  const [actionId, setActionId] = useState<number | null>(null);
  const [actionType, setActionType] = useState<"approve" | "reject" | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const fetchData = async (status = statusFilter) => {
    setLoading(true);
    try {
      const url = status ? `/api/admin/handovers?status=${status}` : "/api/admin/handovers";
      const res = await fetch(url);
      const data = await res.json();
      setHandovers(Array.isArray(data) ? data : []);
    } catch {
      setHandovers([]);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleAction = async () => {
    if (!actionId || !actionType) return;
    if (actionType === "reject" && !rejectReason.trim()) {
      toast("Alasan penolakan wajib diisi", "error");
      return;
    }
    setActionLoading(true);
    try {
      const res = await fetch(`/api/admin/handovers/${actionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: actionType,
          rejectionReason: rejectReason.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal");
      toast(data.message, "success");
      setActionId(null);
      setActionType(null);
      setRejectReason("");
      await fetchData();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Gagal melakukan aksi", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const filtered = handovers.filter((h) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return (h.receiverName || "").toLowerCase().includes(q) ||
      (h.department || "").toLowerCase().includes(q) ||
      h.items?.some((i) => (i.itemName || "").toLowerCase().includes(q));
  });

  return (
    <div className="space-y-5">
      {/* Header actions */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex gap-2 overflow-x-auto pb-1 flex-1">
          {STATUS_TABS.map((tab) => (
            <button key={tab.key} onClick={() => { setStatusFilter(tab.key); fetchData(tab.key); }}
              className={clsx("shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all",
                statusFilter === tab.key
                  ? "bg-teal-600 border-teal-600 text-white shadow-sm"
                  : "bg-white border-gray-200 text-gray-600 hover:border-teal-300 hover:text-teal-600")}>
              {tab.label}
            </button>
          ))}
          <button onClick={() => fetchData()}
            className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold border bg-white border-gray-200 text-gray-600 hover:bg-gray-50 transition-all">
            <RefreshCcw className={clsx("w-3.5 h-3.5", loading && "animate-spin")} /> Refresh
          </button>
        </div>
        <button onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-xl text-sm font-semibold hover:bg-teal-700 transition-colors shadow-sm shrink-0">
          <Plus className="w-4 h-4" /> Catat Serah Terima
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari nama penerima, divisi, atau barang..."
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map((i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-100 p-5 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-1/3 mb-2" />
              <div className="h-3 bg-gray-200 rounded w-1/4" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
          <ClipboardCheck className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <h3 className="font-semibold text-gray-700">Belum ada data serah terima</h3>
          <p className="text-sm text-gray-400 mt-1">
            {statusFilter ? "Tidak ada serah terima dengan status ini" : "Belum ada pengajuan serah terima"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((hv) => {
            const cfg = STATUS_CONFIG[hv.status] ?? { label: hv.status, icon: Package, color: "text-gray-600", bg: "bg-gray-50", border: "border-gray-200" };
            const StatusIcon = cfg.icon;
            const isExpanded = expandedIds.has(hv.id);
            const multiItem = hv.items && hv.items.length > 1;
            const needsAction = hv.status === "pending_approval";

            return (
              <div key={hv.id} className={clsx(
                "bg-white rounded-2xl border shadow-sm",
                needsAction ? "border-blue-300 ring-1 ring-blue-100" : "border-gray-100"
              )}>
                {/* Pending approval banner */}
                {needsAction && (
                  <div className="px-4 py-3 bg-blue-50 border-b border-blue-200 rounded-t-2xl space-y-2">
                    <span className="block text-xs font-semibold text-blue-700">
                      ⏳ Menunggu persetujuan admin
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => { setActionId(hv.id); setActionType("approve"); }}
                        className="w-full text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 px-3 py-2.5 rounded-xl transition-colors"
                      >
                        ✓ Setujui
                      </button>
                      <button
                        onClick={() => { setActionId(hv.id); setActionType("reject"); }}
                        className="w-full text-xs font-bold text-white bg-red-600 hover:bg-red-700 px-3 py-2.5 rounded-xl transition-colors"
                      >
                        ✕ Tolak
                      </button>
                    </div>
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
                              ? hv.items.length === 1
                                ? hv.items[0].itemName || "Barang"
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

                      {/* Info penerima */}
                      <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-xs text-gray-500">
                        <div>
                          <span className="text-gray-400">Penerima</span>
                          <p className="font-medium text-gray-700">{hv.receiverName}</p>
                        </div>
                        {hv.receiverNim && (
                          <div>
                            <span className="text-gray-400">NIK/NIM</span>
                            <p className="font-medium text-gray-700">{hv.receiverNim}</p>
                          </div>
                        )}
                        <div>
                          <span className="text-gray-400">Divisi/Prodi</span>
                          <p className="font-medium text-gray-700">{hv.department || "—"}</p>
                        </div>
                        {hv.phone && (
                          <div>
                            <span className="text-gray-400">No. Telp/WA</span>
                            <p className="font-medium text-gray-700">{hv.phone}</p>
                          </div>
                        )}
                        {hv.purpose && (
                          <div className="col-span-2">
                            <span className="text-gray-400">Keperluan</span>
                            <p className="font-medium text-gray-700 line-clamp-1">{hv.purpose}</p>
                          </div>
                        )}
                        <div>
                          <span className="text-gray-400">Tanggal</span>
                          <p className="font-medium text-gray-700">
                            {format(new Date(hv.handoverDate), "dd MMM yyyy", { locale: idLocale })}
                          </p>
                        </div>
                      </div>

                      {/* Daftar barang */}
                      {hv.items?.length > 0 && (
                        <div className="mt-3">
                          {multiItem && (
                            <button onClick={() => toggleExpand(hv.id)}
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

                      {/* Footer */}
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className="text-xs text-gray-400"># ST-{String(hv.id).padStart(4, "0")}</span>
                        {hv.signedDocumentUrl && (
                          <a href={hv.signedDocumentUrl} target="_blank" rel="noreferrer"
                            className="text-xs text-blue-600 hover:underline font-medium">Lihat Dokumen</a>
                        )}
                        <a href={`/api/handovers/${hv.id}/generate-pdf`} download
                          className="text-xs text-teal-600 hover:underline font-medium flex items-center gap-1">
                          <FileText className="w-3 h-3" /> Unduh PDF
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Approve/Reject */}
      {actionId && actionType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => { setActionId(null); setActionType(null); setRejectReason(""); }} />
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 space-y-4">
            <h3 className="text-lg font-bold text-gray-900">
              {actionType === "approve" ? "Setujui Serah Terima?" : "Tolak Serah Terima"}
            </h3>
            {actionType === "approve" ? (
              <p className="text-sm text-gray-600">
                Setelah disetujui, barang akan dikeluarkan dari inventaris secara <strong>permanen</strong>. Tindakan ini tidak dapat dibatalkan.
              </p>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Alasan Penolakan <span className="text-red-500">*</span>
                </label>
                <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Tuliskan alasan penolakan..." rows={3}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 resize-none" />
              </div>
            )}
            <div className="flex gap-3 pt-2">
              <button onClick={() => { setActionId(null); setActionType(null); setRejectReason(""); }}
                className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 text-sm font-medium transition-colors">
                Batal
              </button>
              <button onClick={handleAction} disabled={actionLoading}
                className={clsx(
                  "flex-1 py-2.5 text-white rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors",
                  actionType === "approve" ? "bg-teal-600 hover:bg-teal-700" : "bg-red-600 hover:bg-red-700"
                )}>
                {actionLoading ? "Memproses..." : actionType === "approve" ? "Ya, Setujui" : "Tolak"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Catat Serah Terima */}
      <HandoverModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
