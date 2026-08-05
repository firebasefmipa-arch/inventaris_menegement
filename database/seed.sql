/*M!999999\- enable the sandbox mode */ 
-- MariaDB dump 10.19  Distrib 10.11.18-MariaDB, for debian-linux-gnu (x86_64)
--
-- Host: 127.0.0.1    Database: app_db
-- ------------------------------------------------------
-- Server version	10.11.18-MariaDB-0+deb12u1

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Dumping data for table `borrowers`
--

LOCK TABLES `borrowers` WRITE;
/*!40000 ALTER TABLE `borrowers` DISABLE KEYS */;
INSERT INTO `borrowers` VALUES
(1,'Andi Pratama','andi.pratama@company.com','081234567890','IT','2026-07-23 07:10:53'),
(2,'Budi Santoso','budi.santoso@company.com','081298765432','Marketing','2026-07-23 07:10:53'),
(3,'Citra Dewi','citra.dewi@company.com','081355512345','HRD','2026-07-23 07:10:53');
/*!40000 ALTER TABLE `borrowers` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping data for table `items`
--

LOCK TABLES `items` WRITE;
/*!40000 ALTER TABLE `items` DISABLE KEYS */;
INSERT INTO `items` VALUES
(1,'Proyektor Epson EB-X41','Elektronik','Proyektor 3600 lumens, cocok untuk presentasi dan pemutaran video. Resolusi XGA dengan kontras tinggi.',NULL,5,3,'available','Ruang Server Lt.2','2026-07-23 07:10:53','2026-07-23 07:10:53'),
(2,'Laptop Dell Latitude 5520','Elektronik','Laptop bisnis dengan Intel Core i7, RAM 16GB, SSD 512GB. Cocok untuk pekerjaan kantor dan presentasi.',NULL,8,6,'available','Ruang IT Lt.1','2026-07-23 07:10:53','2026-07-23 07:10:53'),
(3,'Speaker JBL PartyBox 310','Audio','Speaker portable Bluetooth 240W dengan lampu LED. Suara bass menggelegar cocok untuk acara.',NULL,3,2,'available','Gudang Aula','2026-07-23 07:10:53','2026-07-23 07:10:53'),
(4,'Kamera Canon EOS R10','Fotografi','Kamera mirrorless 24.2MP dengan lensa 18-45mm. Hasil foto tajam dan video 4K.',NULL,3,1,'available','Ruang Multimedia','2026-07-23 07:10:53','2026-07-23 07:10:53'),
(5,'Tripod Manfrotto MK290','Fotografi','Tripod aluminium ringan dengan kepala ball head. Tinggi maksimal 170cm.',NULL,6,4,'available','Ruang Multimedia','2026-07-23 07:10:53','2026-07-23 07:10:53'),
(6,'Microphone Wireless Sennheiser','Audio','Mic wireless profesional dengan receiver dual-channel. Jangkauan hingga 100 meter.',NULL,4,0,'borrowed','Ruang Server Lt.2','2026-07-23 07:10:53','2026-07-23 07:10:53'),
(7,'Tenda Lipat 3x3 Meter','Peralatan Acara','Tenda lipat portable dengan rangka besi kokoh. Termasuk tas carry.',NULL,4,4,'available','Gudang Utama','2026-07-23 07:10:53','2026-07-23 07:10:53'),
(8,'Kursi Lipat Plastik','Peralatan Acara','Kursi lipat plastik tebal warna putih. Kapasitas beban 120kg per kursi.',NULL,50,35,'available','Gudang Utama','2026-07-23 07:10:53','2026-07-23 07:10:53');
/*!40000 ALTER TABLE `items` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping data for table `transactions`
--

LOCK TABLES `transactions` WRITE;
/*!40000 ALTER TABLE `transactions` DISABLE KEYS */;
INSERT INTO `transactions` VALUES
(1,1,1,1,'active','2026-07-20 07:10:53','2026-07-25 07:10:53',NULL,'Untuk presentasi mingguan','2026-07-23 07:10:53'),
(2,2,2,1,'active','2026-07-20 07:10:53','2026-07-30 07:10:53',NULL,'Untuk workshop marketing','2026-07-23 07:10:53'),
(3,3,3,1,'active','2026-07-20 07:10:53','2026-07-25 07:10:53',NULL,'Acara gathering HRD','2026-07-23 07:10:53'),
(4,4,1,1,'active','2026-07-22 07:10:53','2026-07-30 07:10:53',NULL,'Dokumentasi event','2026-07-23 07:10:53'),
(5,6,2,2,'active','2026-07-20 07:10:53','2026-07-25 07:10:53',NULL,'Untuk recording podcast','2026-07-23 07:10:53'),
(6,5,3,1,'active','2026-07-20 07:10:53','2026-07-25 07:10:53',NULL,'Foto produk HR','2026-07-23 07:10:53'),
(7,8,1,15,'active','2026-07-18 07:10:53','2026-07-24 07:10:53',NULL,'Untuk acara company gathering','2026-07-23 07:10:53'),
(8,1,2,1,'returned','2026-07-09 07:10:53','2026-07-16 07:10:53','2026-07-16 07:10:53','Training selesai','2026-07-23 07:10:53'),
(9,2,3,1,'returned','2026-07-13 07:10:53','2026-07-20 07:10:53','2026-07-20 07:10:53','Penggunaan selesai','2026-07-23 07:10:53');
/*!40000 ALTER TABLE `transactions` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-07-23  7:11:08
