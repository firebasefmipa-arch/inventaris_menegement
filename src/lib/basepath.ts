/**
 * Utility untuk basePath fleksibel.
 *
 * Set NEXT_PUBLIC_BASE_PATH=/inventaris di .env.local untuk pakai path prefix.
 * Kosongkan untuk kembali ke subdomain langsung.
 *
 * Penggunaan:
 *   import { bp, withBase } from "@/lib/basepath";
 *   await signOut({ redirectTo: bp("/admin/login") });
 *   <a href={withBase(fileUrl)}>Download</a>
 */

/** Base path prefix, misal "/inventaris" atau "" jika subdomain langsung */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

/**
 * Prepend basePath ke path.
 * bp("/admin/login") → "/inventaris/admin/login" atau "/admin/login"
 */
export function bp(path: string): string {
  if (!BASE_PATH) return path;
  // Hindari double slash
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${BASE_PATH}${cleanPath}`;
}

/**
 * Alias lebih deskriptif untuk file/asset URL dari DB
 * withBase("/uploads/signed_forms/file.pdf") → "/inventaris/uploads/..."
 */
export const withBase = bp;
