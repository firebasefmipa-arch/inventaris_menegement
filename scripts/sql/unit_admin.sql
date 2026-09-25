-- ── Fitur Unit & pembatasan admin per unit ───────────────────────────────
-- Jalankan: mysql ... < scripts/sql/unit_admin.sql
-- TIDAK bisa diulang: MySQL tak punya "ADD COLUMN IF NOT EXISTS".
-- Kalau dijalankan dua kali, error 1060/1061/1050 berarti "sudah ada" — aman.

-- 1. Barang punya Unit (pemilik), Lokasi tetap ada (tempat, bebas ketik).
ALTER TABLE items        ADD COLUMN unit       VARCHAR(255) NULL AFTER status;
ALTER TABLE user         ADD COLUMN unit_utama VARCHAR(255) NULL AFTER department;

-- 2. Penanda kelompok pengajuan (satu pengajuan user → N transaksi per unit).
ALTER TABLE transactions ADD COLUMN grup_id VARCHAR(64) NULL AFTER rejection_reason;
ALTER TABLE handovers    ADD COLUMN grup_id VARCHAR(64) NULL AFTER rejection_reason;

-- 3. Daftar unit yang dikelola tiap admin.
CREATE TABLE user_unit (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  unit VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_unit_user FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE,
  CONSTRAINT uq_user_unit UNIQUE (user_id, unit)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Indeks untuk pencarian yang sering dipakai.
CREATE INDEX idx_items_unit ON items (unit);
CREATE INDEX idx_tx_grup    ON transactions (grup_id);
CREATE INDEX idx_hv_grup    ON handovers (grup_id);
