import { Metadata } from "next";
import { db } from "@/db";
import { users } from "@/db/schema";
import { asc } from "drizzle-orm";
import { UserStatusButton } from "./UserStatusButton";
import { UserRoleButton } from "./UserRoleButton";
import { DeleteUserButtons } from "./DeleteUserButtons";
import { auth } from "@/auth";
import { Shield, ShieldCheck, User as UserIcon, UserPlus } from "lucide-react";
import clsx from "clsx";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Kelola Pengguna - Admin Peminjaman",
};

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const session = await auth();
  const currentRole = (session?.user as any)?.role as string;
  const isSuperAdmin = currentRole === "super_admin";

  const allUsers = await db.select().from(users).orderBy(asc(users.name));

  const sortedUsers = allUsers.sort((a, b) => {
    const order = { super_admin: 0, admin: 1, user: 2 };
    return (order[a.role ?? "user"] ?? 2) - (order[b.role ?? "user"] ?? 2);
  });

  const getRoleBadge = (role: string | null) => {
    switch (role) {
      case "super_admin":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-gradient-to-r from-purple-500 to-indigo-600 text-white shadow-sm">
            <ShieldCheck className="w-3.5 h-3.5" /> Super Admin
          </span>
        );
      case "admin":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
            <Shield className="w-3.5 h-3.5" /> Admin
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
            <UserIcon className="w-3.5 h-3.5" /> User
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Daftar Pengguna</h1>
          <p className="mt-1 text-sm text-gray-500">
            {isSuperAdmin
              ? "Super Admin dapat promosi/demosi role, suspend, hapus akun, dan hapus history transaksi."
              : "Admin dapat suspend akun user biasa."}
          </p>
        </div>
        {isSuperAdmin && (
          <Link
            href="/admin/users/create"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl shadow-sm shadow-indigo-500/20 transition-colors shrink-0"
          >
            <UserPlus className="w-4 h-4" />
            Buat Admin Native
          </Link>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-100">
              <tr>
                <th className="px-5 py-4">Nama Lengkap</th>
                <th className="px-5 py-4">Kontak</th>
                <th className="px-5 py-4">Departemen</th>
                <th className="px-5 py-4">Role</th>
                <th className="px-5 py-4">Status</th>
                <th className="px-5 py-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sortedUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-gray-400">
                    Belum ada data pengguna.
                  </td>
                </tr>
              ) : (
                sortedUsers.map((user) => {
                  const isCurrentUser = session?.user?.id === user.id;
                  const targetRole = user.role ?? "user";
                  return (
                    <tr key={user.id} className={clsx("hover:bg-gray-50/50 transition-colors", targetRole === "super_admin" && "bg-purple-50/30")}>
                      <td className="px-5 py-4">
                        <div className="font-medium text-gray-900">{user.name || "-"}</div>
                        {isCurrentUser && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 mt-1">Anda</span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <div className="text-gray-900 text-xs">{user.email}</div>
                        <div className="text-gray-500 text-xs mt-0.5">{user.phone || "Belum diisi"}</div>
                      </td>
                      <td className="px-5 py-4">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                          {user.department || "-"}
                        </span>
                      </td>
                      <td className="px-5 py-4">{getRoleBadge(targetRole)}</td>
                      <td className="px-5 py-4">
                        {user.status === "active" ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Aktif
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-red-50 text-red-700 border border-red-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500" /> Suspended
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-end gap-2 flex-wrap">
                          {isSuperAdmin && targetRole !== "super_admin" && !isCurrentUser && (
                            <UserRoleButton userId={user.id} currentRole={targetRole} isCurrentUser={false} />
                          )}
                          {!isCurrentUser && targetRole !== "super_admin" && (
                            <UserStatusButton userId={user.id} currentStatus={user.status ?? "active"} isCurrentUser={isCurrentUser} callerRole={currentRole} targetRole={targetRole} />
                          )}
                          {isSuperAdmin && !isCurrentUser && targetRole !== "super_admin" && (
                            <DeleteUserButtons userId={user.id} userName={user.name || user.email || "User"} />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile card list */}
        <div className="md:hidden divide-y divide-gray-100">
          {sortedUsers.length === 0 ? (
            <div className="px-6 py-10 text-center text-gray-400">Belum ada data pengguna.</div>
          ) : (
            sortedUsers.map((user) => {
              const isCurrentUser = session?.user?.id === user.id;
              const targetRole = user.role ?? "user";
              return (
                <div key={user.id} className={clsx("p-4 space-y-3", targetRole === "super_admin" && "bg-purple-50/30")}>
                  {/* Nama + badge */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-gray-900 flex items-center gap-2 flex-wrap">
                        {user.name || "-"}
                        {isCurrentUser && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">Anda</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5 truncate">{user.email}</div>
                      {user.phone && <div className="text-xs text-gray-400">{user.phone}</div>}
                    </div>
                    <div className="shrink-0">{getRoleBadge(targetRole)}</div>
                  </div>

                  {/* Dept + Status */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                      {user.department || "-"}
                    </span>
                    {user.status === "active" ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Aktif
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-red-50 text-red-700 border border-red-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500" /> Suspended
                      </span>
                    )}
                  </div>

                  {/* Aksi */}
                  <div className="flex items-center gap-2 flex-wrap pt-1">
                    {isSuperAdmin && targetRole !== "super_admin" && !isCurrentUser && (
                      <UserRoleButton userId={user.id} currentRole={targetRole} isCurrentUser={false} />
                    )}
                    {!isCurrentUser && targetRole !== "super_admin" && (
                      <UserStatusButton userId={user.id} currentStatus={user.status ?? "active"} isCurrentUser={isCurrentUser} callerRole={currentRole} targetRole={targetRole} />
                    )}
                    {isSuperAdmin && !isCurrentUser && targetRole !== "super_admin" && (
                      <DeleteUserButtons userId={user.id} userName={user.name || user.email || "User"} />
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
