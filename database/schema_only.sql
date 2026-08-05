-- ============================================================
-- Schema Aplikasi Peminjaman Barang — FMIPA UII
-- Gunakan file ini untuk deploy fresh di server baru
-- Tidak ada INSERT data — database mulai kosong
-- Setelah import, jalankan: npm run setup:superadmin
-- ============================================================

SET FOREIGN_KEY_CHECKS = 0;

-- ------------------------------------------------------------
-- Tabel: items (inventaris barang)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `items` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `category` varchar(100) NOT NULL,
  `description` text DEFAULT NULL,
  `sn` varchar(255) DEFAULT NULL,
  `inventory_number` varchar(255) DEFAULT NULL,
  `asset_number` varchar(255) DEFAULT NULL,
  `last_check_date` varchar(255) DEFAULT NULL,
  `condition` varchar(255) DEFAULT NULL,
  `image_url` varchar(500) DEFAULT NULL,
  `quantity` int(11) NOT NULL DEFAULT 1,
  `available_quantity` int(11) NOT NULL DEFAULT 1,
  `status` enum('available','borrowed') NOT NULL DEFAULT 'available',
  `location` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Tabel: user (semua pengguna: user, admin, super_admin)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `user` (
  `id` varchar(255) NOT NULL,
  `name` varchar(255) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `emailVerified` timestamp(3) DEFAULT NULL,
  `image` varchar(255) DEFAULT NULL,
  `password` varchar(255) DEFAULT NULL,
  `phone` varchar(50) DEFAULT NULL,
  `department` varchar(100) DEFAULT NULL,
  `status` enum('pending','active','suspended') DEFAULT 'active',
  `role` enum('user','admin','super_admin') NOT NULL DEFAULT 'user',
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_email_unique` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Tabel: account (OAuth accounts — NextAuth)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `account` (
  `userId` varchar(255) NOT NULL,
  `type` varchar(255) NOT NULL,
  `provider` varchar(255) NOT NULL,
  `providerAccountId` varchar(255) NOT NULL,
  `refresh_token` text DEFAULT NULL,
  `access_token` text DEFAULT NULL,
  `expires_at` int(11) DEFAULT NULL,
  `token_type` varchar(255) DEFAULT NULL,
  `scope` varchar(255) DEFAULT NULL,
  `id_token` text DEFAULT NULL,
  `session_state` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`provider`, `providerAccountId`),
  KEY `account_userId_idx` (`userId`),
  CONSTRAINT `account_userId_user_id_fk`
    FOREIGN KEY (`userId`) REFERENCES `user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Tabel: session (sessions — NextAuth)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `session` (
  `sessionToken` varchar(255) NOT NULL,
  `userId` varchar(255) NOT NULL,
  `expires` timestamp NOT NULL,
  PRIMARY KEY (`sessionToken`),
  KEY `session_userId_idx` (`userId`),
  CONSTRAINT `session_userId_user_id_fk`
    FOREIGN KEY (`userId`) REFERENCES `user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Tabel: verificationToken (NextAuth)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `verificationToken` (
  `identifier` varchar(255) NOT NULL,
  `token` varchar(255) NOT NULL,
  `expires` timestamp NOT NULL,
  PRIMARY KEY (`identifier`, `token`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Tabel: transactions (header transaksi peminjaman)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `transactions` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` varchar(255) DEFAULT NULL,
  `item_id` int(11) DEFAULT NULL,
  `borrower_name` varchar(255) NOT NULL,
  `borrower_email` varchar(255) DEFAULT NULL,
  `borrower_phone` varchar(50) DEFAULT NULL,
  `borrower_department` varchar(100) DEFAULT NULL,
  `quantity` int(11) NOT NULL DEFAULT 1,
  `status` enum('pending_signature','pending_approval','active','rejected','returned','overdue') NOT NULL DEFAULT 'pending_signature',
  `signed_document_url` varchar(500) DEFAULT NULL,
  `borrow_date` timestamp NOT NULL DEFAULT current_timestamp(),
  `expected_return_date` datetime NOT NULL,
  `actual_return_date` datetime DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `rejection_reason` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `transactions_user_id_idx` (`user_id`),
  KEY `transactions_item_id_idx` (`item_id`),
  CONSTRAINT `transactions_user_id_fk`
    FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE SET NULL,
  CONSTRAINT `transactions_item_id_fk`
    FOREIGN KEY (`item_id`) REFERENCES `items` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Tabel: transaction_items (detail barang per transaksi)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `transaction_items` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `transaction_id` int(11) NOT NULL,
  `item_id` int(11) NOT NULL,
  `quantity` int(11) NOT NULL DEFAULT 1,
  `notes` text DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `ti_transaction_id_idx` (`transaction_id`),
  KEY `ti_item_id_idx` (`item_id`),
  CONSTRAINT `ti_transaction_id_fk`
    FOREIGN KEY (`transaction_id`) REFERENCES `transactions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `ti_item_id_fk`
    FOREIGN KEY (`item_id`) REFERENCES `items` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- Selesai. Lanjutkan dengan:
--   npm run setup:superadmin
-- ============================================================
