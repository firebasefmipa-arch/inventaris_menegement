"use client";

import Image from "next/image";
import { useTheme } from "./ThemeProvider";
import { bp } from "@/lib/basepath";

/**
 * Logo FMIPA — versi kuning otomatis saat mode gelap.
 * Dipakai di halaman yang perlu logo bereaksi ke tema (mis. landing).
 */
export function Logo({ className, maxHeight = 40 }: { className?: string; maxHeight?: number }) {
  const { theme } = useTheme();
  return (
    <Image
      src={theme === "dark" ? bp("/fmipa-logo-kuning.png") : bp("/fmipa-logo.png")}
      alt="Logo FMIPA"
      width={120}
      height={40}
      className={className ?? "object-contain h-8 w-auto"}
      style={{ maxHeight }}
    />
  );
}
