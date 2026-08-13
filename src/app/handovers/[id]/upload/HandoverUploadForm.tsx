"use client";

import { useState } from "react";
import { Download, UploadCloud, CheckCircle, FileText, Loader2, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";

export default function HandoverUploadForm({
  handoverId,
  currentStatus,
}: {
  handoverId: number;
  currentStatus: string;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [success, setSuccess] = useState(currentStatus === "pending_approval");
  const router = useRouter();

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch(`/api/handovers/${handoverId}/upload`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Upload gagal");
      setSuccess(true);
      router.refresh();
      setTimeout(() => router.push("/dashboard/riwayat"), 2000);
    } catch {
      alert("Gagal mengunggah file.");
    } finally {
      setUploading(false);
    }
  };

  const handleCancel = async () => {
    if (!confirm("Yakin ingin membatalkan permintaan serah terima ini? Tindakan ini tidak dapat diurungkan.")) return;
    setCancelling(true);
    try {
      const res = await fetch(`/api/user/handovers/${handoverId}/cancel`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal membatalkan");
      router.push("/dashboard/riwayat");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Gagal membatalkan");
      setCancelling(false);
    }
  };

  if (success) {
    return (
      <div className="text-center py-12 bg-teal-50 rounded-2xl border border-teal-100">
        <div className="w-16 h-16 bg-teal-100 text-teal-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-8 h-8" />
        </div>
        <h3 className="text-xl font-bold text-gray-900 mb-2">Dokumen Berhasil Diunggah!</h3>
        <p className="text-sm text-gray-500 mb-2 max-w-sm mx-auto">
          Admin akan segera memverifikasi dokumen serah terima Anda.
        </p>
        <p className="text-xs text-gray-400">Mengalihkan ke riwayat...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Step 1: Download */}
      <div className="flex gap-4 items-start p-5 bg-teal-50/50 rounded-2xl border border-teal-100">
        <div className="w-10 h-10 shrink-0 bg-teal-100 text-teal-600 rounded-full flex items-center justify-center font-bold">1</div>
        <div>
          <h3 className="text-base font-bold text-gray-900 mb-1">Unduh Formulir Serah Terima</h3>
          <p className="text-sm text-gray-600 mb-4">
            Unduh formulir yang sudah terisi otomatis dengan data permintaan Anda.
          </p>
          <a
            href={`/api/handovers/${handoverId}/generate-pdf`}
            download
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-white text-teal-700 border border-teal-200 rounded-xl hover:bg-teal-50 font-semibold text-sm transition-colors shadow-sm"
          >
            <Download className="w-4 h-4" />
            Unduh PDF Formulir
          </a>
        </div>
      </div>

      {/* Step 2: TTD */}
      <div className="flex gap-4 items-start p-5 bg-amber-50/50 rounded-2xl border border-amber-100">
        <div className="w-10 h-10 shrink-0 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center font-bold">2</div>
        <div>
          <h3 className="text-base font-bold text-gray-900 mb-1">Tanda Tangani</h3>
          <p className="text-sm text-gray-600">
            Cetak formulir, tanda tangani secara fisik oleh pihak penerima, lalu scan atau foto dengan jelas.
          </p>
        </div>
      </div>

      {/* Step 3: Upload */}
      <div className="flex gap-4 items-start p-5 bg-indigo-50/50 rounded-2xl border border-indigo-100">
        <div className="w-10 h-10 shrink-0 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center font-bold">3</div>
        <div className="w-full">
          <h3 className="text-base font-bold text-gray-900 mb-1">Unggah Formulir</h3>
          <p className="text-sm text-gray-600 mb-4">
            Unggah formulir yang sudah ditandatangani. Format PDF, JPG, atau PNG (Maks 10MB).
          </p>
          <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-indigo-300 border-dashed rounded-xl cursor-pointer bg-white hover:bg-indigo-50 transition-colors">
            <div className="flex flex-col items-center justify-center pt-5 pb-6">
              <UploadCloud className="w-8 h-8 mb-2 text-indigo-500" />
              <p className="text-sm text-gray-500">
                <span className="font-semibold text-indigo-600">Klik untuk memilih file</span> atau seret ke sini
              </p>
            </div>
            <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => {
              if (e.target.files?.[0]) setFile(e.target.files[0]);
            }} />
          </label>

          {file && (
            <div className="mt-4 flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg shadow-sm">
              <div className="flex items-center gap-3 overflow-hidden">
                <FileText className="w-5 h-5 text-indigo-600 shrink-0" />
                <span className="text-sm font-medium text-gray-700 truncate">{file.name}</span>
              </div>
              <button onClick={handleUpload} disabled={uploading}
                className="ml-4 shrink-0 inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                {uploading ? <><Loader2 className="w-4 h-4 animate-spin" /> Mengunggah...</> : "Unggah Sekarang"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Tombol Batalkan */}
      {currentStatus === "pending_signature" && (
        <div className="flex justify-center pt-2">
          <button onClick={handleCancel} disabled={cancelling || uploading}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-red-600 bg-red-50 border border-red-200 rounded-xl hover:bg-red-100 disabled:opacity-50 transition-colors">
            {cancelling ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Membatalkan...</>
            ) : (
              <><XCircle className="w-4 h-4" /> Batalkan Permintaan Serah Terima</>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
