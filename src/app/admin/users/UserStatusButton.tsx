"use client";

import { useState } from "react";
import { toggleUserStatus } from "./actions";
import { Ban, CheckCircle } from "lucide-react";
import clsx from "clsx";

export function UserStatusButton({
  userId,
  currentStatus,
  isCurrentUser,
  callerRole,
  targetRole,
}: {
  userId: string;
  currentStatus: string;
  isCurrentUser: boolean;
  callerRole: string;
  targetRole: string;
}) {
  const [isLoading, setIsLoading] = useState(false);

  const isSuspended = currentStatus === "suspended";

  // Admin biasa tidak bisa suspend super_admin atau admin lain
  const cannotAct =
    isCurrentUser ||
    (callerRole === "admin" && (targetRole === "super_admin" || targetRole === "admin"));

  const getTitle = () => {
    if (isCurrentUser) return "Tidak dapat mengubah status akun sendiri";
    if (callerRole === "admin" && targetRole === "super_admin") return "Admin tidak dapat suspend Super Admin";
    if (callerRole === "admin" && targetRole === "admin") return "Admin tidak dapat suspend Admin lain";
    return isSuspended ? "Aktifkan Akun" : "Suspend Akun";
  };

  const handleToggle = async () => {
    if (cannotAct) return;

    const actionText = isSuspended ? "mengaktifkan kembali" : "menangguhkan (suspend)";
    if (!confirm(`Apakah Anda yakin ingin ${actionText} akun ini?`)) return;

    setIsLoading(true);
    try {
      const result = await toggleUserStatus(userId, currentStatus);
      if (!result.success) alert(result.message);
    } catch {
      alert("Terjadi kesalahan sistem.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      onClick={handleToggle}
      disabled={isLoading || cannotAct}
      title={getTitle()}
      className={clsx(
        "flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors",
        cannotAct
          ? "bg-gray-100 text-gray-300 cursor-not-allowed"
          : isSuspended
          ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
          : "bg-red-100 text-red-700 hover:bg-red-200",
        isLoading && "opacity-50"
      )}
    >
      {isSuspended
        ? <CheckCircle className="w-3.5 h-3.5" />
        : <Ban className="w-3.5 h-3.5" />}
      {isSuspended ? "Aktifkan" : "Suspend"}
    </button>
  );
}
