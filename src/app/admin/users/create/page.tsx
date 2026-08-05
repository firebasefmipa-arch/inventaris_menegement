"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  User, Mail, Lock, Phone, Building2,
  Eye, EyeOff, ShieldCheck, ArrowLeft, CheckCircle2,
} from "lucide-react";
import { createNativeAdmin } from "../actions";
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

export default function CreateNativeAdminPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    phone: "",
    department: "",
    customDepartment: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const isCustom = form.department === "Lainnya (isi manual)";
  const finalDepartment = isCustom ? form.customDepartment.trim() : form.department;

  const passwordStrength = () => {
    const p = form.password;
    if (!p) return null;
    let score = 0;
    if (p.length >= 8) score++;
    if (p.length >= 12) score++;
    if (/[A-Z]/.test(p)) score++;
    if (/[0-9]/.test(p)) score++;
    if (/[^A-Za-z0-9]/.test(p)) score++;
    if (score <= 1) return { label: "Lemah", color: "bg-red-500", width: "w-1/5" };
    if (score <= 2) return { label: "Cukup", color: "bg-amber-500", width: "w-2/5" };
    if (score <= 3) return { label: "Sedang", color: "bg-yellow-500", width: "w-3/5" };
    if (score <= 4) return { label: "Kuat", color: "bg-emerald-500", width: "w-4/5" };
    return { label: "Sangat Kuat", color: "bg-emerald-600", width: "w-full" };
  };

  const strength = passwordStrength();

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (form.password !== form.confirmPassword) {
      toast("Password dan konfirmasi tidak sama", "error");
      return;
    }
    if (form.password.length < 8) {
      toast("Password minimal 8 karakter", "error");
      return;
    }
    if (isCustom && !form.customDepartment.trim()) {
      toast("Isi nama divisi / prodi", "error");
      return;
    }

    setLoading(true);
    try {
      const res = await createNativeAdmin({
        name: form.name,
        email: form.email,
        password: form.password,
        phone: form.phone,
        department: finalDepartment,
      });

      if (!res.success) {
        toast(res.message, "error");
        return;
      }

      setSuccess(form.email);
      toast(res.message, "success");
    } catch {
      toast("Terjadi kesalahan sistem", "error");
    } finally {
      setLoading(false);
    }
  };

  // ── Tampilan sukses ──
  if (success) {
    return (
      <div className="max-w-lg mx-auto text-center space-y-6 py-12">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-emerald-100">
          <CheckCircle2 className="w-10 h-10 text-emerald-600" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Akun Berhasil Dibuat!</h2>
          <p className="text-sm text-gray-500 mt-2">
            Akun admin native untuk <span className="font-semibold text-gray-700">{success}</span> sudah aktif.
          </p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800 text-left space-y-1">
          <p className="font-semibold">⚠ Informasi Penting</p>
          <p>Sampaikan email dan password kepada admin yang bersangkutan secara aman.</p>
          <p>Admin dapat login di <code className="bg-amber-100 px-1.5 py-0.5 rounded font-mono">/admin/login</code></p>
        </div>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => {
              setSuccess(null);
              setForm({ name: "", email: "", password: "", confirmPassword: "", phone: "", department: "", customDepartment: "" });
            }}
            className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-200 transition-colors"
          >
            Buat Akun Lagi
          </button>
          <button
            onClick={() => router.push("/admin/users")}
            className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors"
          >
            Kembali ke Daftar User
          </button>
        </div>
      </div>
    );
  }

  // ── Form ──
  return (
    <div className="max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.push("/admin/users")}
          className="w-9 h-9 flex items-center justify-center bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-gray-600" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Buat Akun Admin Native</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Akun ini bisa login di <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">/admin/login</code> tanpa Google OAuth
          </p>
        </div>
      </div>

      {/* Info box */}
      <div className="flex gap-3 bg-indigo-50 border border-indigo-100 rounded-xl p-4">
        <ShieldCheck className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
        <p className="text-sm text-indigo-700">
          Akun yang dibuat di sini memiliki role <strong>Admin</strong> — dapat mengelola barang dan transaksi,
          namun tidak bisa mengubah role user atau membuat akun admin lain.
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="bg-white border border-gray-100 rounded-2xl shadow-sm p-6 space-y-5">
        {/* Nama */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">
            Nama Lengkap <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => handleChange("name", e.target.value)}
              placeholder="Nama lengkap admin"
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
            />
          </div>
        </div>

        {/* Email */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">
            Email (Username Login) <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => handleChange("email", e.target.value)}
              placeholder="admin@contoh.com"
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
            />
          </div>
        </div>

        {/* Password */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">
            Password <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type={showPassword ? "text" : "password"}
              required
              value={form.password}
              onChange={(e) => handleChange("password", e.target.value)}
              placeholder="Minimal 8 karakter"
              className="w-full pl-10 pr-11 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {/* Password strength bar */}
          {strength && (
            <div className="mt-2 space-y-1">
              <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                <div className={clsx("h-full rounded-full transition-all duration-300", strength.color, strength.width)} />
              </div>
              <p className="text-xs text-gray-500">Kekuatan: <span className="font-semibold">{strength.label}</span></p>
            </div>
          )}
        </div>

        {/* Konfirmasi Password */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">
            Konfirmasi Password <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type={showConfirm ? "text" : "password"}
              required
              value={form.confirmPassword}
              onChange={(e) => handleChange("confirmPassword", e.target.value)}
              placeholder="Ulangi password"
              className={clsx(
                "w-full pl-10 pr-11 py-2.5 bg-gray-50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all",
                form.confirmPassword && form.password !== form.confirmPassword
                  ? "border-red-300 focus:border-red-400"
                  : "border-gray-200 focus:border-indigo-500"
              )}
            />
            <button
              type="button"
              onClick={() => setShowConfirm((v) => !v)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              tabIndex={-1}
            >
              {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {form.confirmPassword && form.password !== form.confirmPassword && (
            <p className="text-xs text-red-500 mt-1">Password tidak sama</p>
          )}
        </div>

        <div className="border-t border-gray-100 pt-4 space-y-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Informasi Tambahan (opsional)</p>

          {/* No HP */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">
              No. WhatsApp / HP
            </label>
            <div className="relative">
              <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => handleChange("phone", e.target.value)}
                placeholder="08123456789"
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
              />
            </div>
          </div>

          {/* Divisi / Prodi */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">
              Program Studi / Divisi
            </label>
            <div className="relative">
              <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <select
                value={form.department}
                onChange={(e) => {
                  handleChange("department", e.target.value);
                  if (e.target.value !== "Lainnya (isi manual)") handleChange("customDepartment", "");
                }}
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 appearance-none transition-all"
              >
                <option value="">Pilih (opsional)</option>
                {DEPARTMENT_GROUPS.map((group) => (
                  <optgroup key={group.group} label={`── ${group.group} ──`}>
                    {group.options.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            {isCustom && (
              <input
                type="text"
                autoFocus
                value={form.customDepartment}
                onChange={(e) => handleChange("customDepartment", e.target.value)}
                className="mt-2 w-full px-4 py-2.5 bg-indigo-50 border border-indigo-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                placeholder="Tulis nama divisi / prodi..."
              />
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={() => router.push("/admin/users")}
            className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-200 transition-colors"
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={loading}
            className={clsx(
              "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white transition-all",
              loading
                ? "bg-indigo-400 cursor-not-allowed"
                : "bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-500/20"
            )}
          >
            {loading ? (
              <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Membuat Akun...</>
            ) : (
              <><ShieldCheck className="w-4 h-4" /> Buat Akun Admin</>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
