"use client";

import { useEffect, type ReactNode } from "react";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

/**
 * Patch window.fetch SESEGERA MUNGKIN (module scope, bukan useEffect) supaya
 * request Auth.js session pertama (yang terjadi saat mount SessionProvider,
 * sebelum useEffect anak) SUDAH ber-prefix. useEffect terlalu telat: React
 * menjalankan efek anak (SessionProvider fetch session) sebelum efek parent.
 */
if (typeof window !== "undefined" && BASE_PATH && !(window as any).__basePathPatched) {
  const originalFetch = window.fetch.bind(window);
  (window as any).__basePathPatched = true;
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    let url: string;
    if (typeof input === "string") {
      url = input;
    } else if (input instanceof URL) {
      url = input.toString();
    } else {
      url = input.url;
    }

    // Hanya tambah prefix untuk path relatif milik app (API & uploads)
    if (
      (url.startsWith("/api/") || url.startsWith("/uploads/")) &&
      !url.startsWith(`${BASE_PATH}/`)
    ) {
      const prefixed = `${BASE_PATH}${url}`;
      if (typeof input === "string") {
        return originalFetch(prefixed, init);
      }
      if (input instanceof URL) {
        return originalFetch(new URL(prefixed, window.location.origin), init);
      }
      return originalFetch(new Request(prefixed, input), init);
    }

    return originalFetch(input, init);
  };
}

/**
 * Next.js basePath TIDAK otomatis menambahkan prefix ke fetch() manual di
 * komponen client. Semua panggilan /api/... dan /uploads/... dari browser
 * harus ber-prefix (gateway UII hanya melewatkan path /logistik/*),
 * kalau tidak request ditangkap WordPress/gateway.
 * Patch dipasang di module scope (lihat atas) + useEffect di bawah sebagai
 * cadangan (mis. hot reload / basePath kosong saat pertama load).
 */
export function BasePathProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (!BASE_PATH) return;

    const originalFetch = window.fetch.bind(window);

    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      let url: string;
      if (typeof input === "string") {
        url = input;
      } else if (input instanceof URL) {
        url = input.toString();
      } else {
        url = input.url;
      }

      // Hanya tambah prefix untuk path relatif milik app (API & uploads)
      if (
        (url.startsWith("/api/") || url.startsWith("/uploads/")) &&
        !url.startsWith(`${BASE_PATH}/`)
      ) {
        const prefixed = `${BASE_PATH}${url}`;
        if (typeof input === "string") {
          return originalFetch(prefixed, init);
        }
        if (input instanceof URL) {
          return originalFetch(new URL(prefixed, window.location.origin), init);
        }
        return originalFetch(new Request(prefixed, input), init);
      }

      return originalFetch(input, init);
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  return <>{children}</>;
}
