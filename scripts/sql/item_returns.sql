-- Tabel catatan pengembalian barang (fitur Pengembalian, 24 Sep 2026).
--
-- Kenapa dipisah dari handover_items: stok pengembalian BERTAMBAH, jadi butuh
-- catatan "sisi masuk". "Sedang di luar" = Σ handover_items (handovers.completed)
-- − Σ item_returns. Lihat src/lib/unit-di-luar.ts.
--
-- Cara pakai di server:
--   mysql -h<host> -u<user> -p <db> < scripts/sql/item_returns.sql
--
-- JANGAN pakai drizzle-kit push di DB produksi — pakai ALTER manual seperti ini.

CREATE TABLE IF NOT EXISTS item_returns (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  item_id        INT NOT NULL,
  quantity       INT NOT NULL DEFAULT 1,
  item_name      VARCHAR(255) NULL,
  item_code      VARCHAR(255) NULL,
  returned_by    VARCHAR(255) NOT NULL,
  received_by    VARCHAR(255) NULL,
  received_by_id VARCHAR(255) NULL,
  notes          TEXT NULL,
  return_date    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_returns_item (item_id),
  INDEX idx_returns_tanggal (return_date),
  CONSTRAINT fk_returns_item FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
