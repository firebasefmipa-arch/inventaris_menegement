/**
 * Sanitasi input angka (NIK/NIM/No. HP): hanya terima digit.
 * Dipakai di onChange input — karakter non-digit tidak bisa diketik.
 */
export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}
