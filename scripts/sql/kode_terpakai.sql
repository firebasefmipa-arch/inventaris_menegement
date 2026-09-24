-- Buku register nomor barang (fitur "nomor tak boleh dipakai ulang", 24 Sep 2026).
--
-- SATU baris per kode yang PERNAH keluar. Tabel ini TIDAK PERNAH dihapus
-- barisnya walau barangnya dihapus — itulah yang membuat nomor bekas tak bisa
-- diberikan ke barang lain.
--
-- SENGAJA TANPA foreign key ke items: kalau barangnya dihapus, catatannya
-- HARUS tetap ada.
--
-- Cara pakai di server:
--   mysql -h<host> -u<user> -p <db> < scripts/sql/kode_terpakai.sql
--   npm run kode:bebas semai      (isi dari barang yang sudah ada)
--
-- JANGAN pakai drizzle-kit push di DB produksi.

CREATE TABLE IF NOT EXISTS kode_terpakai (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  kode       VARCHAR(255) NOT NULL,
  prefix     VARCHAR(50) NOT NULL,
  tahun      INT NOT NULL,
  urut       INT NOT NULL,
  item_id    INT NULL,
  sumber     VARCHAR(20) NOT NULL DEFAULT 'barang',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_kode (kode),
  INDEX idx_kt_prefix_tahun (prefix, tahun)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
