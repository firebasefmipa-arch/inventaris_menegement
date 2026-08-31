"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import {
  User, Mail, Phone, Building2, Shield, CheckCircle2,
  AlertCircle, Camera, Save, RefreshCcw, PenLine, Hash,
  Upload, Trash2, PenTool, ImageIcon, Info,
} from "lucide-react";
import { useToast } from "@/components/Toaster";
import clsx from "clsx";

const DEPARTMENT_GROUPS = [
  { group: "Divisi", options: [
    "Divisi Administrasi Akademik",
    "Divisi Administrasi Keuangan",
    "Divisi Teknologi Informasi",
    "Divisi Administrasi Umum, Rumah Tangga",
  ]},
  { group: "Program Studi", options: [
    "D3 Analisis Kimia",
    "S1 Statistika",
    "S1 Kimia",
    "S1 Farmasi",
    "S1 Pendidikan Kimia",
    "Program Profesi Apoteker",
    "S2 Magister Kimia",
    "S2 Magister Farmasi",
    "S2 Magister Statistika",
  ]},
  { group: "Lainnya", options: ["Lainnya (isi manual)"] },
];

const ALL_DEPARTMENT_OPTIONS = DEPARTMENT_GROUPS.flatMap((g) => g.options);

type ProfileData = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  nim: string | null;
  department: string | null;
  image: string | null;
  status: string | null;
  signatureUrl: string | null;
};

