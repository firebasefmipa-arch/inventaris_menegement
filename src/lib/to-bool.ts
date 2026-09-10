/**
 * Parse nilai boolean dari JSON body.
 * `Boolean("0")` bernilai true — itu bug untuk flag izin barang,
 * jadi string "0"/"false" harus jadi false.
 */
export function toBool(v: unknown): boolean {
  if (typeof v === "string") return v !== "0" && v.toLowerCase() !== "false";
  return Boolean(v);
}
