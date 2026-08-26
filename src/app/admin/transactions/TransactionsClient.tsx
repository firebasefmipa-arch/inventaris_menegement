"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import {
  Clock, CheckCircle2, ArrowLeftRight, User, Plus,
  Search, SlidersHorizontal, ChevronDown,
  XCircle, AlertTriangle,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useToast } from "@/components/Toaster";
import { ReturnButton } from "./ReturnButton";
import { BorrowModal } from "./BorrowModal";
import { RejectModal } from "./RejectModal";
import { FilterBar, defaultFilter, applyTimeFilter, type FilterState } from "@/components/FilterBar";

type Transaction = {
  id: number;
  itemId: number;
  quantity: number;
  status: "pending_signature" | "pending_approval" | "active" | "returned" | "overdue" | "rejected";
  signedDocumentUrl: string | null;
  borrowDate: Date;
  expectedReturnDate: Date;
  actualReturnDate: Date | null;
  notes: string | null;
  rejectionReason: string | null;
  createdAt: Date;
  itemName: string | null;
  itemCategory: string | null;
  borrowerName: string | null;
  borrowerDepartment: string | null;
};

interface Props {
  transactions: Transaction[];
  currentStatus: string;
}

export function TransactionsClient({ transactions }: Props) {
  const [showBorrowModal, setShowBorrowModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [advFilter, setAdvFilter] = useState<FilterState>(defaultFilter);
  const filterRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { toast } = useToast();
  const { data: session } = useSession();

  // Reject modal state
  const [rejectModal, setRejectModal] = useState<{
    open: boolean;
    txId: number | null;
    itemName: string;
    borrowerName: string;
  }>({ open: false, txId: null, itemName: "", borrowerName: "" });

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setShowFilterDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const filteredTransactions = useMemo(() => {
    // Daftar nama peminjam unik untuk dropdown
    let result = transactions.filter((tx) => {
      if (statusFilter && tx.status !== statusFilter) return false;
      if (advFilter.user && tx.borrowerName !== advFilter.user) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          (tx.itemName?.toLowerCase().includes(q) ?? false) ||
          (tx.borrowerName?.toLowerCase().includes(q) ?? false) ||
          (tx.borrowerDepartment?.toLowerCase().includes(q) ?? false) ||
          (tx.notes?.toLowerCase().includes(q) ?? false)
        );
      }
      return true;
    });

    result = applyTimeFilter(result, (tx) => tx.borrowDate, advFilter.timePreset, advFilter.dateFrom, advFilter.dateTo);
    return result;
  }, [transactions, searchQuery, statusFilter, advFilter]);

  const uniqueUsers = useMemo(() =>
    [...new Set(transactions.map((tx) => tx.borrowerName).filter(Boolean) as string[])].sort(),
    [transactions]
  );

  const handleApprove = async (txId: number) => {
    if (!confirm("Yakin ingin menyetujui peminjaman ini?")) return;
    try {
      const res = await fetch(`/api/transactions/${txId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      });
      if (!res.ok) throw new Error();
      toast("Peminjaman berhasil disetujui", "success");
      router.refresh();
    } catch {
      toast("Terjadi kesalahan", "error");
    }
  };

  const handleRejectConfirm = async (txId: number, reason: string) => {
    try {
      const res = await fetch(`/api/transactions/${txId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", rejectionReason: reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menolak");
      toast("Peminjaman berhasil ditolak", "success");
      setRejectModal({ open: false, txId: null, itemName: "", borrowerName: "" });
      router.refresh();
    } catch (e: any) {
      toast(e.message || "Terjadi kesalahan", "error");
    }
  };

  const filterOptions = [
    { key: "", label: "Semua Status" },
    { key: "pending_signature", label: "Menunggu TTD" },
    { key: "pending_approval", label: "Menunggu Persetujuan" },
    { key: "active", label: "Dipinjam (Aktif)" },
    { key: "returned", label: "Dikembalikan" },
    { key: "rejected", label: "Ditolak" },
  ];

  return (
    <>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Peminjaman</h2>
            <p className="text-gray-500 text-sm mt-1">
              Riwayat peminjaman dan pengembalian barang
            </p>
          </div>
          <div className="flex flex-wrap gap-2 justify-end items-center">
            <button
              onClick={() => setShowBorrowModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors shadow-sm shadow-indigo-600/25 text-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              Pinjam Barang
            </button>
          </div>
        </div>

        {/* FilterBar — user + waktu */}
        <FilterBar
          filter={advFilter}
          onChange={setAdvFilter}
          userList={uniqueUsers}
          userLabel="Semua Peminjam"
          showUserFilter={true}
        />

        {/* Search Bar + Filter Status */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-2 flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 pl-3">
            <Search className="w-4 h-4 text-gray-400 shrink-0" />
            <input
              type="text"
              placeholder="Cari barang atau peminjam..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full py-2 text-sm bg-transparent outline-none placeholder:text-gray-400 text-gray-900"
            />
          </div>
          <div className="relative" ref={filterRef}>
            <button
              onClick={() => setShowFilterDropdown(!showFilterDropdown)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors border shrink-0 ${
                statusFilter
                  ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                  : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              <SlidersHorizontal className="w-4 h-4" />
              {filterOptions.find((f) => f.key === statusFilter)?.label || "Filter"}
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
            {showFilterDropdown && (
              <div className="absolute right-0 top-full mt-2 w-52 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden z-20">
                {filterOptions.map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => { setStatusFilter(opt.key); setShowFilterDropdown(false); }}
                    className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                      statusFilter === opt.key
                        ? "bg-indigo-50 text-indigo-700 font-medium"
                        : "text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* List */}
        {filteredTransactions.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
            <ArrowLeftRight className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-700 mb-1">
              {transactions.length === 0 ? "Tidak ada transaksi" : "Tidak ditemukan"}
            </h3>
            <p className="text-gray-500 text-sm mb-4">
              {transactions.length === 0 ? "Belum ada aktivitas peminjaman" : "Coba ubah kata kunci atau filter"}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredTransactions.map((tx) => {
              const isOverdue = tx.status === "active" && new Date(tx.expectedReturnDate) < new Date();

              return (
                <div
                  key={tx.id}
                  className={`rounded-2xl shadow-sm border p-4 sm:p-5 hover:shadow-md transition-all ${
                    isOverdue
                      ? "border-red-200 bg-red-50/30"
                      : "bg-white border-gray-100"
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                    {/* Status Icon */}
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      tx.status === "returned"           ? "bg-emerald-100"
                      : tx.status === "active"           ? (isOverdue ? "bg-red-100" : "bg-amber-100")
                      : tx.status === "pending_approval" ? "bg-blue-100"
                      : tx.status === "pending_signature"? "bg-gray-100"
                      : tx.status === "rejected"         ? "bg-red-100"
                      : "bg-gray-100"
                    }`}>
                      {tx.status === "returned" ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                      ) : tx.status === "rejected" ? (
                        <XCircle className="w-5 h-5 text-red-600" />
                      ) : isOverdue ? (
                        <AlertTriangle className="w-5 h-5 text-red-600" />
                      ) : (
                        <Clock className={`w-5 h-5 ${
                          tx.status === "active"            ? "text-amber-600"
                          : tx.status === "pending_approval"? "text-blue-600"
                          : "text-gray-500"
                        }`} />
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-gray-900">{tx.itemName || "Unknown Item"}</h3>
                            <span className="text-xs text-gray-400">×{tx.quantity}</span>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 mt-1">
                            <span className="inline-flex items-center gap-1">
                              <User className="w-3.5 h-3.5" />
                              {tx.borrowerName || "Unknown"}
                            </span>
                            {tx.borrowerDepartment && <span>{tx.borrowerDepartment}</span>}
                            <span>
                              {format(new Date(tx.borrowDate), "dd MMM yyyy", { locale: id })}
                              {" → "}
                              {format(new Date(tx.expectedReturnDate), "dd MMM yyyy", { locale: id })}
                            </span>
                          </div>
                          {tx.notes && (
                            <p className="text-xs text-gray-400 mt-1.5 bg-gray-50 px-2.5 py-1.5 rounded-lg border border-gray-100">
                              {tx.notes}
                            </p>
                          )}
                          {/* Alasan penolakan */}
                          {tx.status === "rejected" && tx.rejectionReason && (
                            <div className="mt-2 flex items-start gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                              <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                              <p className="text-xs text-red-700">
                                <span className="font-semibold">Alasan: </span>
                                {tx.rejectionReason}
                              </p>
                            </div>
                          )}
                        </div>

                        {/* Status badge + actions */}
                        <div className="flex flex-col items-end gap-2 shrink-0">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                            tx.status === "returned"            ? "bg-emerald-100 text-emerald-700"
                            : tx.status === "active"            ? (isOverdue ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700")
                            : tx.status === "pending_signature" ? "bg-gray-100 text-gray-600"
                            : tx.status === "pending_approval"  ? "bg-blue-100 text-blue-700"
                            : tx.status === "rejected"          ? "bg-red-100 text-red-700"
                            : "bg-gray-100 text-gray-600"
                          }`}>
                            {tx.status === "returned"            ? "Dikembalikan"
                             : tx.status === "active"            ? (isOverdue ? "Terlambat!" : "Dipinjam")
                             : tx.status === "pending_signature" ? "Menunggu TTD"
                             : tx.status === "pending_approval"  ? "Menunggu Persetujuan"
                             : tx.status === "rejected"          ? "Ditolak"
                             : tx.status}
                          </span>

                          {tx.signedDocumentUrl && (
                            <a href={tx.signedDocumentUrl} target="_blank" rel="noreferrer"
                              className="text-xs text-blue-600 hover:underline">
                              Lihat Dokumen
                            </a>
                          )}

                          {/* Approve / Reject buttons */}
                          {tx.status === "pending_approval" && (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleApprove(tx.id)}
                                className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 transition-colors"
                              >
                                Setujui
                              </button>
                              <button
                                onClick={() => setRejectModal({
                                  open: true,
                                  txId: tx.id,
                                  itemName: tx.itemName || "Barang",
                                  borrowerName: tx.borrowerName || "Peminjam",
                                })}
                                className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700 transition-colors"
                              >
                                Tolak
                              </button>
                            </div>
                          )}

                          {tx.status === "active" && (
                            <ReturnButton transactionId={tx.id} itemName={tx.itemName || ""} />
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

      <BorrowModal isOpen={showBorrowModal} onClose={() => setShowBorrowModal(false)} />

      <RejectModal
        isOpen={rejectModal.open}
        transactionId={rejectModal.txId}
        itemName={rejectModal.itemName}
        borrowerName={rejectModal.borrowerName}
        onClose={() => setRejectModal({ open: false, txId: null, itemName: "", borrowerName: "" })}
        onConfirm={handleRejectConfirm}
      />
    </>
  );
}
