-- Migration: Add role column to user table
-- Run this SQL in your MySQL database

ALTER TABLE `user`
  ADD COLUMN `role` ENUM('user', 'admin', 'super_admin') NOT NULL DEFAULT 'user'
  AFTER `status`;

-- Optional: promote existing users with known admin emails to 'admin'
-- UPDATE `user` SET `role` = 'admin' WHERE `email` IN ('youremail@example.com');
