-- Kode pemeriksaan dokumen — dicetak sebagai kotak QR di dokumen yang disetujui
-- superadmin, dan dipakai halaman publik /cek/<kode>.
--
-- Sengaja ACAK, bukan nomor urut: nomor urut bisa ditebak, sehingga orang bisa
-- mengintip dokumen milik orang lain hanya dengan mengubah angkanya.
--
-- NULL = dokumen lama / belum disetujui superadmin. UNIQUE boleh memuat banyak
-- NULL di MySQL, jadi baris lama tidak saling bentrok.
ALTER TABLE transactions ADD COLUMN verification_code VARCHAR(32) NULL;
ALTER TABLE transactions ADD UNIQUE KEY uq_tx_verification_code (verification_code);

ALTER TABLE handovers ADD COLUMN verification_code VARCHAR(32) NULL;
ALTER TABLE handovers ADD UNIQUE KEY uq_hv_verification_code (verification_code);
