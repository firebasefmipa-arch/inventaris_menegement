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
