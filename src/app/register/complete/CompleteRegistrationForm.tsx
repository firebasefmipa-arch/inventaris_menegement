"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { User, Mail, Phone, Building2, CheckCircle, PenLine, X, Hash } from "lucide-react";
import { useToast } from "@/components/Toaster";
import { completeRegistration } from "./actions";
import { useSession, signOut } from "next-auth/react";
import clsx from "clsx";

const DIVISI_OPTIONS = [
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

const ALL_OPTIONS = DIVISI_OPTIONS.flatMap((g) => g.options);

export default function CompleteRegistrationForm({
  initialName,
  email,
}: {
  initialName: string;
  email: string;
}) {
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState("");
  const [nim, setNim] = useState("");
  const [department, setDepartment] = useState("");
  const [customDepartment, setCustomDepartment] = useState("");
  const [loading, setLoading] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const router = useRouter();
  const { toast } = useToast();
  const { update } = useSession();

  const isCustom = department === "Lainnya (isi manual)";
  const finalDepartment = isCustom ? customDepartment.trim() : department;

  const handleCancel = async () => {
    if (!confirm("Yakin ingin membatalkan pendaftaran? Kamu akan keluar dari akun.")) return;
    setCancelling(true);
    await signOut({ callbackUrl: "/" });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!phone.trim()) {
      toast("Nomor HP wajib diisi", "error");
      return;
    }
    if (!nim.trim()) {
      toast("NIM / NIK wajib diisi", "error");
      return;
    }
    if (!department) {
      toast("Program studi / divisi wajib dipilih", "error");
      return;
    }
    if (isCustom && !customDepartment.trim()) {
      toast("Isi nama divisi / prodi kamu", "error");
      return;
    }

    setLoading(true);
    try {
      const res = await completeRegistration({
        name,
        phone,
        nim,
        department: finalDepartment,
      });
      if (!res.success) throw new Error(res.message);

      toast(res.message, "success");
      await update({ phone, nim, department: finalDepartment, name });
      router.push("/dashboard/pinjam");
    } catch (error: any) {
      toast(error.message, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      {/* Email read-only */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
          Email Google
        </label>
        <div className="relative rounded-xl">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
            <Mail className="h-4 w-4 text-gray-400" />
          </div>
          <input
            type="email"
            disabled
            value={email}
            className="block w-full pl-10 pr-10 py-2.5 bg-gray-100 border border-gray-200 rounded-xl text-sm text-gray-400 cursor-not-allowed"
          />
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
            <CheckCircle className="h-4 w-4 text-emerald-500" />
          </div>
        </div>
      </div>

      {/* Nama */}
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">
          Nama Lengkap <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
            <User className="h-4 w-4 text-gray-400" />
          </div>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
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
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
            <Phone className="h-4 w-4 text-gray-400" />
          </div>
          <input
            type="tel"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
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
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
            <Hash className="h-4 w-4 text-gray-400" />
          </div>
          <input
            type="text"
            required
            value={nim}
            onChange={(e) => setNim(e.target.value)}
            className="block w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
            placeholder="Nomor Induk Mahasiswa / Nomor Induk Karyawan"
          />
        </div>
      </div>

      {/* Divisi / Prodi */}
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">
          Program Studi / Divisi <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
            <Building2 className="h-4 w-4 text-gray-400" />
          </div>
          <select
            required
            value={department}
            onChange={(e) => {
              setDepartment(e.target.value);
              if (e.target.value !== "Lainnya (isi manual)") setCustomDepartment("");
            }}
            className="block w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 appearance-none transition-all"
          >
            <option value="" disabled>Pilih Program Studi / Divisi</option>
            {DIVISI_OPTIONS.map((group) => (
              <optgroup key={group.group} label={`── ${group.group} ──`}>
                {group.options.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {/* Custom input muncul jika pilih "Lainnya" */}
        {isCustom && (
          <div className="relative mt-2">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
              <PenLine className="h-4 w-4 text-indigo-400" />
            </div>
            <input
              type="text"
              autoFocus
              required
              value={customDepartment}
              onChange={(e) => setCustomDepartment(e.target.value)}
              className="block w-full pl-10 pr-4 py-2.5 bg-indigo-50 border border-indigo-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
              placeholder="Tulis nama divisi / prodi kamu..."
            />
          </div>
        )}
      </div>

      <div className="flex gap-3 pt-1">
        <button
          type="button"
          onClick={handleCancel}
          disabled={cancelling || loading}
          className="flex items-center justify-center gap-2 px-5 py-3 bg-gray-100 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-200 disabled:opacity-50 transition-colors"
        >
          <X className="w-4 h-4" />
          Batalkan
        </button>

        <button
          type="submit"
          disabled={loading || cancelling}
          className={clsx(
            "flex-1 flex justify-center items-center gap-2 py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all",
            (loading || cancelling) && "opacity-50 cursor-not-allowed"
          )}
        >
          {loading ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Menyimpan...
            </>
          ) : (
            "Selesaikan Pendaftaran →"
          )}
        </button>
      </div>
    </form>
  );
}
