"use client";

import { useState, useEffect, useRef } from "react";
import { X, AlertTriangle, Send } from "lucide-react";
import clsx from "clsx";

interface RejectModalProps {
  isOpen: boolean;
  transactionId: number | null;
  itemName: string;
  borrowerName: string;
  onClose: () => void;
  onConfirm: (txId: number, reason: string) => Promise<void>;
}

const QUICK_REASONS = [
  "Barang sedang dalam perawatan",
  "Stok tidak mencukupi",
  "Data peminjam tidak lengkap",
  "Melewati batas waktu pengajuan",
  "Tidak sesuai prosedur peminjaman",
];

export function RejectModal({
  isOpen,
  transactionId,
  itemName,
  borrowerName,
  onClose,
  onConfirm,
}: RejectModalProps) {
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen) {
      setReason("");
      setLoading(false);
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const handleConfirm = async () => {
    if (!reason.trim()) return;
    if (!transactionId) return;
    setLoading(true);
    await onConfirm(transactionId, reason.trim());
    setLoading(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-start justify-between p-6 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900">Tolak Peminjaman</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                {borrowerName} — {itemName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 pb-6 space-y-4">
          {/* Quick reasons */}
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
              Alasan Cepat
            </p>
            <div className="flex flex-wrap gap-2">
              {QUICK_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason(r)}
                  className={clsx(
                    "text-xs px-3 py-1.5 rounded-full border transition-all",
                    reason === r
                      ? "bg-red-50 border-red-300 text-red-700 font-medium"
                      : "bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300"
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Textarea */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">
              Alasan Penolakan <span className="text-red-500">*</span>
            </label>
            <textarea
              ref={textareaRef}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Tulis alasan penolakan yang jelas untuk peminjam..."
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-400 resize-none transition-all"
            />
            <p className="text-xs text-gray-400 mt-1">
              {reason.length}/500 karakter
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-200 transition-colors disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!reason.trim() || loading}
              className={clsx(
                "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all",
                !reason.trim() || loading
                  ? "bg-red-300 cursor-not-allowed"
                  : "bg-red-600 hover:bg-red-700 shadow-md shadow-red-500/20"
              )}
            >
              {loading ? (
                <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Menolak...</>
              ) : (
                <><Send className="w-4 h-4" /> Konfirmasi Tolak</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
