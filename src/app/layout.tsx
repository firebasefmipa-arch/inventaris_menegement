import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/Toaster";
import { AuthProvider } from "@/components/AuthProvider";

const plusJakartaSans = Plus_Jakarta_Sans({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "PinjamBarang - Sistem Manajemen Peminjaman Barang",
  description:
    "Sistem peminjaman barang yang user-friendly dan modern dengan portal peminjaman mandiri",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id">
      <body className={`bg-gray-50 text-gray-900 antialiased ${plusJakartaSans.className}`}>
        <AuthProvider>
          <ToastProvider>{children}</ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
