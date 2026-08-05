import { Metadata } from "next";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import CompleteRegistrationForm from "./CompleteRegistrationForm";
import { Package } from "lucide-react";

export const metadata: Metadata = {
  title: "Lengkapi Pendaftaran - PinjamBarang",
};

export default async function RegisterCompletePage() {
  const session = await auth();

  // Jika belum login sama sekali
  if (!session || !session.user) {
    redirect("/register");
  }

  // Jika profil sudah lengkap, langsung ke dashboard
  const user = session.user as any;
  if (user.phone && user.department) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        {/* Logo */}
        <div className="flex justify-center mb-6">
          <div className="w-12 h-12 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/25">
            <Package className="w-7 h-7 text-white" />
          </div>
        </div>

        {/* Progress steps */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center">✓</div>
            <span className="text-xs text-indigo-600 font-semibold">Login Google</span>
          </div>
          <div className="w-8 h-0.5 bg-indigo-400 rounded" />
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center ring-2 ring-indigo-200 ring-offset-1">2</div>
            <span className="text-xs text-indigo-600 font-semibold">Lengkapi Data</span>
          </div>
          <div className="w-8 h-0.5 bg-gray-200 rounded" />
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-6 rounded-full bg-gray-200 text-gray-500 text-xs font-bold flex items-center justify-center">3</div>
            <span className="text-xs text-gray-400">Dashboard</span>
          </div>
        </div>

        <h2 className="text-center text-2xl font-extrabold text-gray-900">
          Satu Langkah Lagi!
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Lengkapi data dirimu untuk mulai menggunakan layanan peminjaman
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-2xl sm:px-10 border border-gray-100">
          {/* User info dari Google */}
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl mb-6 border border-gray-100">
            {session.user.image && (
              <img
                src={session.user.image}
                alt={session.user.name || "User"}
                className="w-10 h-10 rounded-full object-cover"
              />
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{session.user.name}</p>
              <p className="text-xs text-gray-500 truncate">{session.user.email}</p>
            </div>
          </div>

          <CompleteRegistrationForm
            initialName={session.user.name || ""}
            email={session.user.email || ""}
          />
        </div>
      </div>
    </div>
  );
}
