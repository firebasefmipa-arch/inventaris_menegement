"use client";

import { useState, useEffect, Suspense } from "react";
import { signIn, useSession } from "next-auth/react";
import { Package, ArrowLeft } from "lucide-react";
import { useToast } from "@/components/Toaster";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import clsx from "clsx";

function LoginForm() {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard/pinjam";

  // Jika sudah login, redirect sesuai role
  useEffect(() => {
    if (status === "authenticated" && session) {
      const user = session.user as any;
      const role = user.role;

      // Admin dan super_admin → ke dashboard admin
      if (role === "admin" || role === "super_admin") {
        router.replace("/admin");
        return;
      }

      // User biasa — cek profil dulu
      if (!user.phone || !user.department) {
        router.replace("/register/complete");
      } else {
        // Jika ada callbackUrl yang valid (bukan admin route), pakai itu
        const safeCallback =
          callbackUrl && !callbackUrl.startsWith("/admin")
            ? callbackUrl
            : "/dashboard/pinjam";
        router.replace(safeCallback);
      }
    }
  }, [status, session, router, callbackUrl]);

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      await signIn("google", { callbackUrl: "/auth/callback" });
    } catch {
      toast("Gagal login dengan Google", "error");
      setLoading(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative">
      <Link
        href="/"
        className="absolute top-6 left-6 sm:top-12 sm:left-12 w-12 h-12 flex items-center justify-center bg-white text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-full shadow-sm border border-gray-200 transition-all hover:scale-105"
        title="Kembali ke Portal"
      >
        <ArrowLeft className="w-5 h-5" />
      </Link>

      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center">
            <Package className="w-8 h-8 text-white" />
          </div>
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          Masuk ke Akun
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Silakan masuk untuk mengakses dashboard peminjaman
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-xl sm:px-10 border border-gray-100 text-center space-y-6">
          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className={clsx(
              "w-full flex items-center justify-center gap-3 px-4 py-3 border border-gray-300 rounded-xl shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors",
              loading && "opacity-50 cursor-not-allowed"
            )}
          >
            {/* Google Icon */}
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            {loading ? "Memproses..." : "Lanjutkan dengan Google"}
          </button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-3 bg-white text-gray-400">atau</span>
            </div>
          </div>

          <div className="text-sm text-gray-600">
            Belum punya akun?{" "}
            <Link href="/register" className="font-semibold text-indigo-600 hover:text-indigo-500">
              Daftar sekarang
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
