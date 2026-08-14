"use client";

import { useState } from "react";
import { Eye, EyeOff, RefreshCcw, KeyRound, X, Check, Loader2 } from "lucide-react";
import { resetNativePassword, getDecryptedPassword } from "./actions";
import { useToast } from "@/components/Toaster";

interface Props {
  userId: string;
  userName: string;
}

export function NativePasswordButton({ userId, userName }: Props) {
  const { toast } = useToast();

  // State lihat password
  const [showPassword, setShowPassword] = useState(false);
  const [decryptedPassword, setDecryptedPassword] = useState<string | null>(null);
  const [decryptLoading, setDecryptLoading] = useState(false);

  // State reset password
  const [showResetModal, setShowResetModal] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [showNewPw, setShowNewPw] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  const handleTogglePassword = async () => {
    if (showPassword) {
      // Sembunyikan
      setShowPassword(false);
      return;
    }

    // Belum pernah dekripsi — fetch dari server
    if (!decryptedPassword) {
      setDecryptLoading(true);
      try {
        const res = await getDecryptedPassword(userId);
        if (!res.success) throw new Error(res.message);
        setDecryptedPassword(res.password ?? "—");
      } catch (err: any) {
        toast(err.message || "Gagal mendekripsi password", "error");
        return;
      } finally {
        setDecryptLoading(false);
      }
    }

    setShowPassword(true);
  };

  const handleReset = async () => {
    if (newPassword.length < 8) {
      toast("Password minimal 8 karakter", "error");
      return;
    }
    setResetLoading(true);
    try {
      const res = await resetNativePassword(userId, newPassword);
      if (!res.success) throw new Error(res.message);
      toast(res.message, "success");
      // Reset cache dekripsi agar saat dilihat lagi ambil yang baru
      setDecryptedPassword(null);
      setShowPassword(false);
      setShowResetModal(false);
      setNewPassword("");
    } catch (err: any) {
      toast(err.message || "Gagal mereset password", "error");
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-1.5">
        {/* Lihat / sembunyikan password */}
        <div className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 min-w-[110px]">
          <KeyRound className="w-3 h-3 text-gray-400 shrink-0" />
          <span className="text-xs font-mono text-gray-700 flex-1 truncate">
            {decryptLoading ? "..." : showPassword ? (decryptedPassword ?? "—") : "••••••••"}
          </span>
          <button
            type="button"
            onClick={handleTogglePassword}
            disabled={decryptLoading}
            className="ml-1 text-gray-400 hover:text-gray-600 transition-colors shrink-0 disabled:opacity-50"
            title={showPassword ? "Sembunyikan password" : "Lihat password"}
          >
            {decryptLoading
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : showPassword
              ? <EyeOff className="w-3.5 h-3.5" />
              : <Eye className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Tombol reset */}
        <button
          type="button"
          onClick={() => setShowResetModal(true)}
          className="p-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-600 hover:bg-amber-100 transition-colors"
          title="Reset password"
        >
          <RefreshCcw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Modal Reset Password */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => { setShowResetModal(false); setNewPassword(""); }}
          />
          <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900">Reset Password</h3>
              <button
                onClick={() => { setShowResetModal(false); setNewPassword(""); }}
                className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            <p className="text-sm text-gray-500">
              Reset password untuk akun{" "}
              <span className="font-semibold text-gray-700">{userName}</span>.
            </p>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">
                Password Baru <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showNewPw ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimal 8 karakter"
                  autoFocus
                  className="w-full pl-3 pr-10 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPw((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showNewPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {newPassword.length > 0 && newPassword.length < 8 && (
                <p className="text-xs text-red-500 mt-1">Minimal 8 karakter</p>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => { setShowResetModal(false); setNewPassword(""); }}
                className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleReset}
                disabled={resetLoading || newPassword.length < 8}
                className="flex-1 py-2.5 bg-amber-500 text-white rounded-xl text-sm font-semibold hover:bg-amber-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {resetLoading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Mereset...</>
                ) : (
                  <><Check className="w-4 h-4" /> Reset Password</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
