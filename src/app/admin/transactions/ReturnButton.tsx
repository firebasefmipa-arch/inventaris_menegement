"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Undo2 } from "lucide-react";
import { useToast } from "@/components/Toaster";

export function ReturnButton({
  transactionId,
  itemName,
}: {
  transactionId: number;
  itemName: string;
}) {
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const handleReturn = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/transactions/${transactionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "returned" }),
      });

      if (!res.ok) throw new Error("Failed");
      toast(`"${itemName}" berhasil dikembalikan`, "success");
      router.refresh();
    } catch {
      toast("Gagal mengembalikan barang", "error");
    } finally {
      setLoading(false);
      setShowConfirm(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setShowConfirm(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg transition-colors"
      >
        <Undo2 className="w-3.5 h-3.5" />
        Kembalikan
      </button>

      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Kembalikan Barang
            </h3>
            <p className="text-sm text-gray-600 mb-6">
              Konfirmasi pengembalian <strong>&quot;{itemName}&quot;</strong>?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowConfirm(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
              >
                Batal
              </button>
              <button
                onClick={handleReturn}
                disabled={loading}
                className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors disabled:opacity-50"
              >
                {loading ? "Memproses..." : "Kembalikan"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
