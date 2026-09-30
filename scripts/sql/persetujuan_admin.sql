-- Kolom pencatat siapa yang menyetujui pengajuan (peminjaman & serah terima).
--
-- Selama ini dokumen hanya memuat tanda tangan PEMOHON; kolom "Yang menyerahkan"
-- dibiarkan kosong. Akibatnya nama admin yang menyetujui tidak bisa dibuktikan
-- dari dokumen maupun basis data.
--
-- Tiga kolom per tabel:
--   approved_by            = NAMA admin penyetuju. NULL = tidak dicetak namanya.
--   approved_at            = waktu persetujuan. NULL = pengajuan lama (sebelum
--                            fitur ini) — dokumennya tetap dicetak dengan kolom
--                            tanda tangan kosong seperti sebelumnya.
--   approved_signature_url = SALINAN tanda tangan admin saat itu. Disimpan
--                            (bukan dibaca ulang dari profil) supaya dokumen
--                            lama tidak berubah kalau admin mengganti TTD-nya.
--
-- Cara membedakan tiga keadaan saat menggambar dokumen:
--   approved_at NULL                      -> dokumen lama, kolom kosong
--   approved_at ada, approved_by NULL     -> superadmin, tulis "Disetujui oleh Admin"
--   approved_at ada, approved_by ada      -> admin, TTD + nama

ALTER TABLE transactions
  ADD COLUMN approved_by            VARCHAR(255) NULL,
  ADD COLUMN approved_at            TIMESTAMP    NULL,
  ADD COLUMN approved_signature_url VARCHAR(500) NULL;

ALTER TABLE handovers
  ADD COLUMN approved_by            VARCHAR(255) NULL,
  ADD COLUMN approved_at            TIMESTAMP    NULL,
  ADD COLUMN approved_signature_url VARCHAR(500) NULL;
