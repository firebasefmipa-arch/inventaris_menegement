-- Migration: Tambah kolom signature_url ke tabel user
-- Jalankan di server: mysql -u root -p inventaris_db < migration_signature.sql

ALTER TABLE `user`
  ADD COLUMN `signature_url` VARCHAR(500) NULL DEFAULT NULL
  AFTER `department`;
