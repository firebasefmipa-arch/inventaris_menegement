"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import {
  User, Mail, Phone, Building2, Shield, CheckCircle2,
  AlertCircle, Camera, Save, RefreshCcw, PenLine, Hash,
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

  useEffect(() => {
    fetchProfile();
  }, []);

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

      // Sinkronkan session
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

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-gray-200 rounded-lg w-48 animate-pulse" />
        <div className="bg-white rounded-2xl border border-gray-100 p-8 animate-pulse space-y-4">
          <div className="w-20 h-20 bg-gray-200 rounded-full mx-auto" />
          <div className="h-4 bg-gray-200 rounded w-1/3 mx-auto" />
          <div className="h-3 bg-gray-200 rounded w-1/4 mx-auto" />
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

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Profil Saya</h1>
        <p className="text-sm text-gray-500 mt-1">Kelola informasi diri dan akun kamu</p>
      </div>

      {/* Avatar & Status */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex flex-col sm:flex-row items-center sm:items-start gap-5">
        <div className="relative">
          {profile?.image ? (
            <img
              src={profile.image}
              alt={profile.name || "User"}
              className="w-20 h-20 rounded-full object-cover ring-4 ring-white shadow-md"
            />
          ) : (
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-2xl font-bold shadow-md">
              {(profile?.name || "U")[0].toUpperCase()}
            </div>
          )}
          <div className="absolute -bottom-1 -right-1 w-7 h-7 bg-white rounded-full flex items-center justify-center shadow border border-gray-100">
            <Camera className="w-3.5 h-3.5 text-gray-400" />
          </div>
        </div>
        <div className="text-center sm:text-left">
          <h2 className="text-xl font-bold text-gray-900">{profile?.name || "Pengguna"}</h2>
          <p className="text-sm text-gray-500">{profile?.email}</p>
          <p className="text-xs text-gray-400 mt-0.5">{profile?.department || "Belum diisi"}</p>
          <div className="mt-2 flex flex-wrap items-center justify-center sm:justify-start gap-2">
            <span className={clsx("inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full", statusConfig.bg, statusConfig.color)}>
              <StatusIcon className="w-3.5 h-3.5" />
              {statusConfig.label}
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700">
              <Shield className="w-3.5 h-3.5" />
              Pengguna
            </span>
          </div>
        </div>
      </div>

      {/* Form edit */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h3 className="font-bold text-gray-900 mb-5">Edit Informasi</h3>
        <form onSubmit={handleSave} className="space-y-5">
          {/* Email (read-only) */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
              Email Google
            </label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="email"
                disabled
                value={profile?.email || ""}
                className="block w-full pl-10 pr-4 py-2.5 bg-gray-100 border border-gray-200 rounded-xl text-sm text-gray-400 cursor-not-allowed"
              />
              <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              </div>
            </div>
            <p className="mt-1 text-xs text-gray-400">Email tidak bisa diubah karena terhubung dengan akun Google.</p>
          </div>

          {/* Nama */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">
              Nama Lengkap <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => handleChange("name", e.target.value)}
                className="block w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                placeholder="Nama lengkap sesuai identitas"
              />
            </div>
          </div>

          {/* No HP */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">
              No. WhatsApp / HP <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="tel"
                required
                value={form.phone}
                onChange={(e) => handleChange("phone", e.target.value)}
                className="block w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                placeholder="08123456789"
              />
            </div>
          </div>

          {/* NIM / NIK */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">
              NIM / NIK <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Hash className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                required
                value={form.nim}
                onChange={(e) => handleChange("nim", e.target.value)}
                className="block w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                placeholder="Nomor Induk Mahasiswa / Nomor Induk Karyawan"
              />
            </div>
          </div>

          {/* Departemen */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">
              Program Studi / Divisi <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <select
                required
                value={form.department}
                onChange={(e) => {
                  handleChange("department", e.target.value);
                  if (e.target.value !== "Lainnya (isi manual)") setCustomDepartment("");
                }}
                className="block w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 appearance-none transition-all"
              >
                <option value="" disabled>Pilih Program Studi / Divisi</option>
                {DEPARTMENT_GROUPS.map((group) => (
                  <optgroup key={group.group} label={`── ${group.group} ──`}>
                    {group.options.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            {/* Custom input */}
            {isCustom && (
              <div className="relative mt-2">
                <PenLine className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400 pointer-events-none" />
                <input
                  type="text"
                  autoFocus
                  required
                  value={customDepartment}
                  onChange={(e) => { setCustomDepartment(e.target.value); setDirty(true); }}
                  className="block w-full pl-10 pr-4 py-2.5 bg-indigo-50 border border-indigo-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                  placeholder="Tulis nama divisi / prodi kamu..."
                />
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={() => {
                setForm({
                  name: profile?.name || "",
                  phone: profile?.phone || "",
                  nim: profile?.nim || "",
                  department: ALL_DEPARTMENT_OPTIONS.includes(profile?.department || "")
                    ? (profile?.department || "")
                    : profile?.department
                    ? "Lainnya (isi manual)"
                    : "",
                });
                setCustomDepartment(
                  ALL_DEPARTMENT_OPTIONS.includes(profile?.department || "")
                    ? ""
                    : (profile?.department || "")
                );
                setDirty(false);
              }}
              disabled={!dirty}
              className="flex items-center gap-2 px-5 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-200 transition-colors disabled:opacity-40"
            >
              <RefreshCcw className="w-4 h-4" /> Reset
            </button>
            <button
              type="submit"
              disabled={saving || !dirty}
              className={clsx(
                "flex-1 flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all",
                (saving || !dirty)
                  ? "bg-gray-300 cursor-not-allowed"
                  : "bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-500/25"
              )}
            >
              {saving ? (
                <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Menyimpan...</>
              ) : (
                <><Save className="w-4 h-4" /> Simpan Perubahan</>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Info akun */}
      <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5 flex gap-3">
        <Shield className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-blue-800">Keamanan Akun</p>
          <p className="text-xs text-blue-600 mt-1">
            Akun kamu terhubung dengan Google OAuth. Login dilakukan menggunakan akun Google yang sudah terdaftar.
            Kamu tidak perlu mengingat password terpisah.
          </p>
        </div>
      </div>
    </div>
  );
}
