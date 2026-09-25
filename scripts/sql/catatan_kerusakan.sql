-- Catatan kerusakan barang (opsional).
--
-- Hanya diisi saat kondisi ditandai "Rusak"; TIDAK dihapus saat barang kembali
-- ke "Baik" — itulah yang menjadikannya log kerusakan. Format entri:
--   "Layar retak kanan (25 Sep 2026) • Baterai kembung (12 Nov 2026)"
ALTER TABLE items ADD COLUMN catatan_kerusakan VARCHAR(255) NULL DEFAULT NULL;
