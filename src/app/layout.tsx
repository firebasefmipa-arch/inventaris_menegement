import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/Toaster";
import { AuthProvider } from "@/components/AuthProvider";
import { ThemeProvider } from "@/components/ThemeProvider";
import { BasePathProvider } from "@/components/BasePathProvider";

const plusJakartaSans = Plus_Jakarta_Sans({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Manajemen Inventaris - Sistem Manajemen Peminjaman Barang",
  description:
    "Sistem peminjaman barang yang user-friendly dan modern dengan portal peminjaman mandiri",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body className={`bg-gray-50 dark:bg-slate-900 text-gray-900 dark:text-slate-100 antialiased ${plusJakartaSans.className}`}>
        <ThemeProvider>
          <BasePathProvider>
            <AuthProvider>
              <ToastProvider>{children}</ToastProvider>
            </AuthProvider>
          </BasePathProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