export default function ProfilPage() {
  const { data: session, update } = useSession();
  const { toast } = useToast();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", nim: "", department: "" });
  const [customDepartment, setCustomDepartment] = useState("");
  const [dirty, setDirty] = useState(false);

  // Signature state
  const [sigFile, setSigFile] = useState<File | null>(null);
  const [sigPreview, setSigPreview] = useState<string | null>(null);
  const [uploadingSig, setUploadingSig] = useState(false);
  const [deletingSig, setDeletingSig] = useState(false);
  const sigInputRef = useRef<HTMLInputElement>(null);

  const isCustom = form.department === "Lainnya (isi manual)";
  const finalDepartment = isCustom ? customDepartment.trim() : form.department;

  const fetchProfile = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/user/profile");
      const data = await res.json();
      setProfile(data);
      setForm({
        name: data.name || "",
        phone: data.phone || "",
        nim: data.nim || "",
        department: ALL_DEPARTMENT_OPTIONS.includes(data.department || "")
          ? (data.department || "")
          : data.department
          ? "Lainnya (isi manual)"
          : "",
      });
      setCustomDepartment(
        ALL_DEPARTMENT_OPTIONS.includes(data.department || "") ? "" : (data.department || "")
      );
    } catch {
      toast("Gagal memuat profil", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchProfile(); }, []);

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setDirty(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.phone.trim() || !form.nim.trim() || !form.department) {
      toast("Semua field wajib diisi", "error");
      return;
    }
    if (isCustom && !customDepartment.trim()) {
      toast("Isi nama divisi / prodi kamu", "error");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, department: finalDepartment }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await update({ name: form.name, phone: form.phone, nim: form.nim, department: finalDepartment });
      setDirty(false);
      toast("Profil berhasil diperbarui", "success");
      fetchProfile();
    } catch (err: any) {
      toast(err.message || "Gagal menyimpan profil", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleSigSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast("Ukuran file maksimal 5 MB", "error");
      return;
    }
    if (!["image/png", "image/jpeg", "image/jpg", "image/webp"].includes(file.type)) {
      toast("Hanya PNG, JPG, atau WEBP yang diizinkan", "error");
      return;
    }
    setSigFile(file);
    setSigPreview(URL.createObjectURL(file));
  };

  const handleSigUpload = async () => {
    if (!sigFile) return;
    setUploadingSig(true);
    try {
      const fd = new FormData();
      fd.append("file", sigFile);
      const res = await fetch("/api/user/signature", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast("Tanda tangan berhasil disimpan", "success");
      setSigFile(null);
      setSigPreview(null);
      if (sigInputRef.current) sigInputRef.current.value = "";
      fetchProfile();
    } catch (err: any) {
      toast(err.message || "Gagal upload tanda tangan", "error");
    } finally {
      setUploadingSig(false);
    }
  };

  const handleSigDelete = async () => {
    if (!confirm("Hapus tanda tangan elektronik? Kamu tidak akan bisa meminjam tanpa tanda tangan.")) return;
    setDeletingSig(true);
    try {
      const res = await fetch("/api/user/signature", { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast("Tanda tangan dihapus", "success");
      fetchProfile();
    } catch {
      toast("Gagal menghapus tanda tangan", "error");
    } finally {
      setDeletingSig(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-gray-200 dark:bg-slate-700 rounded-lg w-48 animate-pulse" />
        <div className="bg-white dark:bg-[#162035] rounded-2xl border border-gray-100 dark:border-[#1c2e48] p-8 animate-pulse space-y-4">
          <div className="w-20 h-20 bg-gray-200 dark:bg-slate-700 rounded-full mx-auto" />
        </div>
      </div>
    );
  }

  const user = session?.user as any;
  const statusConfig = {
    active: { label: "Aktif", color: "text-emerald-700", bg: "bg-emerald-50", icon: CheckCircle2 },
    pending: { label: "Menunggu", color: "text-amber-700", bg: "bg-amber-50", icon: AlertCircle },
    suspended: { label: "Ditangguhkan", color: "text-red-700", bg: "bg-red-50", icon: AlertCircle },
  }[profile?.status || "active"] ?? { label: "Aktif", color: "text-emerald-700", bg: "bg-emerald-50", icon: CheckCircle2 };
  const StatusIcon = statusConfig.icon;
  const hasSignature = !!profile?.signatureUrl;

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">Profil Saya</h1>
        <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">Kelola informasi diri dan tanda tangan elektronik</p>
      </div>

      {/* Avatar & Status */}
      <div className="bg-white dark:bg-[#162035] rounded-2xl border border-gray-100 dark:border-[#1c2e48] shadow-sm p-6 flex flex-col sm:flex-row items-center sm:items-start gap-5">
        <div className="relative">
          {profile?.image ? (
            <img src={profile.image} alt={profile.name || "User"} className="w-20 h-20 rounded-full object-cover ring-4 ring-white dark:ring-slate-800 shadow-md" />
          ) : (
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-2xl font-bold shadow-md">
              {(profile?.name || "U")[0].toUpperCase()}
            </div>
          )}
          <div className="absolute -bottom-1 -right-1 w-7 h-7 bg-white dark:bg-slate-800 rounded-full flex items-center justify-center shadow border border-gray-100 dark:border-slate-700">
            <Camera className="w-3.5 h-3.5 text-gray-400" />
          </div>
        </div>
        <div className="text-center sm:text-left">
          <h2 className="text-xl font-bold text-gray-900 dark:text-slate-100">{profile?.name || "Pengguna"}</h2>
          <p className="text-sm text-gray-500 dark:text-slate-400">{profile?.email}</p>
          <p className="text-xs text-gray-400 mt-0.5">{profile?.department || "Belum diisi"}</p>
          <div className="mt-2 flex flex-wrap items-center justify-center sm:justify-start gap-2">
            <span className={clsx("inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full", statusConfig.bg, statusConfig.color)}>
              <StatusIcon className="w-3.5 h-3.5" />
              {statusConfig.label}
            </span>
            <span className={clsx(
              "inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full",
              hasSignature ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
            )}>
              <PenTool className="w-3.5 h-3.5" />
              {hasSignature ? "TTD Tersimpan" : "Belum Ada TTD"}
            </span>
          </div>
        </div>
      </div>

      {/* ── Tanda Tangan Elektronik ── */}
      <div className="bg-white dark:bg-[#162035] rounded-2xl border border-gray-100 dark:border-[#1c2e48] shadow-sm p-6">
        <div className="flex items-center gap-2 mb-4">
          <PenTool className="w-5 h-5 text-indigo-500" />
          <h3 className="font-bold text-gray-900 dark:text-slate-100">Tanda Tangan Elektronik</h3>
          {hasSignature && <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 font-medium">Aktif</span>}
        </div>

        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-xl p-3 mb-4 flex gap-2.5">
          <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
            Tanda tangan elektronik <strong>wajib diupload</strong> sebelum dapat mengajukan peminjaman atau serah terima.
            Upload gambar tanda tangan kamu dalam format PNG/JPG dengan background putih atau transparan.
          </p>
        </div>

        {/* Preview TTD tersimpan */}
        {hasSignature && !sigPreview && (
          <div className="mb-4">
            <p className="text-xs text-gray-500 dark:text-slate-400 mb-2 font-medium">Tanda tangan tersimpan:</p>
            <div className="relative inline-block border-2 border-dashed border-gray-200 dark:border-[#1c2e48] rounded-xl overflow-hidden bg-white">
              <img
                src={profile!.signatureUrl!}
                alt="Tanda tangan"
                className="h-24 w-auto max-w-xs object-contain p-2"
              />
            </div>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => sigInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"
              >
                <Upload className="w-3.5 h-3.5" /> Ganti
              </button>
              <button
                type="button"
                onClick={handleSigDelete}
                disabled={deletingSig}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" /> {deletingSig ? "Menghapus..." : "Hapus"}
              </button>
            </div>
          </div>
        )}

        {/* Preview file baru yang dipilih */}
        {sigPreview && (
          <div className="mb-4">
            <p className="text-xs text-gray-500 dark:text-slate-400 mb-2 font-medium">Preview tanda tangan baru:</p>
            <div className="relative inline-block border-2 border-dashed border-indigo-300 dark:border-indigo-700 rounded-xl overflow-hidden bg-white">
              <img src={sigPreview} alt="Preview TTD" className="h-24 w-auto max-w-xs object-contain p-2" />
            </div>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={handleSigUpload}
                disabled={uploadingSig}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
              >
                {uploadingSig
                  ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Menyimpan...</>
                  : <><Save className="w-3.5 h-3.5" /> Simpan Tanda Tangan</>
                }
              </button>
              <button
                type="button"
                onClick={() => { setSigFile(null); setSigPreview(null); if (sigInputRef.current) sigInputRef.current.value = ""; }}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors"
              >
                Batal
              </button>
            </div>
          </div>
        )}

        {/* Drop zone upload */}
        {!hasSignature && !sigPreview && (
          <div
            onClick={() => sigInputRef.current?.click()}
            className="border-2 border-dashed border-gray-200 dark:border-[#1c2e48] rounded-xl p-8 text-center cursor-pointer hover:border-indigo-300 dark:hover:border-indigo-700 hover:bg-indigo-50/30 dark:hover:bg-indigo-900/10 transition-all"
          >
            <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl flex items-center justify-center mx-auto mb-3">
              <ImageIcon className="w-6 h-6 text-indigo-500" />
            </div>
            <p className="text-sm font-semibold text-gray-700 dark:text-slate-300">Klik untuk upload tanda tangan</p>
            <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">PNG, JPG, atau WEBP — maks 5 MB</p>
          </div>
        )}

        {/* Hidden input */}
        <input
          ref={sigInputRef}
          type="file"
          accept="image/png,image/jpeg,image/jpg,image/webp"
          onChange={handleSigSelect}
          className="hidden"
        />
      </div>

      {/* Form edit profil */}
      <div className="bg-white dark:bg-[#162035] rounded-2xl border border-gray-100 dark:border-[#1c2e48] shadow-sm p-6">
        <h3 className="font-bold text-gray-900 dark:text-slate-100 mb-5">Edit Informasi</h3>
        <form onSubmit={handleSave} className="space-y-5">
          {/* Email read-only */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-slate-400 mb-1.5 uppercase tracking-wide">Email Google</label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="email" disabled value={profile?.email || ""}
                className="block w-full pl-10 pr-4 py-2.5 bg-gray-100 dark:bg-[#0e1c30] border border-gray-200 dark:border-[#1c2e48] rounded-xl text-sm text-gray-400 cursor-not-allowed" />
              <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              </div>
            </div>
            <p className="mt-1 text-xs text-gray-400 dark:text-slate-500">Email tidak bisa diubah karena terhubung dengan akun Google.</p>
          </div>

          {/* Nama */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1.5 uppercase tracking-wide">Nama Lengkap <span className="text-red-500">*</span></label>
            <div className="relative">
              <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="text" required value={form.name} onChange={(e) => handleChange("name", e.target.value)}
                className="block w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-[#0e1c30] border border-gray-200 dark:border-[#1c2e48] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                placeholder="Nama lengkap sesuai identitas" />
            </div>
          </div>

          {/* No HP */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1.5 uppercase tracking-wide">No. WhatsApp / HP <span className="text-red-500">*</span></label>
            <div className="relative">
              <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="tel" required value={form.phone} onChange={(e) => handleChange("phone", e.target.value)}
                className="block w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-[#0e1c30] border border-gray-200 dark:border-[#1c2e48] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                placeholder="08123456789" />
            </div>
          </div>

          {/* NIM */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1.5 uppercase tracking-wide">NIM / NIK <span className="text-red-500">*</span></label>
            <div className="relative">
              <Hash className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="text" required value={form.nim} onChange={(e) => handleChange("nim", e.target.value)}
                className="block w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-[#0e1c30] border border-gray-200 dark:border-[#1c2e48] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                placeholder="Nomor Induk Mahasiswa / Nomor Induk Karyawan" />
            </div>
          </div>

          {/* Departemen */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1.5 uppercase tracking-wide">Program Studi / Divisi <span className="text-red-500">*</span></label>
            <div className="relative">
              <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <select required value={form.department}
                onChange={(e) => { handleChange("department", e.target.value); if (e.target.value !== "Lainnya (isi manual)") setCustomDepartment(""); }}
                className="block w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-[#0e1c30] border border-gray-200 dark:border-[#1c2e48] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 appearance-none transition-all">
                <option value="" disabled>Pilih Program Studi / Divisi</option>
                {DEPARTMENT_GROUPS.map((group) => (
                  <optgroup key={group.group} label={`── ${group.group} ──`}>
                    {group.options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
            {isCustom && (
              <div className="relative mt-2">
                <PenLine className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400 pointer-events-none" />
                <input type="text" autoFocus required value={customDepartment}
                  onChange={(e) => { setCustomDepartment(e.target.value); setDirty(true); }}
                  className="block w-full pl-10 pr-4 py-2.5 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-300 dark:border-indigo-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                  placeholder="Tulis nama divisi / prodi kamu..." />
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={() => {
              setForm({ name: profile?.name || "", phone: profile?.phone || "", nim: profile?.nim || "",
                department: ALL_DEPARTMENT_OPTIONS.includes(profile?.department || "") ? (profile?.department || "") : profile?.department ? "Lainnya (isi manual)" : "" });
              setCustomDepartment(ALL_DEPARTMENT_OPTIONS.includes(profile?.department || "") ? "" : (profile?.department || ""));
              setDirty(false);
            }} disabled={!dirty}
              className="flex items-center gap-2 px-5 py-2.5 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 rounded-xl text-sm font-semibold hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-40">
              <RefreshCcw className="w-4 h-4" /> Reset
            </button>
            <button type="submit" disabled={saving || !dirty}
              className={clsx("flex-1 flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all",
                (saving || !dirty) ? "bg-gray-300 dark:bg-slate-700 cursor-not-allowed" : "bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-500/25")}>
              {saving
                ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Menyimpan...</>
                : <><Save className="w-4 h-4" /> Simpan Perubahan</>}
            </button>
          </div>
        </form>
      </div>

      {/* Info akun */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/50 rounded-2xl p-5 flex gap-3">
        <Shield className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">Keamanan Akun</p>
          <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
            Akun kamu terhubung dengan Google OAuth. Login dilakukan menggunakan akun Google yang sudah terdaftar.
          </p>
        </div>
      </div>
    </div>
  );
}
