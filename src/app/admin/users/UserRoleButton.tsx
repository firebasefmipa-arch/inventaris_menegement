"use client";

import { useState } from "react";
import { changeUserRole } from "./actions";
import { Shield, UserCircle } from "lucide-react";
import clsx from "clsx";

export function UserRoleButton({
  userId,
  currentRole,
  isCurrentUser,
}: {
  userId: string;
  currentRole: string;
  isCurrentUser: boolean;
}) {
  const [isLoading, setIsLoading] = useState(false);

  const isAdmin = currentRole === "admin";
  const newRole = isAdmin ? "user" : "admin";

  const handleToggle = async () => {
    if (isCurrentUser) {
      alert("Anda tidak dapat mengubah role akun Anda sendiri.");
      return;
    }

    const actionText = isAdmin
      ? "menurunkan user ini menjadi User biasa"
      : "mempromosikan user ini menjadi Admin";
    if (!confirm(`Apakah Anda yakin ingin ${actionText}?`)) return;

    setIsLoading(true);
    try {
      const result = await changeUserRole(userId, newRole);
      if (result.success) {
        alert(result.message);
      } else {
        alert(result.message);
      }
    } catch (error) {
      alert("Terjadi kesalahan sistem.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      onClick={handleToggle}
      disabled={isLoading || isCurrentUser}
      className={clsx(
        "flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors",
        isAdmin
          ? "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:border dark:border-slate-700"
          : "bg-indigo-100 text-indigo-700 hover:bg-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-400 dark:hover:bg-indigo-900/50 dark:border dark:border-indigo-800/50",
        (isLoading || isCurrentUser) && "opacity-50 cursor-not-allowed"
      )}
      title={
        isCurrentUser
          ? "Ini adalah akun Anda"
          : isAdmin
          ? "Turunkan ke User biasa"
          : "Promosikan jadi Admin"
      }
    >
      {isAdmin ? (
        <UserCircle className="w-4 h-4" />
      ) : (
        <Shield className="w-4 h-4" />
      )}
      {isAdmin ? "Demote" : "Promote"}
    </button>
  );
}
