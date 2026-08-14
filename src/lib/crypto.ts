/**
 * Enkripsi/dekripsi AES-256-GCM untuk menyimpan plain_password di database.
 * Key diambil dari environment variable ENCRYPTION_KEY (hex 64 karakter / 32 bytes).
 *
 * Format ciphertext: <iv_hex>:<authTag_hex>:<encrypted_hex>
 */

const ALGORITHM = "aes-256-gcm";

function getKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error("ENCRYPTION_KEY tidak ditemukan di environment variable");
  }
  const keyBuffer = Buffer.from(key, "hex");
  if (keyBuffer.length !== 32) {
    throw new Error("ENCRYPTION_KEY harus berupa hex 64 karakter (32 bytes)");
  }
  return keyBuffer;
}

export function encryptPassword(plainText: string): string {
  // Gunakan Node.js crypto — hanya berjalan di server
  const crypto = require("crypto") as typeof import("crypto");

  const key = getKey();
  const iv = crypto.randomBytes(12); // 96-bit IV untuk GCM
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plainText, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");

  // Format: iv:authTag:ciphertext
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

export function decryptPassword(cipherText: string): string {
  const crypto = require("crypto") as typeof import("crypto");

  const parts = cipherText.split(":");
  if (parts.length !== 3) {
    throw new Error("Format ciphertext tidak valid");
  }

  const [ivHex, authTagHex, encrypted] = parts;
  const key = getKey();
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

/**
 * Cek apakah string adalah ciphertext (format iv:authTag:ciphertext)
 * atau plain text lama (sebelum enkripsi ditambahkan).
 */
export function isCipherText(value: string): boolean {
  const parts = value.split(":");
  return parts.length === 3 && parts[0].length === 24; // IV 12 bytes = 24 hex chars
}
