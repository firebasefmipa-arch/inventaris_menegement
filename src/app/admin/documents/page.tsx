"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  FileText, Download, RefreshCcw, FolderOpen,
  FileArchive, AlertCircle, HardDrive,
  File, Eye, Trash2, AlertTriangle, ShieldAlert,
} from "lucide-react";
import clsx from "clsx";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";

interface DocumentFile {
  name: string;
  folder: "signed_forms" | "handovers";
  url: string;
  size: number;
  createdAt: number;
}

interface DocumentsData {
  signedForms: DocumentFile[];
  handovers: DocumentFile[];
  totalFiles: number;
  totalSize: number;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function getFileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return <FileText className="w-4 h-4 text-red-500" />;
  if (["jpg", "jpeg", "png", "webp"].includes(ext || ""))
    return <File className="w-4 h-4 text-blue-500" />;
  return <File className="w-4 h-4 text-gray-400" />;
}

type ExportTarget = "all" | "signed_forms" | "handovers";

const FOLDER_LABELS: Record<string, string> = {
  signed_forms: "Formulir Peminjaman",
  handovers: "Formulir Serah Terima",
};

export default function DocumentsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [data, setData] = useState<DocumentsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"signed_forms" | "handovers">("signed_forms");
  const [exporting, setExporting] = useState<ExportTarget | null>(null);
  const [showExportModal, setShowExportModal] = useState<ExportTarget | null>(null);

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<DocumentFile | null>(null);
  const [backupConfirmed, setBackupConfirmed] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/documents");
      if (!res.ok) throw new Error("Gagal memuat data dokumen");
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err.message || "Terjadi kesalahan");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  // Guard — hanya super_admin
  useEffect(() => {
    if (status === "authenticated") {
      const role = (session?.user as any)?.role;
      if (role !== "super_admin") router.replace("/admin");
    }
  }, [status, session, router]);

  const handleExport = async (target: ExportTarget) => {
    setExporting(target);
    setShowExportModal(null);
    try {
      const param = target === "all" ? "" : `?folder=${target}`;
      const res = await fetch(`/api/admin/documents/export${param}`);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Gagal mengekspor dokumen");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const cd = res.headers.get("Content-Disposition") || "";
      const match = cd.match(/filename="(.+)"/);
      a.download = match?.[1] || "dokumen.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.message || "Gagal mengekspor dokumen");
    } finally {
      setExporting(null);
    }
  };

  // Hitung size per target export
  const getSizeForTarget = (target: ExportTarget): number => {
    if (!data) return 0;
    if (target === "all") return data.totalSize;
    if (target === "signed_forms") return data.signedForms.reduce((s, f) => s + f.size, 0);
    return data.handovers.reduce((s, f) => s + f.size, 0);
  };

  const getCountForTarget = (target: ExportTarget): number => {
    if (!data) return 0;
    if (target === "all") return data.totalFiles;
    if (target === "signed_forms") return data.signedForms.length;
    return data.handovers.length;
  };

  const handleDelete = async () => {
    if (!deleteTarget || !backupConfirmed) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/admin/documents/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder: deleteTarget.folder, filename: deleteTarget.name }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal menghapus");
      setDeleteTarget(null);
      setBackupConfirmed(false);
      await fetchData();
    } catch (err: any) {
      alert(err.message || "Gagal menghapus file");
    } finally {
      setDeleting(false);
    }
  };

  const activeFiles = activeTab === "signed_forms" ? data?.signedForms ?? [] : data?.handovers ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Manajemen Dokumen</h1>
          <p className="text-sm text-gray-500 mt-1">
            Kelola dan backup semua dokumen formulir yang telah diupload
          </p>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors self-start sm:self-auto"
        >
          <RefreshCcw className={clsx("w-4 h-4", loading && "animate-spin")} />
          Refresh
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Stats cards */}
      {data && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Total semua */}
          <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
                <HardDrive className="w-5 h-5 text-indigo-600" />
              </div>
              <span className="text-sm font-semibold text-gray-700">Total Semua</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{data.totalFiles} file</p>
            <p className="text-sm text-gray-500 mt-1">{formatBytes(data.totalSize)}</p>
          </div>

          {/* Formulir Peminjaman */}
          <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
                <FileText className="w-5 h-5 text-amber-600" />
              </div>
              <span className="text-sm font-semibold text-gray-700">Formulir Peminjaman</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{data.signedForms.length} file</p>
            <p className="text-sm text-gray-500 mt-1">
              {formatBytes(data.signedForms.reduce((s, f) => s + f.size, 0))}
            </p>
          </div>

          {/* Formulir Serah Terima */}
          <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center">
                <FileText className="w-5 h-5 text-teal-600" />
              </div>
              <span className="text-sm font-semibold text-gray-700">Formulir Serah Terima</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{data.handovers.length} file</p>
            <p className="text-sm text-gray-500 mt-1">
              {formatBytes(data.handovers.reduce((s, f) => s + f.size, 0))}
            </p>
          </div>
        </div>
      )}

      {/* Export buttons */}
      {data && (
        <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm space-y-3">
          <h2 className="text-sm font-bold text-gray-700 flex items-center gap-2">
            <FileArchive className="w-4 h-4 text-indigo-500" />
            Export / Backup Dokumen
          </h2>
          <p className="text-xs text-gray-500">
            Download semua dokumen sebagai file ZIP untuk backup lokal.
          </p>
          <div className="flex flex-wrap gap-3">
            {(["all", "signed_forms", "handovers"] as ExportTarget[]).map((target) => {
              const count = getCountForTarget(target);
              const size = getSizeForTarget(target);
              const label =
                target === "all" ? "Semua Dokumen" :
                target === "signed_forms" ? "Formulir Peminjaman" : "Formulir Serah Terima";
              const color =
                target === "all" ? "bg-indigo-600 hover:bg-indigo-700 shadow-indigo-500/20" :
                target === "signed_forms" ? "bg-amber-500 hover:bg-amber-600 shadow-amber-500/20" :
                "bg-teal-600 hover:bg-teal-700 shadow-teal-500/20";
              const isExporting = exporting === target;

              return (
                <button
                  key={target}
                  onClick={() => setShowExportModal(target)}
                  disabled={count === 0 || exporting !== null}
                  className={clsx(
                    "flex items-center gap-2 px-4 py-2.5 text-white text-sm font-semibold rounded-xl shadow-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                    color
                  )}
                >
                  {isExporting ? (
                    <RefreshCcw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  {isExporting ? "Memproses..." : label}
                  {!isExporting && count > 0 && (
                    <span className="text-xs opacity-75">({count} file)</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* File list */}
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
        {/* Tabs */}
        <div className="flex border-b border-gray-100">
          {(["signed_forms", "handovers"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={clsx(
                "flex items-center gap-2 px-5 py-3.5 text-sm font-semibold transition-colors border-b-2",
                activeTab === tab
                  ? tab === "signed_forms"
                    ? "border-amber-500 text-amber-600"
                    : "border-teal-500 text-teal-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              )}
            >
              <FolderOpen className="w-4 h-4" />
              {FOLDER_LABELS[tab]}
              {data && (
                <span className={clsx(
                  "text-xs px-1.5 py-0.5 rounded-full font-medium",
                  activeTab === tab
                    ? tab === "signed_forms" ? "bg-amber-100 text-amber-700" : "bg-teal-100 text-teal-700"
                    : "bg-gray-100 text-gray-500"
                )}>
                  {tab === "signed_forms" ? data.signedForms.length : data.handovers.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* File list content */}
        {loading ? (
          <div className="p-8 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : activeFiles.length === 0 ? (
          <div className="text-center py-16">
            <FolderOpen className="w-12 h-12 text-gray-200 mx-auto mb-3" />
            <p className="text-sm font-semibold text-gray-500">Belum ada dokumen</p>
            <p className="text-xs text-gray-400 mt-1">
              Dokumen akan muncul setelah user mengupload formulir
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {/* Header tabel */}
            <div className="grid grid-cols-12 gap-4 px-5 py-2.5 bg-gray-50 text-xs font-semibold text-gray-400 uppercase tracking-wide">
              <div className="col-span-5">Nama File</div>
              <div className="col-span-2 text-right">Ukuran</div>
              <div className="col-span-3">Tanggal Upload</div>
              <div className="col-span-2 text-center">Aksi</div>
            </div>

            {activeFiles.map((file) => (
              <div
                key={file.name}
                className="grid grid-cols-12 gap-4 px-5 py-3 items-center hover:bg-gray-50/50 transition-colors"
              >
                {/* Nama file */}
                <div className="col-span-5 flex items-center gap-2.5 min-w-0">
                  {getFileIcon(file.name)}
                  <span className="text-sm text-gray-800 font-medium truncate" title={file.name}>
                    {file.name}
                  </span>
                </div>

                {/* Ukuran */}
                <div className="col-span-2 text-right text-xs text-gray-500 font-mono">
                  {formatBytes(file.size)}
                </div>

                {/* Tanggal */}
                <div className="col-span-3 text-xs text-gray-500">
                  {format(new Date(file.createdAt), "dd MMM yyyy, HH:mm", { locale: idLocale })}
                </div>

                {/* Aksi */}
                <div className="col-span-2 flex items-center justify-center gap-1">
                  <a
                    href={file.url}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                    title="Lihat dokumen"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </a>
                  <a
                    href={file.url}
                    download
                    className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                    title="Download"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </a>
                  <button
                    type="button"
                    onClick={() => { setDeleteTarget(file); setBackupConfirmed(false); }}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                    title="Hapus dokumen"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Export Confirmation Modal */}
      {showExportModal && data && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowExportModal(null)}
          />
          <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center">
                <FileArchive className="w-6 h-6 text-indigo-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">Konfirmasi Export</h3>
                <p className="text-xs text-gray-500">
                  {showExportModal === "all"
                    ? "Semua Dokumen"
                    : FOLDER_LABELS[showExportModal]}
                </p>
              </div>
            </div>

            {/* Info size */}
            <div className="bg-gray-50 rounded-xl p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Jumlah file</span>
                <span className="font-semibold text-gray-900">
                  {getCountForTarget(showExportModal)} file
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Total ukuran</span>
                <span className="font-semibold text-gray-900">
                  {formatBytes(getSizeForTarget(showExportModal))}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Format</span>
                <span className="font-semibold text-gray-900">ZIP</span>
              </div>
            </div>

            <p className="text-xs text-gray-500">
              File akan diunduh ke komputer kamu. Simpan di tempat yang aman untuk backup.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setShowExportModal(null)}
                className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors"
              >
                Batal
              </button>
              <button
                onClick={() => handleExport(showExportModal)}
                className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                Download ZIP
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => { setDeleteTarget(null); setBackupConfirmed(false); }}
          />
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 space-y-4">
            {/* Header */}
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">Hapus Dokumen?</h3>
                <p className="text-xs text-gray-500 mt-0.5">Tindakan ini tidak dapat diurungkan</p>
              </div>
            </div>

            {/* Nama file */}
            <div className="bg-gray-50 rounded-xl p-3.5 flex items-center gap-3 border border-gray-100">
              {getFileIcon(deleteTarget.name)}
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-800 truncate">{deleteTarget.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {FOLDER_LABELS[deleteTarget.folder]} · {formatBytes(deleteTarget.size)}
                </p>
              </div>
            </div>

            {/* Peringatan backup */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
                <p className="text-sm font-bold text-amber-800">Pastikan sudah dibackup!</p>
              </div>
              <p className="text-xs text-amber-700 leading-relaxed">
                File yang dihapus <strong>tidak bisa dipulihkan</strong>. Pastikan kamu sudah
                mendownload backup dokumen ini sebelum melanjutkan. Gunakan tombol{" "}
                <strong>Export / Backup</strong> di atas jika belum.
              </p>
            </div>

            {/* Checkbox konfirmasi backup */}
            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={backupConfirmed}
                onChange={(e) => setBackupConfirmed(e.target.checked)}
                className="w-4 h-4 mt-0.5 text-red-600 bg-white border-gray-300 rounded focus:ring-red-500 cursor-pointer shrink-0"
              />
              <span className="text-sm text-gray-700 group-hover:text-gray-900 transition-colors">
                Saya sudah melakukan backup dan memahami bahwa file ini akan dihapus permanen
              </span>
            </label>

            {/* Tombol */}
            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => { setDeleteTarget(null); setBackupConfirmed(false); }}
                className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={!backupConfirmed || deleting}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {deleting ? (
                  <><RefreshCcw className="w-4 h-4 animate-spin" /> Menghapus...</>
                ) : (
                  <><Trash2 className="w-4 h-4" /> Hapus Permanen</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
