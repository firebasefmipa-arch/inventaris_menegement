import { NextResponse } from "next/server";

/**
 * Baca body JSON dengan aman.
 *
 * `await request.json()` melempar SyntaxError kalau body kosong atau bukan
 * JSON — dan di dalam blok try/catch route itu berubah jadi 500 "Internal
 * Server Error", padahal yang salah adalah permintaan klien (harusnya 400).
 * Klien yang mengirim tanpa body (mis. `fetch()` tanpa argumen) jadi terlihat
 * seperti server yang rusak, dan galat aslinya tertimbun di log.
 *
 * Pakai:
 *   const body = await jsonBody(request);
 *   if (!body) return NextResponse.json({ error: "Body tidak valid" }, { status: 400 });
 */
export async function jsonBody<T = any>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Sama seperti jsonBody(), untuk unggahan berkas.
 *
 * `await request.formData()` melempar TypeError kalau Content-Type bukan
 * multipart/form-data — dan di dalam try/catch route itu jadi 500 "server
 * rusak", padahal berkasnya cuma tidak terkirim. Ini yang terjadi kalau
 * middleware/proxy membuang body, atau klien mengirim tanpa berkas.
 *
 * Pakai:
 *   const form = await formDataAman(request);
 *   if (!form) return NextResponse.json({ error: "Berkas tidak ditemukan" }, { status: 400 });
 */
export async function formDataAman(request: Request): Promise<FormData | null> {
  try {
    return await request.formData();
  } catch {
    return null;
  }
}
