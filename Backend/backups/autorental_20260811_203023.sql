-- MySQL dump 10.13  Distrib 8.0.43, for Win64 (x86_64)
--
-- Host: 127.0.0.1    Database: autorental
-- ------------------------------------------------------
-- Server version	8.4.11

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `accounts_clientdocument`
--

DROP TABLE IF EXISTS `accounts_clientdocument`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `accounts_clientdocument` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `document_type` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `document_number` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `file` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `expiration_date` date DEFAULT NULL,
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `rejection_reason` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `uploaded_at` datetime(6) NOT NULL,
  `validated_at` datetime(6) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL,
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  `validated_by_id` bigint DEFAULT NULL,
  `client_id` bigint NOT NULL,
  PRIMARY KEY (`id`),
  KEY `client_doc_status_idx` (`status`),
  KEY `client_doc_exp_idx` (`expiration_date`),
  KEY `client_doc_active_idx` (`is_active`),
  KEY `accounts_clientdocum_validated_by_id_87e5dba0_fk_accounts_` (`validated_by_id`),
  KEY `accounts_clientdocument_client_id_c88509ea` (`client_id`),
  KEY `client_doc_active_type_idx` (`client_id`,`document_type`,`is_active`),
  CONSTRAINT `accounts_clientdocum_client_id_c88509ea_fk_accounts_` FOREIGN KEY (`client_id`) REFERENCES `accounts_clientprofile` (`id`),
  CONSTRAINT `accounts_clientdocum_validated_by_id_87e5dba0_fk_accounts_` FOREIGN KEY (`validated_by_id`) REFERENCES `accounts_user` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `accounts_clientdocument`
--

LOCK TABLES `accounts_clientdocument` WRITE;
/*!40000 ALTER TABLE `accounts_clientdocument` DISABLE KEYS */;
INSERT INTO `accounts_clientdocument` VALUES (1,'CARTE_IDENTITE','CI-DEMO-2026-0001','client_documents/carte_identite_demo.pdf','2031-12-31','VALIDE','','2026-08-05 08:12:19.623786',NULL,1,'2026-08-05 08:12:19.623810','2026-08-05 08:12:19.623816',4,1),(2,'PERMIS_CONDUIRE','PC-DEMO-2026-0001','client_documents/permis_conduire_demo.pdf','2032-12-31','VALIDE','','2026-08-05 08:12:19.633171',NULL,1,'2026-08-05 08:12:19.633191','2026-08-05 08:12:19.633196',4,1),(3,'CARTE_IDENTITE','CI-DEMO-2026-REFUSE-1','client_documents/carte_identite_refusee_demo.pdf','2030-12-31','REFUSE','Piece illisible ou incoherente pour la demonstration.','2026-08-05 08:12:20.533107',NULL,1,'2026-08-05 08:12:20.533126','2026-08-05 08:12:20.533132',4,3),(4,'PERMIS_CONDUIRE','DEMO-PERMIT-001','client_documents/c17bab3a55bd47bdbaa0a9d3a73834ce.pdf','2030-12-31','VALIDE','','2026-08-05 12:57:52.026569','2026-08-05 13:15:22.849004',1,'2026-08-05 12:57:52.026597','2026-08-05 13:15:22.854835',4,2),(5,'CARTE_IDENTITE','DEMO-ID-001','client_documents/36177eb84f494886809bbb9b373b31aa.pdf','2031-12-31','VALIDE','','2026-08-05 13:09:09.339872','2026-08-05 13:16:20.008610',1,'2026-08-05 13:09:09.339906','2026-08-05 13:16:20.011572',4,2),(6,'CARTE_IDENTITE','25985463455','client_documents/315fce19461046dab5f045fea7daec1e.png','2027-01-15','EN_ATTENTE','','2026-08-09 17:19:33.264925',NULL,1,'2026-08-09 17:19:33.264987','2026-08-09 17:19:33.265007',NULL,8),(7,'PERMIS_CONDUIRE','25985463455','client_documents/eb839aa40beb4ee19aa9bbc452377724.png','2026-12-03','VALIDE','','2026-08-09 17:19:55.132148','2026-08-11 11:52:14.829574',1,'2026-08-09 17:19:55.132188','2026-08-11 11:52:14.835278',4,8);
/*!40000 ALTER TABLE `accounts_clientdocument` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `accounts_clientprofile`
--

DROP TABLE IF EXISTS `accounts_clientprofile`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `accounts_clientprofile` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `date_of_birth` date DEFAULT NULL,
  `address` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `profile_status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `rejection_reason` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  `user_id` bigint NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_id` (`user_id`),
  KEY `client_profile_status_idx` (`profile_status`),
  KEY `client_profile_created_idx` (`created_at`),
  KEY `client_profile_updated_idx` (`updated_at`),
  CONSTRAINT `accounts_clientprofile_user_id_48cb1b99_fk_accounts_user_id` FOREIGN KEY (`user_id`) REFERENCES `accounts_user` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `accounts_clientprofile`
--

LOCK TABLES `accounts_clientprofile` WRITE;
/*!40000 ALTER TABLE `accounts_clientprofile` DISABLE KEYS */;
INSERT INTO `accounts_clientprofile` VALUES (1,'1995-05-10','12 Rue Demo, 75000 Paris','VALIDE','','2026-08-05 08:12:19.603747','2026-08-05 08:12:19.603761',7),(2,'1990-05-10','12 rue de Test, 1000 Bruxelles','VALIDE','','2026-08-05 08:12:20.081485','2026-08-05 13:16:20.019253',8),(3,'1990-02-14','8 Avenue Demo, 69000 Lyon','REFUSE','Document de demonstration refuse.','2026-08-05 08:12:20.526802','2026-08-05 08:12:20.526813',9),(4,NULL,'','INCOMPLET','','2026-08-05 09:15:27.059338','2026-08-05 09:15:27.059384',10),(5,NULL,'','INCOMPLET','','2026-08-05 10:27:39.267411','2026-08-05 10:27:39.267439',11),(6,NULL,'','INCOMPLET','','2026-08-08 21:13:55.942937','2026-08-08 21:13:55.942967',12),(8,'1991-12-07','Avenue de la Floride 32','EN_ATTENTE','','2026-08-09 11:32:00.607704','2026-08-11 11:52:14.846586',2);
/*!40000 ALTER TABLE `accounts_clientprofile` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `accounts_role`
--

DROP TABLE IF EXISTS `accounts_role`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `accounts_role` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `code` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL,
  `label` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` longtext COLLATE utf8mb4_unicode_ci,
  `is_active` tinyint(1) NOT NULL,
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`),
  UNIQUE KEY `role_code_unique` (`code`),
  KEY `role_is_active_idx` (`is_active`),
  KEY `role_created_at_idx` (`created_at`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `accounts_role`
--

LOCK TABLES `accounts_role` WRITE;
/*!40000 ALTER TABLE `accounts_role` DISABLE KEYS */;
INSERT INTO `accounts_role` VALUES (1,'CLIENT','Client','Utilisateur pouvant gerer son profil, transmettre ses documents et effectuer des reservations.',1,'2026-07-31 15:20:45.300774','2026-07-31 15:20:45.300795'),(2,'GESTIONNAIRE_COMPTABLE','Gestionnaire-comptable','Gestion des vehicules, documents, reservations, paiements, cautions et operations metier.',1,'2026-07-31 15:20:45.305794','2026-07-31 15:20:45.305810'),(3,'ADMINISTRATEUR','Administrateur','Administration des utilisateurs, roles, parametres et fonctions techniques de la plateforme.',1,'2026-07-31 15:20:45.311434','2026-07-31 15:20:45.311457'),(4,'MECANICIEN','Mecanicien','Consultation et traitement des interventions mecaniques attribuees.',1,'2026-07-31 15:20:45.315885','2026-07-31 15:20:45.315909'),(5,'NETTOYEUR','Service de nettoyage','Consultation et traitement des interventions de nettoyage attribuees.',1,'2026-07-31 15:20:45.320999','2026-07-31 15:20:45.321020');
/*!40000 ALTER TABLE `accounts_role` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `accounts_user`
--

DROP TABLE IF EXISTS `accounts_user`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `accounts_user` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `password` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `last_login` datetime(6) DEFAULT NULL,
  `is_superuser` tinyint(1) NOT NULL,
  `is_staff` tinyint(1) NOT NULL,
  `email` varchar(254) COLLATE utf8mb4_unicode_ci NOT NULL,
  `first_name` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `last_name` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `phone` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email_verified` tinyint(1) NOT NULL,
  `is_active` tinyint(1) NOT NULL,
  `date_joined` datetime(6) NOT NULL,
  `role_id` bigint DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  KEY `user_name_idx` (`last_name`,`first_name`),
  KEY `user_role_active_idx` (`role_id`,`is_active`),
  KEY `user_joined_idx` (`date_joined`),
  CONSTRAINT `accounts_user_role_id_a6dd19b0_fk_accounts_role_id` FOREIGN KEY (`role_id`) REFERENCES `accounts_role` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `accounts_user`
--

LOCK TABLES `accounts_user` WRITE;
/*!40000 ALTER TABLE `accounts_user` DISABLE KEYS */;
INSERT INTO `accounts_user` VALUES (1,'pbkdf2_sha256$1200000$6k5aaFB9zNmsWhv4A4Sgww$p9fJDuB3ue9oXBKrdj8OLmhMgobZ0m2YeORwEHhNmVg=','2026-08-01 01:43:30.108269',1,1,'admin@autorental.local','','','',1,1,'2026-07-31 15:26:11.388470',3),(2,'pbkdf2_sha256$1200000$SrVgPUEe6Wrsnsc3QcyGSs$aueSkgYmIzHobtIj2YutChENy20P04ivAnN8jfRuH9Q=',NULL,0,0,'nicolas.lrnx@gmail.com','nicolas','lierneux','0470651235',1,1,'2026-08-01 01:47:18.224613',1),(3,'',NULL,0,0,'probe-client@example.com','Probe','Client','0400000999',1,1,'2026-08-03 15:13:44.011625',1),(4,'pbkdf2_sha256$1200000$iBNIjkTfNDK4CBDBvQJvHc$XIKdoJkXrW8uZiGQa/qekdfKf0wcgep/q0Lz3K+YML4=',NULL,0,0,'manager@autorental.local','Manager','Demo','0100000002',1,1,'2026-08-05 08:12:17.702101',2),(5,'pbkdf2_sha256$1200000$kzs5QHDG2blF5B2ZpBPcBE$MZByM9tSPXk9utHrpS09yTONDCBanE1hgKE+XGEe3tE=',NULL,0,0,'mechanic@autorental.local','Mechanic','Demo','0100000003',1,1,'2026-08-05 08:12:18.200524',4),(6,'pbkdf2_sha256$1200000$Qgsk2myn5T1Z1xjTOQC4GU$Y3XVakG68Z0N6Qmdk3/afGiKbl0tO4bRMTRro667nj0=',NULL,0,0,'cleaner@autorental.local','Cleaner','Demo','0100000004',1,1,'2026-08-05 08:12:18.662710',5),(7,'pbkdf2_sha256$1200000$xbmu6rTZ2QZl2TjgyGvfRL$llPf1TnSlJD+pqMs0aOF5TgWlbpG0KiwZ61IALN2mLQ=',NULL,0,0,'client.valid@autorental.local','Client','Valide','0100000005',1,1,'2026-08-05 08:12:19.122763',1),(8,'pbkdf2_sha256$1200000$rdiAaVT6RwsUE8sQhPKtxe$N8ew+Bk82yVNfc6LwcT4ao7ZNOs3dxtMxSDqJ1PXl1M=','2026-08-06 14:09:15.575434',0,0,'client.incomplete@autorental.local','Client','Incomplete','0470123456',1,1,'2026-08-05 08:12:19.640527',1),(9,'pbkdf2_sha256$1200000$WKEb9CvHjKY5xMJdNkhsW6$qQ3xENGzQiSyGO7QvijKes+aciL2bq++A0KdrDD52VM=',NULL,0,0,'client.refused@autorental.local','Client','Refuse','0100000007',1,1,'2026-08-05 08:12:20.085790',1),(10,'pbkdf2_sha256$1200000$ZYL4wJHNXjUWQDd3DxOoPW$CEvgALxw8JNSDtqQdSIdJgW9/abq2R7SNyjtLNBRXgk=',NULL,0,0,'nouveau.client@autorental.local','Nouveau','Client','0470000010',1,1,'2026-08-05 09:15:27.047924',1),(11,'pbkdf2_sha256$1200000$rnZCqcH1gyDB2H3dDiKyt9$VSAL9NvjSjvvT8YaVbsCsmJJY/SvoQr5BbaMUSmXezM=','2026-08-06 13:40:50.541965',0,0,'nonconfirme@autorental.local','Non','Confirme','0470000014',0,1,'2026-08-05 10:27:39.257623',1),(12,'pbkdf2_sha256$1200000$ozS6P9BZIdWKOjQFe8nMl4$993sRNrsTxqlf1v7kg+N/zZgH6X2QwAdDzJwzIhV9UA=',NULL,0,0,'nicolaslierneux2025@gmail.com','nicolas','lierneux','',0,1,'2026-08-08 21:13:55.900009',1),(13,'pbkdf2_sha256$1200000$lDCf2f0sD9vpEYNOGGAzLM$mw9h82+3204rPLOAdoHsmCilNdMRt66ygQMjwMoiK9E=','2026-08-09 10:46:15.192586',0,0,'diag-client@example.com','Diag','Client','0000000000',1,1,'2026-08-09 10:44:25.237538',1);
/*!40000 ALTER TABLE `accounts_user` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `accounts_user_groups`
--

DROP TABLE IF EXISTS `accounts_user_groups`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `accounts_user_groups` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` bigint NOT NULL,
  `group_id` int NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `accounts_user_groups_user_id_group_id_59c0b32f_uniq` (`user_id`,`group_id`),
  KEY `accounts_user_groups_group_id_bd11a704_fk_auth_group_id` (`group_id`),
  CONSTRAINT `accounts_user_groups_group_id_bd11a704_fk_auth_group_id` FOREIGN KEY (`group_id`) REFERENCES `auth_group` (`id`),
  CONSTRAINT `accounts_user_groups_user_id_52b62117_fk_accounts_user_id` FOREIGN KEY (`user_id`) REFERENCES `accounts_user` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `accounts_user_groups`
--

LOCK TABLES `accounts_user_groups` WRITE;
/*!40000 ALTER TABLE `accounts_user_groups` DISABLE KEYS */;
/*!40000 ALTER TABLE `accounts_user_groups` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `accounts_user_user_permissions`
--

DROP TABLE IF EXISTS `accounts_user_user_permissions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `accounts_user_user_permissions` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` bigint NOT NULL,
  `permission_id` int NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `accounts_user_user_permi_user_id_permission_id_2ab516c2_uniq` (`user_id`,`permission_id`),
  KEY `accounts_user_user_p_permission_id_113bb443_fk_auth_perm` (`permission_id`),
  CONSTRAINT `accounts_user_user_p_permission_id_113bb443_fk_auth_perm` FOREIGN KEY (`permission_id`) REFERENCES `auth_permission` (`id`),
  CONSTRAINT `accounts_user_user_p_user_id_e4f0a161_fk_accounts_` FOREIGN KEY (`user_id`) REFERENCES `accounts_user` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `accounts_user_user_permissions`
--

LOCK TABLES `accounts_user_user_permissions` WRITE;
/*!40000 ALTER TABLE `accounts_user_user_permissions` DISABLE KEYS */;
/*!40000 ALTER TABLE `accounts_user_user_permissions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `auth_group`
--

DROP TABLE IF EXISTS `auth_group`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `auth_group` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `auth_group`
--

LOCK TABLES `auth_group` WRITE;
/*!40000 ALTER TABLE `auth_group` DISABLE KEYS */;
/*!40000 ALTER TABLE `auth_group` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `auth_group_permissions`
--

DROP TABLE IF EXISTS `auth_group_permissions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `auth_group_permissions` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `group_id` int NOT NULL,
  `permission_id` int NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `auth_group_permissions_group_id_permission_id_0cd325b0_uniq` (`group_id`,`permission_id`),
  KEY `auth_group_permissio_permission_id_84c5c92e_fk_auth_perm` (`permission_id`),
  CONSTRAINT `auth_group_permissio_permission_id_84c5c92e_fk_auth_perm` FOREIGN KEY (`permission_id`) REFERENCES `auth_permission` (`id`),
  CONSTRAINT `auth_group_permissions_group_id_b120cbf9_fk_auth_group_id` FOREIGN KEY (`group_id`) REFERENCES `auth_group` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `auth_group_permissions`
--

LOCK TABLES `auth_group_permissions` WRITE;
/*!40000 ALTER TABLE `auth_group_permissions` DISABLE KEYS */;
/*!40000 ALTER TABLE `auth_group_permissions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `auth_permission`
--

DROP TABLE IF EXISTS `auth_permission`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `auth_permission` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `content_type_id` int NOT NULL,
  `codename` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `auth_permission_content_type_id_codename_01ab375a_uniq` (`content_type_id`,`codename`),
  CONSTRAINT `auth_permission_content_type_id_2f476e4b_fk_django_co` FOREIGN KEY (`content_type_id`) REFERENCES `django_content_type` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=141 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `auth_permission`
--

LOCK TABLES `auth_permission` WRITE;
/*!40000 ALTER TABLE `auth_permission` DISABLE KEYS */;
INSERT INTO `auth_permission` VALUES (1,'Can add log entry',1,'add_logentry'),(2,'Can change log entry',1,'change_logentry'),(3,'Can delete log entry',1,'delete_logentry'),(4,'Can view log entry',1,'view_logentry'),(5,'Can add permission',3,'add_permission'),(6,'Can change permission',3,'change_permission'),(7,'Can delete permission',3,'delete_permission'),(8,'Can view permission',3,'view_permission'),(9,'Can add group',2,'add_group'),(10,'Can change group',2,'change_group'),(11,'Can delete group',2,'delete_group'),(12,'Can view group',2,'view_group'),(13,'Can add content type',4,'add_contenttype'),(14,'Can change content type',4,'change_contenttype'),(15,'Can delete content type',4,'delete_contenttype'),(16,'Can view content type',4,'view_contenttype'),(17,'Can add session',5,'add_session'),(18,'Can change session',5,'change_session'),(19,'Can delete session',5,'delete_session'),(20,'Can view session',5,'view_session'),(21,'Can add Blacklisted Token',6,'add_blacklistedtoken'),(22,'Can change Blacklisted Token',6,'change_blacklistedtoken'),(23,'Can delete Blacklisted Token',6,'delete_blacklistedtoken'),(24,'Can view Blacklisted Token',6,'view_blacklistedtoken'),(25,'Can add Outstanding Token',7,'add_outstandingtoken'),(26,'Can change Outstanding Token',7,'change_outstandingtoken'),(27,'Can delete Outstanding Token',7,'delete_outstandingtoken'),(28,'Can view Outstanding Token',7,'view_outstandingtoken'),(29,'Can add user',11,'add_user'),(30,'Can change user',11,'change_user'),(31,'Can delete user',11,'delete_user'),(32,'Can view user',11,'view_user'),(33,'Can add client profile',9,'add_clientprofile'),(34,'Can change client profile',9,'change_clientprofile'),(35,'Can delete client profile',9,'delete_clientprofile'),(36,'Can view client profile',9,'view_clientprofile'),(37,'Can add client document',8,'add_clientdocument'),(38,'Can change client document',8,'change_clientdocument'),(39,'Can delete client document',8,'delete_clientdocument'),(40,'Can view client document',8,'view_clientdocument'),(41,'Can add role',10,'add_role'),(42,'Can change role',10,'change_role'),(43,'Can delete role',10,'delete_role'),(44,'Can view role',10,'view_role'),(45,'Can add notification',12,'add_notification'),(46,'Can change notification',12,'change_notification'),(47,'Can delete notification',12,'delete_notification'),(48,'Can view notification',12,'view_notification'),(49,'Can add brand',13,'add_brand'),(50,'Can change brand',13,'change_brand'),(51,'Can delete brand',13,'delete_brand'),(52,'Can view brand',13,'view_brand'),(53,'Can add vehicle category',16,'add_vehiclecategory'),(54,'Can change vehicle category',16,'change_vehiclecategory'),(55,'Can delete vehicle category',16,'delete_vehiclecategory'),(56,'Can view vehicle category',16,'view_vehiclecategory'),(57,'Can add parking',14,'add_parking'),(58,'Can change parking',14,'change_parking'),(59,'Can delete parking',14,'delete_parking'),(60,'Can view parking',14,'view_parking'),(61,'Can add parking space',15,'add_parkingspace'),(62,'Can change parking space',15,'change_parkingspace'),(63,'Can delete parking space',15,'delete_parkingspace'),(64,'Can view parking space',15,'view_parkingspace'),(65,'Can add vehicle',17,'add_vehicle'),(66,'Can change vehicle',17,'change_vehicle'),(67,'Can delete vehicle',17,'delete_vehicle'),(68,'Can view vehicle',17,'view_vehicle'),(69,'Can add vehicle photo',18,'add_vehiclephoto'),(70,'Can change vehicle photo',18,'change_vehiclephoto'),(71,'Can delete vehicle photo',18,'delete_vehiclephoto'),(72,'Can view vehicle photo',18,'view_vehiclephoto'),(73,'Can add reservation',19,'add_reservation'),(74,'Can change reservation',19,'change_reservation'),(75,'Can delete reservation',19,'delete_reservation'),(76,'Can view reservation',19,'view_reservation'),(77,'Can add payment',21,'add_payment'),(78,'Can change payment',21,'change_payment'),(79,'Can delete payment',21,'delete_payment'),(80,'Can view payment',21,'view_payment'),(81,'Can add refund',22,'add_refund'),(82,'Can change refund',22,'change_refund'),(83,'Can delete refund',22,'delete_refund'),(84,'Can view refund',22,'view_refund'),(85,'Can add stripe event',23,'add_stripeevent'),(86,'Can change stripe event',23,'change_stripeevent'),(87,'Can delete stripe event',23,'delete_stripeevent'),(88,'Can view stripe event',23,'view_stripeevent'),(89,'Can add deposit',20,'add_deposit'),(90,'Can change deposit',20,'change_deposit'),(91,'Can delete deposit',20,'delete_deposit'),(92,'Can view deposit',20,'view_deposit'),(93,'Can add inspection',25,'add_inspection'),(94,'Can change inspection',25,'change_inspection'),(95,'Can delete inspection',25,'delete_inspection'),(96,'Can view inspection',25,'view_inspection'),(97,'Can add damage',24,'add_damage'),(98,'Can change damage',24,'change_damage'),(99,'Can delete damage',24,'delete_damage'),(100,'Can view damage',24,'view_damage'),(101,'Can add inspection photo',26,'add_inspectionphoto'),(102,'Can change inspection photo',26,'change_inspectionphoto'),(103,'Can delete inspection photo',26,'delete_inspectionphoto'),(104,'Can view inspection photo',26,'view_inspectionphoto'),(105,'Can add vehicle access',31,'add_vehicleaccess'),(106,'Can change vehicle access',31,'change_vehicleaccess'),(107,'Can delete vehicle access',31,'delete_vehicleaccess'),(108,'Can view vehicle access',31,'view_vehicleaccess'),(109,'Can add locking log',28,'add_lockinglog'),(110,'Can change locking log',28,'change_lockinglog'),(111,'Can delete locking log',28,'delete_lockinglog'),(112,'Can view locking log',28,'view_lockinglog'),(113,'Can add intervention',27,'add_intervention'),(114,'Can change intervention',27,'change_intervention'),(115,'Can delete intervention',27,'delete_intervention'),(116,'Can view intervention',27,'view_intervention'),(117,'Can add technical inspection',29,'add_technicalinspection'),(118,'Can change technical inspection',29,'change_technicalinspection'),(119,'Can delete technical inspection',29,'delete_technicalinspection'),(120,'Can view technical inspection',29,'view_technicalinspection'),(121,'Can add technical photo',30,'add_technicalphoto'),(122,'Can change technical photo',30,'change_technicalphoto'),(123,'Can delete technical photo',30,'delete_technicalphoto'),(124,'Can view technical photo',30,'view_technicalphoto'),(125,'Can add invoice',32,'add_invoice'),(126,'Can change invoice',32,'change_invoice'),(127,'Can delete invoice',32,'delete_invoice'),(128,'Can view invoice',32,'view_invoice'),(129,'Can add invoice line',33,'add_invoiceline'),(130,'Can change invoice line',33,'change_invoiceline'),(131,'Can delete invoice line',33,'delete_invoiceline'),(132,'Can view invoice line',33,'view_invoiceline'),(133,'Can add system log',34,'add_systemlog'),(134,'Can change system log',34,'change_systemlog'),(135,'Can delete system log',34,'delete_systemlog'),(136,'Can view system log',34,'view_systemlog'),(137,'Can add backup record',35,'add_backuprecord'),(138,'Can change backup record',35,'change_backuprecord'),(139,'Can delete backup record',35,'delete_backuprecord'),(140,'Can view backup record',35,'view_backuprecord');
/*!40000 ALTER TABLE `auth_permission` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `common_backuprecord`
--

DROP TABLE IF EXISTS `common_backuprecord`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `common_backuprecord` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `filename` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `backup_type` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_size` bigint DEFAULT NULL,
  `file_path` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `error_message` longtext COLLATE utf8mb4_unicode_ci,
  `created_at` datetime(6) NOT NULL,
  `completed_at` datetime(6) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `common_backuprecord`
--

LOCK TABLES `common_backuprecord` WRITE;
/*!40000 ALTER TABLE `common_backuprecord` DISABLE KEYS */;
INSERT INTO `common_backuprecord` VALUES (1,'autorental_20260811_203023.sql','EN_COURS','DATABASE',NULL,'C:\\Users\\liern\\OneDrive\\Bureau\\AutoRental\\Backend\\backups\\autorental_20260811_203023.sql',NULL,'2026-08-11 20:30:23.469673',NULL);
/*!40000 ALTER TABLE `common_backuprecord` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `common_systemlog`
--

DROP TABLE IF EXISTS `common_systemlog`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `common_systemlog` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `action` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `message` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `level` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL,
  `ip_address` char(39) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime(6) NOT NULL,
  `user_id` bigint DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `common_systemlog_user_id_f7d74e9d_fk_accounts_user_id` (`user_id`),
  CONSTRAINT `common_systemlog_user_id_f7d74e9d_fk_accounts_user_id` FOREIGN KEY (`user_id`) REFERENCES `accounts_user` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `common_systemlog`
--

LOCK TABLES `common_systemlog` WRITE;
/*!40000 ALTER TABLE `common_systemlog` DISABLE KEYS */;
INSERT INTO `common_systemlog` VALUES (1,'LOGIN_SUCCESS','Utilisateur connecte avec succes.','INFO','127.0.0.1','2026-08-11 18:54:31.153190',1),(2,'LOGIN_SUCCESS','Utilisateur connecte avec succes.','INFO','127.0.0.1','2026-08-11 18:56:44.802292',5);
/*!40000 ALTER TABLE `common_systemlog` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `django_admin_log`
--

DROP TABLE IF EXISTS `django_admin_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `django_admin_log` (
  `id` int NOT NULL AUTO_INCREMENT,
  `action_time` datetime(6) NOT NULL,
  `object_id` longtext COLLATE utf8mb4_unicode_ci,
  `object_repr` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `action_flag` smallint unsigned NOT NULL,
  `change_message` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `content_type_id` int DEFAULT NULL,
  `user_id` bigint NOT NULL,
  PRIMARY KEY (`id`),
  KEY `django_admin_log_content_type_id_c4bce8eb_fk_django_co` (`content_type_id`),
  KEY `django_admin_log_user_id_c564eba6_fk_accounts_user_id` (`user_id`),
  CONSTRAINT `django_admin_log_content_type_id_c4bce8eb_fk_django_co` FOREIGN KEY (`content_type_id`) REFERENCES `django_content_type` (`id`),
  CONSTRAINT `django_admin_log_user_id_c564eba6_fk_accounts_user_id` FOREIGN KEY (`user_id`) REFERENCES `accounts_user` (`id`),
  CONSTRAINT `django_admin_log_chk_1` CHECK ((`action_flag` >= 0))
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `django_admin_log`
--

LOCK TABLES `django_admin_log` WRITE;
/*!40000 ALTER TABLE `django_admin_log` DISABLE KEYS */;
INSERT INTO `django_admin_log` VALUES (1,'2026-08-01 01:47:18.244635','2','nicolas.lrnx@gmail.com',1,'[{\"added\": {}}]',11,1),(2,'2026-08-05 15:29:04.616325','2','Probe Park - P2',1,'[{\"added\": {}}]',15,1);
/*!40000 ALTER TABLE `django_admin_log` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `django_content_type`
--

DROP TABLE IF EXISTS `django_content_type`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `django_content_type` (
  `id` int NOT NULL AUTO_INCREMENT,
  `app_label` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `model` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `django_content_type_app_label_model_76bd3d3b_uniq` (`app_label`,`model`)
) ENGINE=InnoDB AUTO_INCREMENT=36 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `django_content_type`
--

LOCK TABLES `django_content_type` WRITE;
/*!40000 ALTER TABLE `django_content_type` DISABLE KEYS */;
INSERT INTO `django_content_type` VALUES (8,'accounts','clientdocument'),(9,'accounts','clientprofile'),(10,'accounts','role'),(11,'accounts','user'),(1,'admin','logentry'),(2,'auth','group'),(3,'auth','permission'),(35,'common','backuprecord'),(34,'common','systemlog'),(4,'contenttypes','contenttype'),(24,'inspections','damage'),(25,'inspections','inspection'),(26,'inspections','inspectionphoto'),(27,'interventions','intervention'),(28,'interventions','lockinglog'),(29,'interventions','technicalinspection'),(30,'interventions','technicalphoto'),(31,'interventions','vehicleaccess'),(32,'invoicing','invoice'),(33,'invoicing','invoiceline'),(12,'notifications','notification'),(20,'payments','deposit'),(21,'payments','payment'),(22,'payments','refund'),(23,'payments','stripeevent'),(19,'reservations','reservation'),(5,'sessions','session'),(6,'token_blacklist','blacklistedtoken'),(7,'token_blacklist','outstandingtoken'),(13,'vehicles','brand'),(14,'vehicles','parking'),(15,'vehicles','parkingspace'),(17,'vehicles','vehicle'),(16,'vehicles','vehiclecategory'),(18,'vehicles','vehiclephoto');
/*!40000 ALTER TABLE `django_content_type` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `django_migrations`
--

DROP TABLE IF EXISTS `django_migrations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `django_migrations` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `app` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `applied` datetime(6) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=47 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `django_migrations`
--

LOCK TABLES `django_migrations` WRITE;
/*!40000 ALTER TABLE `django_migrations` DISABLE KEYS */;
INSERT INTO `django_migrations` VALUES (1,'contenttypes','0001_initial','2026-07-31 14:55:51.323183'),(2,'contenttypes','0002_remove_content_type_name','2026-07-31 14:55:51.435832'),(3,'auth','0001_initial','2026-07-31 14:55:51.678918'),(4,'auth','0002_alter_permission_name_max_length','2026-07-31 14:55:51.732333'),(5,'auth','0003_alter_user_email_max_length','2026-07-31 14:55:51.737889'),(6,'auth','0004_alter_user_username_opts','2026-07-31 14:55:51.742200'),(7,'auth','0005_alter_user_last_login_null','2026-07-31 14:55:51.750412'),(8,'auth','0006_require_contenttypes_0002','2026-07-31 14:55:51.755143'),(9,'auth','0007_alter_validators_add_error_messages','2026-07-31 14:55:51.760052'),(10,'auth','0008_alter_user_username_max_length','2026-07-31 14:55:51.766697'),(11,'auth','0009_alter_user_last_name_max_length','2026-07-31 14:55:51.771839'),(12,'auth','0010_alter_group_name_max_length','2026-07-31 14:55:51.788229'),(13,'auth','0011_update_proxy_permissions','2026-07-31 14:55:51.796648'),(14,'auth','0012_alter_user_first_name_max_length','2026-07-31 14:55:51.802883'),(15,'accounts','0001_initial','2026-07-31 14:55:52.650271'),(16,'admin','0001_initial','2026-07-31 14:55:52.765394'),(17,'admin','0002_logentry_remove_auto_add','2026-07-31 14:55:52.774043'),(18,'admin','0003_logentry_add_action_flag_choices','2026-07-31 14:55:52.783279'),(19,'sessions','0001_initial','2026-07-31 14:55:52.821427'),(20,'token_blacklist','0001_initial','2026-07-31 14:55:52.960525'),(21,'token_blacklist','0002_outstandingtoken_jti_hex','2026-07-31 14:55:53.006319'),(22,'token_blacklist','0003_auto_20171017_2007','2026-07-31 14:55:53.020277'),(23,'token_blacklist','0004_auto_20171017_2013','2026-07-31 14:55:53.084196'),(24,'token_blacklist','0005_remove_outstandingtoken_jti','2026-07-31 14:55:53.126479'),(25,'token_blacklist','0006_auto_20171017_2113','2026-07-31 14:55:53.146486'),(26,'token_blacklist','0007_auto_20171017_2214','2026-07-31 14:55:53.313336'),(27,'token_blacklist','0008_migrate_to_bigautofield','2026-07-31 14:55:53.525091'),(28,'token_blacklist','0010_fix_migrate_to_bigautofield','2026-07-31 14:55:53.538173'),(29,'token_blacklist','0011_linearizes_history','2026-07-31 14:55:53.541359'),(30,'token_blacklist','0012_alter_outstandingtoken_user','2026-07-31 14:55:53.552536'),(31,'token_blacklist','0013_alter_blacklistedtoken_options_and_more','2026-07-31 14:55:53.564809'),(32,'accounts','0002_remove_clientdocument_uniq_active_doc_per_client_type_and_more','2026-07-31 15:02:35.243290'),(33,'notifications','0001_initial','2026-07-31 19:45:40.009696'),(34,'vehicles','0001_initial','2026-08-01 00:13:58.623122'),(35,'vehicles','0002_vehicle_vehiclephoto_vehicle_vehicle_status_idx_and_more','2026-08-01 00:20:53.702423'),(36,'reservations','0001_initial','2026-08-01 09:18:45.521094'),(37,'inspections','0001_initial','2026-08-03 16:23:11.980729'),(38,'inspections','0002_damage_evidence_photos','2026-08-03 16:23:12.129693'),(39,'interventions','0001_initial','2026-08-03 16:23:13.016693'),(40,'interventions','0002_intervention_technicalinspection_technicalphoto_and_more','2026-08-03 16:23:14.691908'),(41,'payments','0001_initial','2026-08-03 16:23:15.991827'),(42,'notifications','0002_remove_notification_notif_user_idx_and_more','2026-08-03 20:13:51.895862'),(43,'invoicing','0001_initial','2026-08-04 14:32:11.390041'),(44,'interventions','0003_remove_intervention_interv_started_at_only_in_progress_and_more','2026-08-07 09:01:02.692022'),(45,'common','0001_initial','2026-08-11 16:12:23.552538'),(46,'common','0002_backuprecord','2026-08-11 20:15:25.518681');
/*!40000 ALTER TABLE `django_migrations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `django_session`
--

DROP TABLE IF EXISTS `django_session`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `django_session` (
  `session_key` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL,
  `session_data` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `expire_date` datetime(6) NOT NULL,
  PRIMARY KEY (`session_key`),
  KEY `django_session_expire_date_a5c62663` (`expire_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `django_session`
--

LOCK TABLES `django_session` WRITE;
/*!40000 ALTER TABLE `django_session` DISABLE KEYS */;
INSERT INTO `django_session` VALUES ('01k09rag1w4kqe2d26blz2mmtrylha2k','.eJxVjEEOwiAQRe_C2pAyFCgu3XsGMjCDVA0kpV0Z765NutDtf-_9lwi4rSVsnZcwkziLSZx-t4jpwXUHdMd6azK1ui5zlLsiD9rltRE_L4f7d1Cwl2-tVVLajmQMkHeeEgM6bXEc3IBsnefIQIAZiJQFa0jnKSbDyWZAQvH-AOHqOJE:1wrymZ:Rw4vs8wUD2noLEpujZIicrITgEXgn3fAKDYEznDaW1A','2026-08-20 14:09:15.591805'),('8byl6x1ihkzcr8wjeekmcxz4s4knal8u','.eJxVjEEOwiAQRe_C2pAyFCgu3XsGMjCDVA0kpV0Z765NutDtf-_9lwi4rSVsnZcwkziLSZx-t4jpwXUHdMd6azK1ui5zlLsiD9rltRE_L4f7d1Cwl2-tVVLajmQMkHeeEgM6bXEc3IBsnefIQIAZiJQFa0jnKSbDyWZAQvH-AOHqOJE:1wrylG:oRsuxwBmlWth1u2aR6A_wze8P3Hhu1d67yXHc8P_1CA','2026-08-20 14:07:54.840041'),('dwgsu9s1a1qdfhk6a9qgh6071ofe3dix','.eJxVjEEOgjAQRe_StWlKkdJx6Z4zkM_MVFBTEgor492VhIVu_3vvv0yPbR37rejST2IupjKn320APzTvQO7It9nynNdlGuyu2IMW282iz-vh_h2MKOO3DhCimFqQcxEUWSipd3XjPBIrqXCq6hChseHgBUHbdE6o0CoFhXl_AP7ROQ8:1wpyl8:ePZpIsA2zNFFlG5by_IUZdJOxlgfIJ7ceuZy37GaAOA','2026-08-15 01:43:30.112946'),('f5kvaxnhw9wua54vynen6jwl5mcnx0ri','.eJxVjEEOwiAQRe_C2hBgShlcuvcMZIBBqoYmpV0Z765NutDtf-_9lwi0rTVsnZcwZXEWWovT7xgpPbjtJN-p3WaZ5rYuU5S7Ig_a5XXO_Lwc7t9BpV6_NQJ5JC7golM4gmfvYBwIMsbBFlsYGRLYkpQB5KjQJpMT-QzFozbi_QEEmjgj:1wryL4:RMR2aA-CcieDLmW7YLFiT90IU3rRISaCkY-yZ-9i2Ek','2026-08-20 13:40:50.556504'),('kp0ncxfd42fvh320s5glrju9l6rdgvrs','.eJxVjMEOwiAQRP-FsyFdWCz16L3fQBZ2K1VDk9KejP-uJD3oaZJ5b-alAu1bDnuVNcysLgqsOv2WkdJDSiN8p3JbdFrKts5RN0UftOpxYXleD_fvIFPN37VHAONTRGLwjpMlH4c-2R4nEGM7YJyciIWIic6OyUTjWgh1DgdU7w8FYzga:1wt12l:hH0aghDWSaYHNZZVZI5dzTyI-b0eqSL7l_Icsid3_oQ','2026-08-23 10:46:15.196967'),('lzy7ghoto0calg2s1rtzvpry6cge3swk','.eJxVjMEOwiAQRP-FsyFdWCz16L3fQBZ2K1VDk9KejP-uJD3oaZJ5b-alAu1bDnuVNcysLgqsOv2WkdJDSiN8p3JbdFrKts5RN0UftOpxYXleD_fvIFPN37VHAONTRGLwjpMlH4c-2R4nEGM7YJyciIWIic6OyUTjWgh1DgdU7w8FYzga:1wt11L:hP2e43geCR7OZfwnZ2hibG_c8dtG-j0Jv_skiowjIfc','2026-08-23 10:44:47.693852');
/*!40000 ALTER TABLE `django_session` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `inspections_damage`
--

DROP TABLE IF EXISTS `inspections_damage`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `inspections_damage` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `description` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `severity` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `location` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_new` tinyint(1) NOT NULL,
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `estimated_cost` decimal(10,2) DEFAULT NULL,
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  `resolved_at` datetime(6) DEFAULT NULL,
  `reported_by_id` bigint NOT NULL,
  `vehicle_id` bigint NOT NULL,
  `inspection_id` bigint NOT NULL,
  PRIMARY KEY (`id`),
  KEY `damage_inspection_idx` (`inspection_id`),
  KEY `damage_vehicle_idx` (`vehicle_id`),
  KEY `damage_status_idx` (`status`),
  KEY `damage_severity_idx` (`severity`),
  KEY `inspections_damage_reported_by_id_3cd569f8_fk_accounts_user_id` (`reported_by_id`),
  KEY `inspections_damage_status_b3aaf0e5` (`status`),
  CONSTRAINT `inspections_damage_inspection_id_883d30fd_fk_inspectio` FOREIGN KEY (`inspection_id`) REFERENCES `inspections_inspection` (`id`),
  CONSTRAINT `inspections_damage_reported_by_id_3cd569f8_fk_accounts_user_id` FOREIGN KEY (`reported_by_id`) REFERENCES `accounts_user` (`id`),
  CONSTRAINT `inspections_damage_vehicle_id_40128089_fk_vehicles_vehicle_id` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles_vehicle` (`id`),
  CONSTRAINT `damage_estimated_cost_gte_0` CHECK (((`estimated_cost` >= 0) or (`estimated_cost` is null))),
  CONSTRAINT `damage_resolved_at_only_when_resolved` CHECK (((`resolved_at` is null) or (`status` = _utf8mb4'RESOLU')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `inspections_damage`
--

LOCK TABLES `inspections_damage` WRITE;
/*!40000 ALTER TABLE `inspections_damage` DISABLE KEYS */;
/*!40000 ALTER TABLE `inspections_damage` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `inspections_damage_evidence_photos`
--

DROP TABLE IF EXISTS `inspections_damage_evidence_photos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `inspections_damage_evidence_photos` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `damage_id` bigint NOT NULL,
  `inspectionphoto_id` bigint NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `inspections_damage_evide_damage_id_inspectionphot_2aa72974_uniq` (`damage_id`,`inspectionphoto_id`),
  KEY `inspections_damage_e_inspectionphoto_id_696b6d83_fk_inspectio` (`inspectionphoto_id`),
  CONSTRAINT `inspections_damage_e_damage_id_440bee4f_fk_inspectio` FOREIGN KEY (`damage_id`) REFERENCES `inspections_damage` (`id`),
  CONSTRAINT `inspections_damage_e_inspectionphoto_id_696b6d83_fk_inspectio` FOREIGN KEY (`inspectionphoto_id`) REFERENCES `inspections_inspectionphoto` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `inspections_damage_evidence_photos`
--

LOCK TABLES `inspections_damage_evidence_photos` WRITE;
/*!40000 ALTER TABLE `inspections_damage_evidence_photos` DISABLE KEYS */;
/*!40000 ALTER TABLE `inspections_damage_evidence_photos` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `inspections_inspection`
--

DROP TABLE IF EXISTS `inspections_inspection`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `inspections_inspection` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `inspection_type` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `mileage` int unsigned DEFAULT NULL,
  `energy_level_percent` smallint unsigned DEFAULT NULL,
  `comments` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `has_critical_issue` tinyint(1) NOT NULL,
  `critical_issue_description` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `started_at` datetime(6) DEFAULT NULL,
  `completed_at` datetime(6) DEFAULT NULL,
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  `completed_by_id` bigint DEFAULT NULL,
  `reservation_id` bigint NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `insp_unique_reservation_type` (`reservation_id`,`inspection_type`),
  KEY `insp_reservation_idx` (`reservation_id`),
  KEY `insp_status_idx` (`status`),
  KEY `insp_type_idx` (`inspection_type`),
  KEY `inspections_inspecti_completed_by_id_102968ee_fk_accounts_` (`completed_by_id`),
  KEY `inspections_inspection_status_35306ace` (`status`),
  CONSTRAINT `inspections_inspecti_completed_by_id_102968ee_fk_accounts_` FOREIGN KEY (`completed_by_id`) REFERENCES `accounts_user` (`id`),
  CONSTRAINT `inspections_inspecti_reservation_id_0bb8c69b_fk_reservati` FOREIGN KEY (`reservation_id`) REFERENCES `reservations_reservation` (`id`),
  CONSTRAINT `insp_completed_at_only_when_done` CHECK (((`completed_at` is null) or (`status` = _utf8mb4'TERMINE'))),
  CONSTRAINT `insp_energy_0_100` CHECK ((((`energy_level_percent` >= 0) and (`energy_level_percent` <= 100)) or (`energy_level_percent` is null))),
  CONSTRAINT `insp_mileage_gte_0` CHECK (((`mileage` >= 0) or (`mileage` is null))),
  CONSTRAINT `inspections_inspection_chk_1` CHECK ((`mileage` >= 0)),
  CONSTRAINT `inspections_inspection_chk_2` CHECK ((`energy_level_percent` >= 0))
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `inspections_inspection`
--

LOCK TABLES `inspections_inspection` WRITE;
/*!40000 ALTER TABLE `inspections_inspection` DISABLE KEYS */;
INSERT INTO `inspections_inspection` VALUES (1,'INITIAL','TERMINE',15010,80,'Etat général correct au départ.',0,'','2026-08-06 14:10:57.690152','2026-08-06 14:38:06.073518','2026-08-06 14:10:57.691406','2026-08-06 14:38:06.073842',8,2),(2,'FINAL','TERMINE',15120,55,'Retour du véhicule, état général correct.',0,'','2026-08-06 14:42:08.988526','2026-08-06 14:47:39.341058','2026-08-06 14:42:08.988873','2026-08-06 14:47:39.341369',8,2);
/*!40000 ALTER TABLE `inspections_inspection` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `inspections_inspectionphoto`
--

DROP TABLE IF EXISTS `inspections_inspectionphoto`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `inspections_inspectionphoto` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `photo_type` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `file` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `position` int unsigned NOT NULL,
  `created_at` datetime(6) NOT NULL,
  `inspection_id` bigint NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `insp_photo_unique_type_position` (`inspection_id`,`photo_type`,`position`),
  KEY `insp_photo_type_idx` (`inspection_id`,`photo_type`),
  CONSTRAINT `inspections_inspecti_inspection_id_401443a4_fk_inspectio` FOREIGN KEY (`inspection_id`) REFERENCES `inspections_inspection` (`id`),
  CONSTRAINT `insp_photo_position_gte_0` CHECK ((`position` >= 0)),
  CONSTRAINT `insp_photo_single_views_pos0` CHECK (((`photo_type` in (_utf8mb4'DOMMAGE',_utf8mb4'AUTRE')) or (`position` = 0))),
  CONSTRAINT `inspections_inspectionphoto_chk_1` CHECK ((`position` >= 0))
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `inspections_inspectionphoto`
--

LOCK TABLES `inspections_inspectionphoto` WRITE;
/*!40000 ALTER TABLE `inspections_inspectionphoto` DISABLE KEYS */;
INSERT INTO `inspections_inspectionphoto` VALUES (1,'AVANT','inspections/photos/089675f54c4244d39ce5f94e26ec561c.jpeg',0,'2026-08-06 14:29:55.509348',1),(2,'ARRIERE','inspections/photos/93b4caa3d93a4f8292cb7fa9c55c9841.jpeg',0,'2026-08-06 14:31:01.894828',1),(3,'COTE_GAUCHE','inspections/photos/aa1e863f58734f8f92e34dc5144634c0.jpeg',0,'2026-08-06 14:31:57.506395',1),(4,'COTE_DROIT','inspections/photos/ca65d5e4fecc441b87555227026fc666.jpeg',0,'2026-08-06 14:32:56.213571',1),(5,'INTERIEUR','inspections/photos/13971c02d07a4c898726559e4fdc90f0.jpeg',0,'2026-08-06 14:35:37.573759',1),(6,'TABLEAU_DE_BORD','inspections/photos/6295195da23f472785bac6be76ff909d.jpeg',0,'2026-08-06 14:36:15.193633',1),(7,'AVANT','inspections/photos/4d6802f86d28417680fc9f164c6b8535.jpeg',0,'2026-08-06 14:43:20.883963',2),(8,'ARRIERE','inspections/photos/3c522007435f4b6d8f59e9e9ad28a1ca.jpeg',0,'2026-08-06 14:43:49.883548',2),(9,'COTE_GAUCHE','inspections/photos/aa7e573aff054f029cf4156eaa2c6fea.jpeg',0,'2026-08-06 14:45:08.466873',2),(10,'COTE_DROIT','inspections/photos/21fd08fa2edf4523abf65fd2e012c540.jpeg',0,'2026-08-06 14:45:40.396247',2),(11,'INTERIEUR','inspections/photos/3804dad1aa274271ac27cc58afb5f8aa.jpeg',0,'2026-08-06 14:46:12.790969',2),(12,'TABLEAU_DE_BORD','inspections/photos/8be48a2bfb2446f98fa560c37cd6d395.jpeg',0,'2026-08-06 14:46:45.546216',2);
/*!40000 ALTER TABLE `inspections_inspectionphoto` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `interventions_intervention`
--

DROP TABLE IF EXISTS `interventions_intervention`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `interventions_intervention` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `reference` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL,
  `intervention_type` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `report` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `estimated_cost` decimal(10,2) DEFAULT NULL,
  `final_cost` decimal(10,2) DEFAULT NULL,
  `started_at` datetime(6) DEFAULT NULL,
  `completed_at` datetime(6) DEFAULT NULL,
  `cancelled_at` datetime(6) DEFAULT NULL,
  `cancellation_reason` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  `assigned_to_id` bigint DEFAULT NULL,
  `created_by_id` bigint NOT NULL,
  `inspection_id` bigint DEFAULT NULL,
  `reservation_id` bigint DEFAULT NULL,
  `vehicle_id` bigint NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `reference` (`reference`),
  KEY `interv_reference_idx` (`reference`),
  KEY `interv_status_idx` (`status`),
  KEY `interv_type_idx` (`intervention_type`),
  KEY `interv_vehicle_status_idx` (`vehicle_id`,`status`),
  KEY `interv_assignee_status_idx` (`assigned_to_id`,`status`),
  KEY `interv_reservation_idx` (`reservation_id`),
  KEY `interventions_interv_created_by_id_2dc7d1ea_fk_accounts_` (`created_by_id`),
  KEY `interventions_interv_inspection_id_430366f8_fk_inspectio` (`inspection_id`),
  CONSTRAINT `interventions_interv_assigned_to_id_8ef827eb_fk_accounts_` FOREIGN KEY (`assigned_to_id`) REFERENCES `accounts_user` (`id`),
  CONSTRAINT `interventions_interv_created_by_id_2dc7d1ea_fk_accounts_` FOREIGN KEY (`created_by_id`) REFERENCES `accounts_user` (`id`),
  CONSTRAINT `interventions_interv_inspection_id_430366f8_fk_inspectio` FOREIGN KEY (`inspection_id`) REFERENCES `inspections_inspection` (`id`),
  CONSTRAINT `interventions_interv_reservation_id_8340b730_fk_reservati` FOREIGN KEY (`reservation_id`) REFERENCES `reservations_reservation` (`id`),
  CONSTRAINT `interventions_interv_vehicle_id_031fcf40_fk_vehicles_` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles_vehicle` (`id`),
  CONSTRAINT `interv_assigned_required_unless_to_assign` CHECK (((`status` = _utf8mb4'A_ATTRIBUER') or (`assigned_to_id` is not null))),
  CONSTRAINT `interv_completed_at_only_done` CHECK (((`completed_at` is null) or (`status` = _utf8mb4'TERMINEE'))),
  CONSTRAINT `interv_estimated_cost_gte_0` CHECK (((`estimated_cost` >= 0) or (`estimated_cost` is null))),
  CONSTRAINT `interv_final_cost_gte_0` CHECK (((`final_cost` >= 0) or (`final_cost` is null))),
  CONSTRAINT `interv_started_at_only_in_progress` CHECK ((((`started_at` is null) and (`status` in (_utf8mb4'A_ATTRIBUER',_utf8mb4'ATTRIBUEE',_utf8mb4'ANNULEE'))) or ((`started_at` is not null) and (`status` in (_utf8mb4'EN_COURS',_utf8mb4'TERMINEE')))))
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `interventions_intervention`
--

LOCK TABLES `interventions_intervention` WRITE;
/*!40000 ALTER TABLE `interventions_intervention` DISABLE KEYS */;
INSERT INTO `interventions_intervention` VALUES (1,'INT-2026-1S70Y7CR','MECANIQUE','TERMINEE','Contrôle mécanique après retour du véhicule.','Contrôle mécanique terminé. Aucun problème critique détecté.',NULL,NULL,'2026-08-07 08:10:26.290688','2026-08-07 09:02:29.279716',NULL,'','2026-08-07 08:00:15.642064','2026-08-07 09:02:29.345025',5,4,NULL,2,2),(2,'INT-2026-DAGPX8XP','NETTOYAGE','TERMINEE','Nettoyage intérieur et extérieur après retour du véhicule.','Nettoyage intérieur et extérieur terminé. Véhicule propre et prêt pour contrôle final.',NULL,NULL,'2026-08-07 09:50:34.534249','2026-08-07 09:54:54.780971',NULL,'','2026-08-07 09:08:29.943945','2026-08-07 09:54:54.822783',6,4,NULL,2,2),(3,'INT-2026-OHY1T8N5','MECANIQUE','A_ATTRIBUER','','',NULL,NULL,NULL,NULL,NULL,'','2026-08-11 11:00:18.115899','2026-08-11 11:00:18.115986',NULL,4,NULL,NULL,1),(4,'INT-2026-1QZJI0E5','MECANIQUE','A_ATTRIBUER','refaire freins','',NULL,NULL,NULL,NULL,NULL,'','2026-08-11 11:02:15.681284','2026-08-11 11:02:15.681315',NULL,4,NULL,NULL,2),(5,'INT-2026-SW1LQ7BT','MECANIQUE','ATTRIBUEE','refaires les freins','',NULL,NULL,NULL,NULL,NULL,'','2026-08-11 11:04:12.766750','2026-08-11 11:10:49.076739',5,4,NULL,NULL,1),(6,'INT-2026-P6I7Y6BS','NETTOYAGE','TERMINEE','',':cBLVF',NULL,NULL,'2026-08-11 13:30:32.187425','2026-08-11 13:34:29.649525',NULL,'','2026-08-11 11:11:29.954438','2026-08-11 13:34:29.698036',6,4,NULL,NULL,1),(7,'INT-2026-9E53XITL','MECANIQUE','A_ATTRIBUER','freins','',NULL,NULL,NULL,NULL,NULL,'','2026-08-11 11:16:05.361781','2026-08-11 11:16:05.361850',NULL,4,NULL,NULL,1),(8,'INT-2026-BI1J76WN','MECANIQUE','ATTRIBUEE','freins','',NULL,NULL,NULL,NULL,NULL,'','2026-08-11 11:18:24.206688','2026-08-11 11:18:37.021717',5,4,NULL,NULL,1),(9,'INT-2026-N9TS1GR4','NETTOYAGE','ATTRIBUEE','','',NULL,NULL,NULL,NULL,NULL,'','2026-08-11 11:20:42.608239','2026-08-11 11:20:47.576261',6,4,NULL,NULL,2),(10,'INT-2026-XFRSJZON','NETTOYAGE','ATTRIBUEE','','',NULL,NULL,NULL,NULL,NULL,'','2026-08-11 11:23:32.554357','2026-08-11 11:23:50.561317',6,4,NULL,NULL,2),(11,'INT-2026-W8GC3W7O','MECANIQUE','TERMINEE','Diag mecanique','terminé',NULL,NULL,'2026-08-11 12:58:13.577816','2026-08-11 12:58:46.945440',NULL,'','2026-08-11 11:33:52.355396','2026-08-11 12:58:47.018002',5,4,NULL,NULL,2),(12,'INT-2026-0FES2SWF','NETTOYAGE','ATTRIBUEE','Diag nettoyage','',NULL,NULL,NULL,NULL,NULL,'','2026-08-11 11:33:52.406304','2026-08-11 11:33:52.599315',6,4,NULL,NULL,2);
/*!40000 ALTER TABLE `interventions_intervention` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `interventions_lockinglog`
--

DROP TABLE IF EXISTS `interventions_lockinglog`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `interventions_lockinglog` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `action` varchar(24) COLLATE utf8mb4_unicode_ci NOT NULL,
  `result` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL,
  `failure_code` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `failure_message` longtext COLLATE utf8mb4_unicode_ci,
  `attempted_reservation_id` bigint unsigned DEFAULT NULL,
  `ip_address` char(39) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_agent` varchar(512) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `metadata` json NOT NULL,
  `created_at` datetime(6) NOT NULL,
  `reservation_id` bigint DEFAULT NULL,
  `user_id` bigint DEFAULT NULL,
  `vehicle_id` bigint DEFAULT NULL,
  `vehicle_access_id` bigint DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `lock_log_res_created_idx` (`reservation_id`,`created_at`),
  KEY `lock_log_veh_created_idx` (`vehicle_id`,`created_at`),
  KEY `lock_log_user_created_idx` (`user_id`,`created_at`),
  KEY `lock_log_action_result_idx` (`action`,`result`),
  KEY `lock_log_created_at_idx` (`created_at`),
  KEY `interventions_lockin_vehicle_access_id_aaf50c6d_fk_intervent` (`vehicle_access_id`),
  CONSTRAINT `interventions_lockin_reservation_id_5ae4861b_fk_reservati` FOREIGN KEY (`reservation_id`) REFERENCES `reservations_reservation` (`id`),
  CONSTRAINT `interventions_lockin_vehicle_access_id_aaf50c6d_fk_intervent` FOREIGN KEY (`vehicle_access_id`) REFERENCES `interventions_vehicleaccess` (`id`),
  CONSTRAINT `interventions_lockin_vehicle_id_6deba677_fk_vehicles_` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles_vehicle` (`id`),
  CONSTRAINT `interventions_lockinglog_user_id_0faf6853_fk_accounts_user_id` FOREIGN KEY (`user_id`) REFERENCES `accounts_user` (`id`),
  CONSTRAINT `interventions_lockinglog_chk_1` CHECK ((`attempted_reservation_id` >= 0))
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `interventions_lockinglog`
--

LOCK TABLES `interventions_lockinglog` WRITE;
/*!40000 ALTER TABLE `interventions_lockinglog` DISABLE KEYS */;
INSERT INTO `interventions_lockinglog` VALUES (1,'ACCESS_ACTIVATED','SUCCESS',NULL,NULL,NULL,NULL,NULL,'{\"event\": \"vehicle_access_activation\"}','2026-08-06 14:38:06.269300',2,8,2,1),(2,'UNLOCK','SUCCESS',NULL,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 AVG/149.0.0.0','{}','2026-08-06 14:39:38.193987',2,8,2,1),(3,'LOCK','SUCCESS',NULL,NULL,NULL,NULL,NULL,'{}','2026-08-06 14:47:39.462710',2,8,2,1),(4,'ACCESS_REVOKED','SUCCESS',NULL,NULL,NULL,NULL,NULL,'{\"reason\": \"return_final_lock\"}','2026-08-06 14:47:39.489679',2,8,2,1),(5,'LOCK','FAILURE','INVALID_RESERVATION_STATUS','La reservation A_CONTROLER autorise uniquement le verrouillage final.',2,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 AVG/149.0.0.0','{}','2026-08-06 14:48:21.734178',2,8,2,1);
/*!40000 ALTER TABLE `interventions_lockinglog` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `interventions_technicalinspection`
--

DROP TABLE IF EXISTS `interventions_technicalinspection`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `interventions_technicalinspection` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `mileage` int unsigned NOT NULL,
  `energy_level_percent` smallint unsigned NOT NULL,
  `observations` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime(6) NOT NULL,
  `intervention_id` bigint NOT NULL,
  `vehicle_id` bigint NOT NULL,
  PRIMARY KEY (`id`),
  KEY `tech_insp_intervention_idx` (`intervention_id`),
  KEY `tech_insp_vehicle_idx` (`vehicle_id`),
  KEY `tech_insp_created_at_idx` (`created_at`),
  CONSTRAINT `interventions_techni_intervention_id_adbce00f_fk_intervent` FOREIGN KEY (`intervention_id`) REFERENCES `interventions_intervention` (`id`),
  CONSTRAINT `interventions_techni_vehicle_id_eb736c25_fk_vehicles_` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles_vehicle` (`id`),
  CONSTRAINT `interventions_technicalinspection_chk_1` CHECK ((`mileage` >= 0)),
  CONSTRAINT `interventions_technicalinspection_chk_2` CHECK ((`energy_level_percent` >= 0)),
  CONSTRAINT `tech_insp_energy_0_100` CHECK (((`energy_level_percent` >= 0) and (`energy_level_percent` <= 100))),
  CONSTRAINT `tech_insp_mileage_gte_0` CHECK ((`mileage` >= 0))
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `interventions_technicalinspection`
--

LOCK TABLES `interventions_technicalinspection` WRITE;
/*!40000 ALTER TABLE `interventions_technicalinspection` DISABLE KEYS */;
INSERT INTO `interventions_technicalinspection` VALUES (1,15120,0,'','2026-08-07 08:44:28.366072',1,2),(2,15120,0,'','2026-08-07 09:51:56.584207',2,2),(3,15120,0,'','2026-08-11 12:58:42.545844',11,2),(4,1,0,'','2026-08-11 13:30:50.675664',6,1);
/*!40000 ALTER TABLE `interventions_technicalinspection` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `interventions_technicalphoto`
--

DROP TABLE IF EXISTS `interventions_technicalphoto`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `interventions_technicalphoto` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `file` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `caption` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime(6) NOT NULL,
  `technical_inspection_id` bigint NOT NULL,
  PRIMARY KEY (`id`),
  KEY `tech_photo_insp_idx` (`technical_inspection_id`),
  KEY `tech_photo_created_at_idx` (`created_at`),
  CONSTRAINT `interventions_techni_technical_inspection_7c3d615c_fk_intervent` FOREIGN KEY (`technical_inspection_id`) REFERENCES `interventions_technicalinspection` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `interventions_technicalphoto`
--

LOCK TABLES `interventions_technicalphoto` WRITE;
/*!40000 ALTER TABLE `interventions_technicalphoto` DISABLE KEYS */;
INSERT INTO `interventions_technicalphoto` VALUES (1,'technical_inspections/photos/WhatsApp_Image_2026-03-24_at_4.26.36_PM.jpeg','Contrôle mécanique du véhicule','2026-08-07 08:44:28.382302',1),(2,'technical_inspections/photos/WhatsApp_Image_2026-03-20_at_11.11.25_AM.jpeg','Nettoyage du véhicule terminé','2026-08-07 09:51:56.615784',2),(3,'technical_inspections/photos/kangourou_final.png','réparation téminé','2026-08-11 12:58:42.562178',3),(4,'technical_inspections/photos/WhatsApp_Image_2026-03-24_at_4_JBxUU5w.26.36_PM.jpeg','terminé','2026-08-11 13:30:50.688032',4);
/*!40000 ALTER TABLE `interventions_technicalphoto` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `interventions_vehicleaccess`
--

DROP TABLE IF EXISTS `interventions_vehicleaccess`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `interventions_vehicleaccess` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `status` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL,
  `lock_state` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL,
  `valid_from` datetime(6) NOT NULL,
  `valid_until` datetime(6) NOT NULL,
  `activated_at` datetime(6) DEFAULT NULL,
  `revoked_at` datetime(6) DEFAULT NULL,
  `last_unlocked_at` datetime(6) DEFAULT NULL,
  `last_locked_at` datetime(6) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL,
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  `client_id` bigint NOT NULL,
  `reservation_id` bigint NOT NULL,
  `vehicle_id` bigint NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `reservation_id` (`reservation_id`),
  KEY `veh_access_status_idx` (`status`),
  KEY `veh_access_is_active_idx` (`is_active`),
  KEY `veh_access_valid_from_idx` (`valid_from`),
  KEY `veh_access_valid_until_idx` (`valid_until`),
  KEY `veh_access_vehicle_active_idx` (`vehicle_id`,`is_active`),
  KEY `interventions_vehicl_client_id_2203be4b_fk_accounts_` (`client_id`),
  CONSTRAINT `interventions_vehicl_client_id_2203be4b_fk_accounts_` FOREIGN KEY (`client_id`) REFERENCES `accounts_user` (`id`),
  CONSTRAINT `interventions_vehicl_reservation_id_c656c2f0_fk_reservati` FOREIGN KEY (`reservation_id`) REFERENCES `reservations_reservation` (`id`),
  CONSTRAINT `interventions_vehicl_vehicle_id_5211fd85_fk_vehicles_` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles_vehicle` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `interventions_vehicleaccess`
--

LOCK TABLES `interventions_vehicleaccess` WRITE;
/*!40000 ALTER TABLE `interventions_vehicleaccess` DISABLE KEYS */;
INSERT INTO `interventions_vehicleaccess` VALUES (1,'REVOKED','LOCKED','2026-08-06 13:47:54.731312','2026-08-08 16:17:54.731312','2026-08-06 14:38:06.193212','2026-08-06 14:47:39.467470','2026-08-06 14:39:38.168166','2026-08-06 14:47:39.442127',0,'2026-08-06 14:38:06.217693','2026-08-06 14:47:39.474235',8,2,2);
/*!40000 ALTER TABLE `interventions_vehicleaccess` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `invoicing_invoice`
--

DROP TABLE IF EXISTS `invoicing_invoice`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `invoicing_invoice` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `number` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `issue_date` date NOT NULL,
  `subtotal` decimal(10,2) NOT NULL,
  `tax_amount` decimal(10,2) NOT NULL,
  `total_amount` decimal(10,2) NOT NULL,
  `currency` varchar(3) COLLATE utf8mb4_unicode_ci NOT NULL,
  `billing_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `billing_address` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `pdf_file` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  `client_id` bigint NOT NULL,
  `reservation_id` bigint NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `number` (`number`),
  UNIQUE KEY `reservation_id` (`reservation_id`),
  KEY `invoice_client_issue_idx` (`client_id`,`issue_date`),
  KEY `invoice_status_issue_idx` (`status`,`issue_date`),
  CONSTRAINT `invoicing_invoice_client_id_eb77ced0_fk_accounts_` FOREIGN KEY (`client_id`) REFERENCES `accounts_clientprofile` (`id`),
  CONSTRAINT `invoicing_invoice_reservation_id_6353a844_fk_reservati` FOREIGN KEY (`reservation_id`) REFERENCES `reservations_reservation` (`id`),
  CONSTRAINT `invoice_currency_upper` CHECK ((`currency` = upper(`currency`))),
  CONSTRAINT `invoice_subtotal_gte_0` CHECK ((`subtotal` >= 0)),
  CONSTRAINT `invoice_tax_amount_gte_0` CHECK ((`tax_amount` >= 0)),
  CONSTRAINT `invoice_total_amount_gte_0` CHECK ((`total_amount` >= 0)),
  CONSTRAINT `invoice_total_matches_components` CHECK ((`total_amount` = (`subtotal` + `tax_amount`)))
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `invoicing_invoice`
--

LOCK TABLES `invoicing_invoice` WRITE;
/*!40000 ALTER TABLE `invoicing_invoice` DISABLE KEYS */;
INSERT INTO `invoicing_invoice` VALUES (2,'AR-2026-000001','ISSUED','2026-08-06',200.00,0.00,200.00,'EUR','Client Incomplete','12 rue de Test, 1000 Bruxelles','invoices/AR-2026-000001.pdf','2026-08-06 13:20:34.906535','2026-08-06 13:55:37.416363',2,2);
/*!40000 ALTER TABLE `invoicing_invoice` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `invoicing_invoiceline`
--

DROP TABLE IF EXISTS `invoicing_invoiceline`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `invoicing_invoiceline` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `line_type` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `quantity` decimal(10,2) NOT NULL,
  `unit_price` decimal(10,2) NOT NULL,
  `total_price` decimal(10,2) NOT NULL,
  `created_at` datetime(6) NOT NULL,
  `invoice_id` bigint NOT NULL,
  PRIMARY KEY (`id`),
  KEY `invoice_line_invoice_type_idx` (`invoice_id`,`line_type`),
  CONSTRAINT `invoicing_invoicelin_invoice_id_76c97100_fk_invoicing` FOREIGN KEY (`invoice_id`) REFERENCES `invoicing_invoice` (`id`),
  CONSTRAINT `invoice_line_qty_gt_0` CHECK ((`quantity` > 0)),
  CONSTRAINT `invoice_line_total_matches_components` CHECK ((`total_price` = (`quantity` * `unit_price`))),
  CONSTRAINT `invoice_line_total_price_gte_0` CHECK ((`total_price` >= 0)),
  CONSTRAINT `invoice_line_unit_price_gte_0` CHECK ((`unit_price` >= 0))
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `invoicing_invoiceline`
--

LOCK TABLES `invoicing_invoiceline` WRITE;
/*!40000 ALTER TABLE `invoicing_invoiceline` DISABLE KEYS */;
INSERT INTO `invoicing_invoiceline` VALUES (2,'VEHICLE_RENTAL','Location du vehicule',1.00,200.00,200.00,'2026-08-06 13:20:34.908859',2);
/*!40000 ALTER TABLE `invoicing_invoiceline` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `notifications_notification`
--

DROP TABLE IF EXISTS `notifications_notification`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notifications_notification` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `notification_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `message` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_read` tinyint(1) NOT NULL,
  `created_at` datetime(6) NOT NULL,
  `read_at` datetime(6) DEFAULT NULL,
  `related_object_type` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `related_object_id` bigint unsigned DEFAULT NULL,
  `user_id` bigint NOT NULL,
  PRIMARY KEY (`id`),
  KEY `notifications_notification_user_id_b5e8c0ff` (`user_id`),
  KEY `notif_user_read_created_idx` (`user_id`,`is_read`,`created_at`),
  KEY `notif_type_idx` (`notification_type`),
  KEY `notif_related_obj_idx` (`related_object_type`,`related_object_id`),
  CONSTRAINT `notifications_notification_user_id_b5e8c0ff_fk_accounts_user_id` FOREIGN KEY (`user_id`) REFERENCES `accounts_user` (`id`),
  CONSTRAINT `notif_read_state_consistency` CHECK ((((`is_read` = 0x00) and (`read_at` is null)) or ((`is_read` = 0x01) and (`read_at` is not null)))),
  CONSTRAINT `notifications_notification_chk_1` CHECK ((`related_object_id` >= 0))
) ENGINE=InnoDB AUTO_INCREMENT=38 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `notifications_notification`
--

LOCK TABLES `notifications_notification` WRITE;
/*!40000 ALTER TABLE `notifications_notification` DISABLE KEYS */;
INSERT INTO `notifications_notification` VALUES (1,'ACCOUNT_CREATED','Compte cree','Votre compte AutoRental a ete cree. Confirmez maintenant votre adresse e-mail.',0,'2026-08-05 09:15:27.088512',NULL,'user',10,10),(2,'EMAIL_VERIFIED','Adresse e-mail confirmee','Votre adresse e-mail AutoRental a bien ete confirmee.',0,'2026-08-05 10:02:09.173627',NULL,'user',10,10),(3,'ACCOUNT_CREATED','Compte cree','Votre compte AutoRental a ete cree. Confirmez maintenant votre adresse e-mail.',0,'2026-08-05 10:27:39.283088',NULL,'user',11,11),(4,'PASSWORD_CHANGED','Mot de passe modifie','Le mot de passe de votre compte AutoRental a ete reinitialise.',0,'2026-08-05 11:38:34.579522',NULL,NULL,NULL,7),(5,'DOCUMENT_UPLOADED','Document transmis','Votre document Permis de conduire a ete transmis et est en attente de validation.',0,'2026-08-05 12:57:52.087962',NULL,'document',4,8),(6,'DOCUMENT_UPLOADED','Document transmis','Votre document Carte d\'identite a ete transmis et est en attente de validation.',0,'2026-08-05 13:09:09.360288',NULL,'document',5,8),(7,'DOCUMENT_VALIDATED','Document valide','Votre document Permis de conduire a ete valide.',0,'2026-08-05 13:15:22.898704',NULL,'document',4,8),(8,'DOCUMENT_VALIDATED','Document valide','Votre document Carte d\'identite a ete valide.',0,'2026-08-05 13:16:20.033345',NULL,'document',5,8),(9,'RESERVATION_DRAFT_CREATED','Reservation creee','Votre reservation AR-2026-EXFZD2LJ a ete creee.',0,'2026-08-05 15:45:30.887608',NULL,'reservation',1,8),(10,'RESERVATION_CANCELLED','Reservation annulee','Votre reservation AR-2026-EXFZD2LJ a ete annulee.',0,'2026-08-05 15:48:53.829761',NULL,'reservation',1,8),(11,'RESERVATION_DRAFT_CREATED','Reservation creee','Votre reservation AR-2026-20P5CWWV a ete creee.',0,'2026-08-05 16:23:44.353552',NULL,'reservation',2,8),(12,'DEPOSIT_AUTHORIZED','Caution autorisee','La caution de votre reservation AR-2026-20P5CWWV a ete autorisee.',0,'2026-08-05 16:24:40.103002',NULL,'deposit',1,8),(13,'DEPOSIT_AUTHORIZED','Caution autorisee','La caution de votre reservation AR-2026-20P5CWWV a ete autorisee.',0,'2026-08-05 16:24:40.105732',NULL,'reservation',2,8),(17,'PAYMENT_CONFLICT','Conflit apres paiement Stripe','La reservation AR-2026-20P5CWWV a ete payee mais le vehicule n\'est plus disponible. Remboursement a preparer manuellement.',0,'2026-08-06 13:07:10.337994',NULL,'Reservation',2,4),(18,'PAYMENT_CONFLICT','Conflit apres paiement Stripe','La reservation AR-2026-20P5CWWV a ete payee mais le vehicule n\'est plus disponible. Remboursement a preparer manuellement.',0,'2026-08-06 13:07:10.343222',NULL,'Reservation',2,1),(19,'PAYMENT_SUCCEEDED','Paiement reussi','Le paiement de votre reservation AR-2026-20P5CWWV a ete valide.',0,'2026-08-06 13:20:34.927207',NULL,'payment',3,8),(20,'RESERVATION_CONFIRMED','Reservation confirmee','Votre reservation AR-2026-20P5CWWV est confirmee.',0,'2026-08-06 13:20:34.935692',NULL,'reservation',2,8),(21,'INVOICE_AVAILABLE','Facture disponible','La facture de votre reservation AR-2026-20P5CWWV est disponible.',0,'2026-08-06 13:20:34.941049',NULL,'invoice',2,8),(22,'DEPARTURE_INSPECTION_COMPLETED','Inspection de depart terminee','L\'inspection de depart pour la reservation AR-2026-20P5CWWV est terminee.',1,'2026-08-06 14:38:06.323101','2026-08-11 08:45:02.804001','Inspection',1,8),(23,'RETURN_INSPECTION_COMPLETED','Inspection de retour terminee','L\'inspection de retour pour la reservation AR-2026-20P5CWWV est terminee.',1,'2026-08-06 14:47:39.509424','2026-08-11 08:44:56.909249','Inspection',2,8),(24,'VEHICLE_REQUIRES_REVIEW','Vehicule a controler','Le vehicule 1-TEST-002 necessite un controle apres retour.',0,'2026-08-06 14:47:39.521908',NULL,'Inspection',2,4),(25,'INTERVENTION_ASSIGNED','Intervention attribuee','Une intervention INT-2026-1S70Y7CR vous a ete attribuee.',0,'2026-08-07 08:06:28.932062',NULL,'Intervention',1,5),(26,'INTERVENTION_ASSIGNED','Intervention attribuee','Une intervention INT-2026-DAGPX8XP vous a ete attribuee.',0,'2026-08-07 09:09:34.790606',NULL,'Intervention',2,6),(27,'ACCOUNT_CREATED','Compte cree','Votre compte AutoRental a ete cree. Confirmez maintenant votre adresse e-mail.',0,'2026-08-08 21:13:56.001411',NULL,'user',12,12),(28,'DOCUMENT_UPLOADED','Document transmis','Votre document Carte d\'identite a ete transmis et est en attente de validation.',1,'2026-08-09 17:19:33.309991','2026-08-09 21:38:58.785911','document',6,2),(29,'DOCUMENT_UPLOADED','Document transmis','Votre document Permis de conduire a ete transmis et est en attente de validation.',1,'2026-08-09 17:19:55.148784','2026-08-09 21:38:57.361611','document',7,2),(30,'INTERVENTION_ASSIGNED','Intervention attribuee','Une intervention INT-2026-SW1LQ7BT vous a ete attribuee.',0,'2026-08-11 11:10:49.096089',NULL,'Intervention',5,5),(31,'INTERVENTION_ASSIGNED','Intervention attribuee','Une intervention INT-2026-P6I7Y6BS vous a ete attribuee.',0,'2026-08-11 11:11:37.078778',NULL,'Intervention',6,6),(32,'INTERVENTION_ASSIGNED','Intervention attribuee','Une intervention INT-2026-BI1J76WN vous a ete attribuee.',0,'2026-08-11 11:18:37.034915',NULL,'Intervention',8,5),(33,'INTERVENTION_ASSIGNED','Intervention attribuee','Une intervention INT-2026-N9TS1GR4 vous a ete attribuee.',0,'2026-08-11 11:20:47.590013',NULL,'Intervention',9,6),(34,'INTERVENTION_ASSIGNED','Intervention attribuee','Une intervention INT-2026-XFRSJZON vous a ete attribuee.',0,'2026-08-11 11:23:50.578019',NULL,'Intervention',10,6),(35,'INTERVENTION_ASSIGNED','Intervention attribuee','Une intervention INT-2026-W8GC3W7O vous a ete attribuee.',0,'2026-08-11 11:33:52.553903',NULL,'Intervention',11,5),(36,'INTERVENTION_ASSIGNED','Intervention attribuee','Une intervention INT-2026-0FES2SWF vous a ete attribuee.',0,'2026-08-11 11:33:52.607406',NULL,'Intervention',12,6),(37,'DOCUMENT_VALIDATED','Document valide','Votre document Permis de conduire a ete valide.',0,'2026-08-11 11:52:14.866245',NULL,'document',7,2);
/*!40000 ALTER TABLE `notifications_notification` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `payments_deposit`
--

DROP TABLE IF EXISTS `payments_deposit`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `payments_deposit` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `mode` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `currency` varchar(3) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `stripe_payment_intent_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `authorization_expires_at` datetime(6) DEFAULT NULL,
  `authorized_at` datetime(6) DEFAULT NULL,
  `captured_at` datetime(6) DEFAULT NULL,
  `released_at` datetime(6) DEFAULT NULL,
  `failed_at` datetime(6) DEFAULT NULL,
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  `reservation_id` bigint NOT NULL,
  PRIMARY KEY (`id`),
  KEY `payments_deposit_status_db5da9f5` (`status`),
  KEY `dep_reservation_idx` (`reservation_id`),
  KEY `dep_status_idx` (`status`),
  KEY `dep_pi_idx` (`stripe_payment_intent_id`),
  CONSTRAINT `payments_deposit_reservation_id_cff8049c_fk_reservati` FOREIGN KEY (`reservation_id`) REFERENCES `reservations_reservation` (`id`),
  CONSTRAINT `dep_amount_gte_0` CHECK ((`amount` >= 0)),
  CONSTRAINT `dep_currency_upper` CHECK ((`currency` = upper(`currency`)))
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `payments_deposit`
--

LOCK TABLES `payments_deposit` WRITE;
/*!40000 ALTER TABLE `payments_deposit` DISABLE KEYS */;
INSERT INTO `payments_deposit` VALUES (1,'SIMULATED',300.00,'EUR','AUTORISEE',NULL,NULL,'2026-08-05 16:24:40.053904',NULL,NULL,NULL,'2026-08-05 16:24:40.044833','2026-08-05 16:24:40.054164',2),(2,'SIMULATED',0.00,'EUR','AUTORISEE',NULL,NULL,'2026-08-07 07:36:31.871870',NULL,NULL,NULL,'2026-08-07 07:36:32.172237','2026-08-07 07:36:32.172248',3);
/*!40000 ALTER TABLE `payments_deposit` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `payments_payment`
--

DROP TABLE IF EXISTS `payments_payment`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `payments_payment` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `provider` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `currency` varchar(3) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `stripe_payment_intent_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `failure_code` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `failure_message` longtext COLLATE utf8mb4_unicode_ci,
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  `succeeded_at` datetime(6) DEFAULT NULL,
  `failed_at` datetime(6) DEFAULT NULL,
  `cancelled_at` datetime(6) DEFAULT NULL,
  `reservation_id` bigint NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `stripe_payment_intent_id` (`stripe_payment_intent_id`),
  KEY `pay_reservation_idx` (`reservation_id`),
  KEY `pay_status_idx` (`status`),
  KEY `pay_pi_idx` (`stripe_payment_intent_id`),
  KEY `payments_payment_status_fc8cbda2` (`status`),
  CONSTRAINT `payments_payment_reservation_id_bf2a3267_fk_reservati` FOREIGN KEY (`reservation_id`) REFERENCES `reservations_reservation` (`id`),
  CONSTRAINT `pay_amount_gte_0` CHECK ((`amount` >= 0)),
  CONSTRAINT `pay_currency_upper` CHECK ((`currency` = upper(`currency`)))
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `payments_payment`
--

LOCK TABLES `payments_payment` WRITE;
/*!40000 ALTER TABLE `payments_payment` DISABLE KEYS */;
INSERT INTO `payments_payment` VALUES (3,'STRIPE',200.00,'EUR','REUSSI','pi_3U1BIPEFUqNLOdAL080PkwBz',NULL,NULL,'2026-08-05 20:20:11.640005','2026-08-06 13:20:34.791798','2026-08-06 13:20:34.791628',NULL,NULL,2),(4,'STRIPE',0.00,'EUR','REUSSI',NULL,NULL,NULL,'2026-08-07 07:36:32.154729','2026-08-07 07:36:32.154769','2026-08-07 07:36:31.871870',NULL,NULL,3);
/*!40000 ALTER TABLE `payments_payment` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `payments_refund`
--

DROP TABLE IF EXISTS `payments_refund`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `payments_refund` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `amount` decimal(10,2) NOT NULL,
  `currency` varchar(3) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `stripe_refund_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reason` longtext COLLATE utf8mb4_unicode_ci,
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  `succeeded_at` datetime(6) DEFAULT NULL,
  `failed_at` datetime(6) DEFAULT NULL,
  `payment_id` bigint NOT NULL,
  `requested_by_id` bigint DEFAULT NULL,
  `reservation_id` bigint DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `stripe_refund_id` (`stripe_refund_id`),
  KEY `ref_payment_idx` (`payment_id`),
  KEY `ref_reservation_idx` (`reservation_id`),
  KEY `ref_status_idx` (`status`),
  KEY `ref_stripe_id_idx` (`stripe_refund_id`),
  KEY `payments_refund_requested_by_id_bc87fa8f_fk_accounts_user_id` (`requested_by_id`),
  KEY `payments_refund_status_0e47ccad` (`status`),
  CONSTRAINT `payments_refund_payment_id_a70693f7_fk_payments_payment_id` FOREIGN KEY (`payment_id`) REFERENCES `payments_payment` (`id`),
  CONSTRAINT `payments_refund_requested_by_id_bc87fa8f_fk_accounts_user_id` FOREIGN KEY (`requested_by_id`) REFERENCES `accounts_user` (`id`),
  CONSTRAINT `payments_refund_reservation_id_5dc7375f_fk_reservati` FOREIGN KEY (`reservation_id`) REFERENCES `reservations_reservation` (`id`),
  CONSTRAINT `ref_amount_gte_0` CHECK ((`amount` >= 0)),
  CONSTRAINT `ref_currency_upper` CHECK ((`currency` = upper(`currency`)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `payments_refund`
--

LOCK TABLES `payments_refund` WRITE;
/*!40000 ALTER TABLE `payments_refund` DISABLE KEYS */;
/*!40000 ALTER TABLE `payments_refund` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `payments_stripeevent`
--

DROP TABLE IF EXISTS `payments_stripeevent`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `payments_stripeevent` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `stripe_event_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `event_type` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `api_version` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `payload` json NOT NULL,
  `processed` tinyint(1) NOT NULL,
  `processed_at` datetime(6) DEFAULT NULL,
  `processing_error` longtext COLLATE utf8mb4_unicode_ci,
  `created_at` datetime(6) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `stripe_event_id` (`stripe_event_id`),
  KEY `payments_stripeevent_event_type_1535b8cc` (`event_type`),
  KEY `payments_stripeevent_processed_981c4082` (`processed`),
  KEY `payments_stripeevent_created_at_181949a7` (`created_at`),
  KEY `se_event_id_idx` (`stripe_event_id`),
  KEY `se_type_idx` (`event_type`),
  KEY `se_processed_idx` (`processed`),
  KEY `se_created_idx` (`created_at`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `payments_stripeevent`
--

LOCK TABLES `payments_stripeevent` WRITE;
/*!40000 ALTER TABLE `payments_stripeevent` DISABLE KEYS */;
INSERT INTO `payments_stripeevent` VALUES (1,'evt_local_repro_direct','payment_intent.succeeded','2026-07-29.dahlia','{\"id\": \"evt_local_repro_direct\", \"data\": {\"object\": {\"id\": \"pi_3U1BIPEFUqNLOdAL080PkwBz\", \"amount\": 20000, \"object\": \"payment_intent\", \"currency\": \"eur\", \"metadata\": {\"payment_id\": \"3\", \"reservation_id\": \"2\"}, \"amount_received\": 20000}}, \"type\": \"payment_intent.succeeded\", \"api_version\": \"2026-07-29.dahlia\"}',1,'2026-08-06 12:33:43.317797',NULL,'2026-08-06 12:33:42.997472'),(4,'evt_3U1BIPEFUqNLOdAL0DeXthM6','payment_intent.succeeded','2026-07-29.dahlia','{\"id\": \"evt_3U1BIPEFUqNLOdAL0DeXthM6\", \"data\": {\"object\": {\"id\": \"pi_3U1BIPEFUqNLOdAL080PkwBz\", \"amount\": 20000, \"object\": \"payment_intent\", \"review\": null, \"source\": null, \"status\": \"succeeded\", \"created\": 1785961213, \"currency\": \"eur\", \"customer\": null, \"livemode\": false, \"metadata\": {\"purpose\": \"rental_payment\", \"payment_id\": \"3\", \"reservation_id\": \"2\", \"reservation_reference\": \"AR-2026-20P5CWWV\"}, \"shipping\": null, \"processing\": null, \"application\": null, \"canceled_at\": null, \"description\": null, \"next_action\": null, \"on_behalf_of\": null, \"client_secret\": \"pi_3U1BIPEFUqNLOdAL080PkwBz_secret_tcQdOfuuHDKCuKNzvzP4wJWG6\", \"latest_charge\": \"ch_3U1BIPEFUqNLOdAL0RSjYmFV\", \"receipt_email\": null, \"transfer_data\": null, \"amount_details\": {\"tip\": {}}, \"capture_method\": \"automatic_async\", \"payment_method\": \"pm_1U1BTbEFUqNLOdALNduS3i3B\", \"transfer_group\": null, \"amount_received\": 20000, \"customer_account\": null, \"managed_payments\": {\"enabled\": false}, \"amount_capturable\": 0, \"last_payment_error\": null, \"setup_future_usage\": null, \"cancellation_reason\": null, \"confirmation_method\": \"automatic\", \"payment_method_types\": [\"card\", \"bancontact\", \"eps\", \"klarna\", \"link\", \"mb_way\", \"amazon_pay\", \"satispay\"], \"statement_descriptor\": null, \"application_fee_amount\": null, \"payment_method_options\": {\"eps\": {}, \"card\": {\"network\": null, \"installments\": null, \"mandate_options\": null, \"request_three_d_secure\": \"automatic\"}, \"link\": {\"persistent_token\": null}, \"klarna\": {\"preferred_locale\": null}, \"mb_way\": {}, \"satispay\": {}, \"amazon_pay\": {\"express_checkout_element_session_id\": null}, \"bancontact\": {\"preferred_language\": \"en\"}}, \"automatic_payment_methods\": {\"enabled\": true, \"allow_redirects\": \"always\"}, \"statement_descriptor_suffix\": null, \"allowed_payment_method_types\": null, \"shared_payment_granted_token\": null, \"excluded_payment_method_types\": null, \"payment_method_configuration_details\": {\"id\": \"pmc_1U17rHEFUqNLOdALEKLO2Ym8\", \"parent\": null}}}, \"type\": \"payment_intent.succeeded\", \"object\": \"event\", \"created\": 1785961908, \"request\": {\"id\": \"req_UbMWtlqQDYhmOn\", \"idempotency_key\": \"121692fd-bfd3-4d7b-958f-6a30f21fb3c6\"}, \"livemode\": false, \"api_version\": \"2026-07-29.dahlia\", \"pending_webhooks\": 2}',1,'2026-08-06 13:20:34.912955',NULL,'2026-08-06 13:20:34.731862');
/*!40000 ALTER TABLE `payments_stripeevent` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `reservations_reservation`
--

DROP TABLE IF EXISTS `reservations_reservation`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `reservations_reservation` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `reference` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL,
  `start_at` datetime(6) NOT NULL,
  `end_at` datetime(6) NOT NULL,
  `status` varchar(24) COLLATE utf8mb4_unicode_ci NOT NULL,
  `rental_amount` decimal(10,2) NOT NULL,
  `deposit_amount` decimal(10,2) NOT NULL,
  `confirmed_at` datetime(6) DEFAULT NULL,
  `cancelled_at` datetime(6) DEFAULT NULL,
  `cancellation_reason` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  `client_id` bigint NOT NULL,
  `vehicle_id` bigint NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `reference` (`reference`),
  KEY `reservation_client_status_idx` (`client_id`,`status`),
  KEY `reservation_vehicle_status_idx` (`vehicle_id`,`status`),
  KEY `reservation_period_idx` (`start_at`,`end_at`),
  KEY `reservation_created_at_idx` (`created_at`),
  CONSTRAINT `reservations_reserva_client_id_696a60bf_fk_accounts_` FOREIGN KEY (`client_id`) REFERENCES `accounts_clientprofile` (`id`),
  CONSTRAINT `reservations_reserva_vehicle_id_3a7745ab_fk_vehicles_` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles_vehicle` (`id`),
  CONSTRAINT `reservation_deposit_amount_non_negative` CHECK ((`deposit_amount` >= 0)),
  CONSTRAINT `reservation_end_after_start` CHECK ((`end_at` > `start_at`)),
  CONSTRAINT `reservation_rental_amount_non_negative` CHECK ((`rental_amount` >= 0))
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `reservations_reservation`
--

LOCK TABLES `reservations_reservation` WRITE;
/*!40000 ALTER TABLE `reservations_reservation` DISABLE KEYS */;
INSERT INTO `reservations_reservation` VALUES (1,'AR-2026-EXFZD2LJ','2026-08-10 08:00:00.000000','2026-08-12 08:00:00.000000','ANNULEE',200.00,300.00,NULL,'2026-08-05 15:48:53.771195','string','2026-08-05 15:45:30.872055','2026-08-05 15:48:53.802590',2,2),(2,'AR-2026-20P5CWWV','2026-08-06 14:17:54.731312','2026-08-08 14:17:54.731312','TERMINEE',200.00,300.00,'2026-08-06 13:20:34.791628',NULL,'','2026-08-05 16:23:44.337306','2026-08-07 10:45:53.654005',2,2),(3,'AR-2026-O6VVMOT6','2026-08-07 07:46:31.871870','2026-08-07 09:36:31.871870','CONFIRMEE',0.00,0.00,'2026-08-07 07:36:31.871870',NULL,'','2026-08-07 07:36:32.125582','2026-08-07 07:36:32.125587',2,2);
/*!40000 ALTER TABLE `reservations_reservation` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `token_blacklist_blacklistedtoken`
--

DROP TABLE IF EXISTS `token_blacklist_blacklistedtoken`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `token_blacklist_blacklistedtoken` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `blacklisted_at` datetime(6) NOT NULL,
  `token_id` bigint NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `token_id` (`token_id`),
  CONSTRAINT `token_blacklist_blacklistedtoken_token_id_3cc7fe56_fk` FOREIGN KEY (`token_id`) REFERENCES `token_blacklist_outstandingtoken` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `token_blacklist_blacklistedtoken`
--

LOCK TABLES `token_blacklist_blacklistedtoken` WRITE;
/*!40000 ALTER TABLE `token_blacklist_blacklistedtoken` DISABLE KEYS */;
INSERT INTO `token_blacklist_blacklistedtoken` VALUES (1,'2026-08-05 11:33:25.764731',7),(2,'2026-08-09 10:01:28.362626',60),(3,'2026-08-11 13:44:48.076846',68),(4,'2026-08-11 18:53:49.927364',69),(5,'2026-08-11 18:56:25.074947',67);
/*!40000 ALTER TABLE `token_blacklist_blacklistedtoken` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `token_blacklist_outstandingtoken`
--

DROP TABLE IF EXISTS `token_blacklist_outstandingtoken`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `token_blacklist_outstandingtoken` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `token` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `expires_at` datetime(6) NOT NULL,
  `user_id` bigint DEFAULT NULL,
  `jti` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `token_blacklist_outstandingtoken_jti_hex_d9bdf6f7_uniq` (`jti`),
  KEY `token_blacklist_outs_user_id_83bc629a_fk_accounts_` (`user_id`),
  CONSTRAINT `token_blacklist_outs_user_id_83bc629a_fk_accounts_` FOREIGN KEY (`user_id`) REFERENCES `accounts_user` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=73 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `token_blacklist_outstandingtoken`
--

LOCK TABLES `token_blacklist_outstandingtoken` WRITE;
/*!40000 ALTER TABLE `token_blacklist_outstandingtoken` DISABLE KEYS */;
INSERT INTO `token_blacklist_outstandingtoken` VALUES (1,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCIsImV4cCI6MTc4NTYzNTM1NCwiaWF0IjoxNzg1NTQ4OTU0LCJqdGkiOiJiZjhkNGFjOTc1ODY0ZjRjYjgzNTQ1MWQ5ZjVmOTc0YiIsInVzZXJfaWQiOiIyIn0.aJF6NIcA-roKRh6Ngr0i4OE5yA8mGGR0fiQGqEEYEvo','2026-08-01 01:49:14.877930','2026-08-02 01:49:14.000000',2,'bf8d4ac975864f4cb835451d9f5f974b'),(2,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCIsImV4cCI6MTc4NjAwNjAxMiwiaWF0IjoxNzg1OTE5NjEyLCJqdGkiOiJkM2I1NTUzMmY3OWY0ZGU1YWFhZDRkZjYzMmEwOTBkMCIsInVzZXJfaWQiOiI3In0.ge5RtzbvDhqhD9XmRxA5O2fg2aRU2mQUvc6Y_Z-p0lI','2026-08-05 08:46:52.211623','2026-08-06 08:46:52.000000',7,'d3b55532f79f4de5aaad4df632a090d0'),(3,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCIsImV4cCI6MTc4NjAwNjkwMiwiaWF0IjoxNzg1OTIwNTAyLCJqdGkiOiJhOWI1NDBiMTk1ZWM0NTI4YmMxODJiODZmMDhmMDI0OCIsInVzZXJfaWQiOiI3In0.g5GtUPg11IvIZ9BnV6UbmoUEUc5Qu9haDOgBwA6gCDw','2026-08-05 09:01:42.893703','2026-08-06 09:01:42.000000',7,'a9b540b195ec4528bc182b86f08f0248'),(4,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCIsImV4cCI6MTc4NjAxMjIzNiwiaWF0IjoxNzg1OTI1ODM2LCJqdGkiOiIzMWMzZGE2ZDhmZGM0MmVkYWEyOWRjMGIyY2M5NjAxNyIsInVzZXJfaWQiOiIxMSJ9.3md9v11MiLD3cy7V9DtZY5PiY-51cMZ4AjgOek7Cy7g','2026-08-05 10:30:36.965717','2026-08-06 10:30:36.000000',11,'31c3da6d8fdc42edaa29dc0b2cc96017'),(5,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCIsImV4cCI6MTc4NjAxMjM0NiwiaWF0IjoxNzg1OTI1OTQ2LCJqdGkiOiI3Y2RjNjZiYTk5OTM0NjMyOTQ5MGYwZjBkMWU1MTk0NiIsInVzZXJfaWQiOiI3In0.TGrIPxMnPOrCJhQu7cvywJ_LA5B_Qww7rz7XnuQuGO4','2026-08-05 10:32:26.605128','2026-08-06 10:32:26.000000',7,'7cdc66ba999346329490f0f0d1e51946'),(6,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCIsImV4cCI6MTc4NjAxMzI0OSwiaWF0IjoxNzg1OTI2ODQ5LCJqdGkiOiJlOTYzY2Q0ZTMxZGQ0ZmRlOTY0NGZkOGE0ODEwMDA1YyIsInVzZXJfaWQiOiI3In0.hZDSktedQGUQCv1uUpkkYkcf4a_TRo-XAuohkBRG724','2026-08-05 10:47:29.793485','2026-08-06 10:47:29.000000',7,'e963cd4e31dd4fde9644fd8a4810005c'),(7,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCIsImV4cCI6MTc4NjAxNTkyNywiaWF0IjoxNzg1OTI5NTI3LCJqdGkiOiI3OTY4YjE1OGEyZWI0NDYyOTg2YTI1NmI2MGJkN2RjMyIsInVzZXJfaWQiOiI3In0.KPniytyiRX9zPbuIMdtUGxZSu-oEttKdfEFgIdNU4zM','2026-08-05 11:32:07.415723','2026-08-06 11:32:07.000000',7,'7968b158a2eb4462986a256b60bd7dc3'),(8,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCIsImV4cCI6MTc4NjAxNjM4NiwiaWF0IjoxNzg1OTI5OTg2LCJqdGkiOiIyNDE1MDgwYzVmYzE0ZjA3YTFhNmQzMjhlNDQ5MDMyMiIsInVzZXJfaWQiOiI3In0.yBwcNfabB992it3IHs5fQPdLmrWAP9F5h3F9lwSHKmU','2026-08-05 11:39:46.744968','2026-08-06 11:39:46.000000',7,'2415080c5fc14f07a1a6d328e4490322'),(9,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCIsImV4cCI6MTc4NjAxNjYyNywiaWF0IjoxNzg1OTMwMjI3LCJqdGkiOiI4NTFkOTliYzNkYzk0ODNhOTljNGQ0ZGYyMmM0NzIzZCIsInVzZXJfaWQiOiI4In0.cEM6pEaGL9b2y_BhjOoEPN5agULv8ZksycKQgQq3AeY','2026-08-05 11:43:47.135411','2026-08-06 11:43:47.000000',8,'851d99bc3dc9483a99c4d4df22c4723d'),(10,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCIsImV4cCI6MTc4NjAxNzE0NiwiaWF0IjoxNzg1OTMwNzQ2LCJqdGkiOiI4NTBlOGVhZGEwYmY0NTY3YjBlYzI1ZjU3MjQzNDQxYyIsInVzZXJfaWQiOiI4In0.g9u-6w_H1n5uqCcBlYzQGCPZmTNnV78AhKivSjI89Zw','2026-08-05 11:52:26.263370','2026-08-06 11:52:26.000000',8,'850e8eada0bf4567b0ec25f57243441c'),(11,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCIsImV4cCI6MTc4NjAyMDkzNiwiaWF0IjoxNzg1OTM0NTM2LCJqdGkiOiIyNDA0Zjc3MDhmZDI0OGM0YTAzZjdhZDZkOGY5ZDUyZCIsInVzZXJfaWQiOiI4In0.VG8dhhzl-HroUaxMJkvALa36bleUOyZRV0pTRCx8C3s','2026-08-05 12:55:36.030570','2026-08-06 12:55:36.000000',8,'2404f7708fd248c4a03f7ad6d8f9d52d'),(12,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCIsImV4cCI6MTc4NjAyMTU3MiwiaWF0IjoxNzg1OTM1MTcyLCJqdGkiOiJiYzdkZDU5OWE3OWM0Y2ZmYWI4ZDg5MGFjNTNlOGMyNyIsInVzZXJfaWQiOiI4In0.T20kDkO7Ftl0K5AVyijELHEatb2LHGPE-u029ysdTsM','2026-08-05 13:06:12.203042','2026-08-06 13:06:12.000000',8,'bc7dd599a79c4cffab8d890ac53e8c27'),(13,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCIsImV4cCI6MTc4NjAyMTkzNCwiaWF0IjoxNzg1OTM1NTM0LCJqdGkiOiI3OWE1ZDdiM2Y1ZmU0OGNkYWJiMTdlM2Q2YjM3ZDU0NSIsInVzZXJfaWQiOiI0In0.OlcYzq-zZAjLS5ZDQL5XGtGYVomaYMofllkpUL5Gf88','2026-08-05 13:12:14.615944','2026-08-06 13:12:14.000000',4,'79a5d7b3f5fe48cdabb17e3d6b37d545'),(14,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCIsImV4cCI6MTc4NjAyMjI3OCwiaWF0IjoxNzg1OTM1ODc4LCJqdGkiOiI1YTM3NjZkZjA2ODE0NTRhOGRlN2RjM2FjMTViZmUzZCIsInVzZXJfaWQiOiI4In0.O8nSP-tnGw53b7nZPHBRlbMWcuHCvJ0hfgQY6pXNBPA','2026-08-05 13:17:58.494621','2026-08-06 13:17:58.000000',8,'5a3766df0681454a8de7dc3ac15bfe3d'),(15,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCIsImV4cCI6MTc4NjAyMzI0NSwiaWF0IjoxNzg1OTM2ODQ1LCJqdGkiOiI3ZmI5MDM3ZDJhNjk0YzVkYmNlMWJiMDA3Mjk0YWExZSIsInVzZXJfaWQiOiI4In0.tdDWE_eWsmiD-BlZfjLuaJX9fjek_Vj3fqx_iQcoGw8','2026-08-05 13:34:05.578013','2026-08-06 13:34:05.000000',8,'7fb9037d2a694c5dbce1bb007294aa1e'),(16,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCIsImV4cCI6MTc4NjAyOTQ3OCwiaWF0IjoxNzg1OTQzMDc4LCJqdGkiOiIzOTE2YjVmZjc0MjQ0YTJiOTcwZWYwNDY5YmZkNzI2OSIsInVzZXJfaWQiOiI0In0.uH5JXKN42FDsiFwzv3HrmGxY9fJCOZdGCuIRZ_k7P6o','2026-08-05 15:17:58.136008','2026-08-06 15:17:58.000000',4,'3916b5ff74244a2b970ef0469bfd7269'),(17,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCIsImV4cCI6MTc4NjAzMDA1OSwiaWF0IjoxNzg1OTQzNjU5LCJqdGkiOiIyZDI4MDhjMDNkYTY0M2MyODk3MmFjMzMxMzJhNjlkOSIsInVzZXJfaWQiOiI0In0.B3gGic6S8jdkftRPMPLeP7DZUl5YUjKQ1cVkbvpQ0pw','2026-08-05 15:27:39.322324','2026-08-06 15:27:39.000000',4,'2d2808c03da643c28972ac33132a69d9'),(18,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCIsImV4cCI6MTc4NjAzMDYyNCwiaWF0IjoxNzg1OTQ0MjI0LCJqdGkiOiI0OWZkYzM1ZDhlNmI0MDU1OTc3ODNkYzZkNTBkNmU3MSIsInVzZXJfaWQiOiI4In0.K-J_me5zVVuBAS-J_-ixNIPyKhitd_xdv6H3cRQK4Is','2026-08-05 15:37:04.957792','2026-08-06 15:37:04.000000',8,'49fdc35d8e6b405597783dc6d50d6e71'),(19,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCIsImV4cCI6MTc4NjAzMTExNCwiaWF0IjoxNzg1OTQ0NzE0LCJqdGkiOiJjYTM3YzgxODI2ZDE0NzNkYjIyZjJhYzAwYmZmYjdjOCIsInVzZXJfaWQiOiI4In0.ghqIpB8SmTWWCQCiKfg8m8Cqj1HZf7tCDCL1iwUN3Lo','2026-08-05 15:45:14.911483','2026-08-06 15:45:14.000000',8,'ca37c81826d1473db22f2ac00bffb7c8'),(20,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCIsImV4cCI6MTc4NjAzMTUwMCwiaWF0IjoxNzg1OTQ1MTAwLCJqdGkiOiJmNTM1ZmM3NDdkNTg0OTJmODQyNDYzY2QzZTM5MzRlMCIsInVzZXJfaWQiOiI4In0.uM_hp7G3HZIhO6MXLuYEGe8G44RteIfnbtBgpIeOR9M','2026-08-05 15:51:40.005763','2026-08-06 15:51:40.000000',8,'f535fc747d58492f842463cd3e3934e0'),(21,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCIsImV4cCI6MTc4NjAzMTUzMiwiaWF0IjoxNzg1OTQ1MTMyLCJqdGkiOiI5ZDU2ZDQyMDg1NTE0YzI2OThjYTE5ZjNjZGFjNzM3ZSIsInVzZXJfaWQiOiI4In0.CBnNmeybRTsIW1oLMrHA1vqntx4HK8cFJK8FjwCADgk','2026-08-05 15:52:12.687914','2026-08-06 15:52:12.000000',8,'9d56d42085514c2698ca19f3cdac737e'),(22,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCIsImV4cCI6MTc4NjAzMzI5NSwiaWF0IjoxNzg1OTQ2ODk1LCJqdGkiOiIzM2IxYWIwZWFhYWM0MWM5YmZiZjE2ZmE4MWViMzY3NSIsInVzZXJfaWQiOiI4In0.Q2GwWO9SlV-qpw6bxNRtcJlWr_ac5KXEtYcT-IEBw5g','2026-08-05 16:21:35.871997','2026-08-06 16:21:35.000000',8,'33b1ab0eaaac41c9bfbf16fa81eb3675'),(23,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCIsImV4cCI6MTc4NjAzNTcyMSwiaWF0IjoxNzg1OTQ5MzIxLCJqdGkiOiIzY2ExZTMzNTJkNzI0NWRiYThhMTc3Yjc5OGI3OGE3ZSIsInVzZXJfaWQiOiI4In0.Cg6QYM-ahu8O7P5PCM8qNSmKJM6B3TjkP_SZ0ppVtwE','2026-08-05 17:02:01.407729','2026-08-06 17:02:01.000000',8,'3ca1e3352d7245dba8a177b798b78a7e'),(24,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCIsImV4cCI6MTc4NjA0Njg4NSwiaWF0IjoxNzg1OTYwNDg1LCJqdGkiOiJhZTYxZDFmMDNjMGI0YWYxYTM0YjY2ZDM2MTVjNGNjMSIsInVzZXJfaWQiOiI4In0.CotmtQJcogbLhdhUTBJThATHRJz8tIXuMPVq1oLRtrU','2026-08-05 20:08:05.391410','2026-08-06 20:08:05.000000',8,'ae61d1f03c0b4af1a34b66d3615c4cc1'),(25,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCIsImV4cCI6MTc4NjA0NzI0MCwiaWF0IjoxNzg1OTYwODQwLCJqdGkiOiI1M2RlZDkwN2E5N2U0ZDY5OTI0NzIyMWYyNDc0MGM5MSIsInVzZXJfaWQiOiI4In0.Wq8L2pB2zYEXcPoIQelIT590wCvnAruyY_e9vZstLOk','2026-08-05 20:14:00.866361','2026-08-06 20:14:00.000000',8,'53ded907a97e4d699247221f24740c91'),(26,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCIsImV4cCI6MTc4NjA0NzU5NCwiaWF0IjoxNzg1OTYxMTk0LCJqdGkiOiIzMzM2NzljNGQ0Y2Y0NWVkYTZjNmZiYmE0ZjZiZGYyNiIsInVzZXJfaWQiOiI4In0.IooIvvLL0o3K8G91ap_FKPJE2zCZDfHiz9nYxK9Yf-k','2026-08-05 20:19:54.060795','2026-08-06 20:19:54.000000',8,'333679c4d4cf45eda6c6fbba4f6bdf26'),(27,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCIsImV4cCI6MTc4NjA0ODE1NywiaWF0IjoxNzg1OTYxNzU3LCJqdGkiOiIyN2M3NmExMmMwMzc0YWRkYjM1ODRiYWVmNjdhZmE0ZiIsInVzZXJfaWQiOiI4In0.CnyOduzlJeR_j1KqqANE0gcQDHbHpTlHbeRFsDHo7ts','2026-08-05 20:29:17.915098','2026-08-06 20:29:17.000000',8,'27c76a12c0374addb3584baef67afa4f'),(28,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCIsImV4cCI6MTc4NjEwNjEzMCwiaWF0IjoxNzg2MDE5NzMwLCJqdGkiOiI0YTQyNWFlZjQ4ZTA0YTRkOTA2YWYxMGYwZDc5MjU2MyIsInVzZXJfaWQiOiI4In0.ef1448NH5fHozsLcUgBBIN_Auad5FSz3W-f1coRkNTg','2026-08-06 12:35:30.354877','2026-08-07 12:35:30.000000',8,'4a425aef48e04a4d906af10f0d792563'),(29,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCIsImV4cCI6MTc4NjEwOTEzMSwiaWF0IjoxNzg2MDIyNzMxLCJqdGkiOiI0MTVmNmE4OGE0Zjg0NzNhYjQ2MmZiZTE0ODhkODc0ZSIsInVzZXJfaWQiOiI4In0.A_Ya7-41VDSJBVMiwGgEWWRREajIdt3_anXIY5JfnH0','2026-08-06 13:25:31.450517','2026-08-07 13:25:31.000000',8,'415f6a88a4f8473ab462fbe1488d874e'),(30,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCIsImV4cCI6MTc4NjExMDg5NSwiaWF0IjoxNzg2MDI0NDk1LCJqdGkiOiI1N2YyYWRjOTg2MWY0NGY1OWUzYjA4YjEwYTc5MTJjYyIsInVzZXJfaWQiOiI4In0.rZhxsGzVVvnYeaMyc_0n5LB7d6J8DgI5WUvh2e7Z_pQ','2026-08-06 13:54:55.171139','2026-08-07 13:54:55.000000',8,'57f2adc9861f44f59e3b08b10a7912cc'),(31,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCIsImV4cCI6MTc4NjExMTM2NCwiaWF0IjoxNzg2MDI0OTY0LCJqdGkiOiI5MDk2MGVlMTBhMmI0NTM0ODM2YjQ2YzY1MzRiYzViZCIsInVzZXJfaWQiOiI4In0.U8rGxrtw9zqh9SCcjIBFy2R6kTAReGCpWQFQ_OLXZ-E','2026-08-06 14:02:44.263858','2026-08-07 14:02:44.000000',8,'90960ee10a2b4534836b46c6534bc5bd'),(32,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCIsImV4cCI6MTc4NjExMTgyMiwiaWF0IjoxNzg2MDI1NDIyLCJqdGkiOiI1NjU1ODJlODAzNzY0NjhlODhhM2VjMDdiYWFjNjVmYSIsInVzZXJfaWQiOiI4In0.EpTLXopN9iVzmYQzOFc5Fa1ZD-oF8xv9Y9AB2XL8Z8Q','2026-08-06 14:10:22.581142','2026-08-07 14:10:22.000000',8,'565582e80376468e88a3ec07baac65fa'),(33,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCIsImV4cCI6MTc4NjExMjYwNCwiaWF0IjoxNzg2MDI2MjA0LCJqdGkiOiJlM2FiZmI2MWU5Yjk0YjEyYjM5YzkxOGNmOWRiNWM5NSIsInVzZXJfaWQiOiI4In0.NduUF72nAQjhAsOKhYNNFj2aghKEAIOANOWdLupyGdU','2026-08-06 14:23:24.193993','2026-08-07 14:23:24.000000',8,'e3abfb61e9b94b12b39c918cf9db5c95'),(34,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCIsImV4cCI6MTc4NjExMjkxNCwiaWF0IjoxNzg2MDI2NTE0LCJqdGkiOiJkNzllNDBmNTdlM2Y0Mzk4YjdmYzY5ZDRkYWIyYTJiNSIsInVzZXJfaWQiOiI4In0.OnwcyOe9wVY5jbIRV2BC4YtKc3uA73bWtdOg-p5lIHA','2026-08-06 14:28:34.606642','2026-08-07 14:28:34.000000',8,'d79e40f57e3f4398b7fc69d4dab2a2b5'),(35,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCIsImV4cCI6MTc4NjExMzMwNywiaWF0IjoxNzg2MDI2OTA3LCJqdGkiOiJhNjEzOGI2ZjQzZTc0NmYxODdmZjRjOGQ3OGY3NmIxMiIsInVzZXJfaWQiOiI4In0.dAC4LDGgnUDyzfjozN1OKlh-pT7f6RrUaHOhCcqbJgE','2026-08-06 14:35:07.714390','2026-08-07 14:35:07.000000',8,'a6138b6f43e746f187ff4c8d78f76b12'),(36,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCIsImV4cCI6MTc4NjExMzYzNiwiaWF0IjoxNzg2MDI3MjM2LCJqdGkiOiIwYzdlYTA1NTBhMGY0OTZhOGY5Njg1OGY2NjRjMjMxNCIsInVzZXJfaWQiOiI4In0.h3cGiE5MWsWMw-Oog1pa7UP2ECFerME7l-SNR6mMmhk','2026-08-06 14:40:36.199963','2026-08-07 14:40:36.000000',8,'0c7ea0550a0f496a8f96858f664c2314'),(37,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCIsImV4cCI6MTc4NjExMzg2OCwiaWF0IjoxNzg2MDI3NDY4LCJqdGkiOiJjMTk1Y2JmN2U2YjA0YjUyYmQ4NDU3ZGFkYTgyNDk0ZSIsInVzZXJfaWQiOiI4In0.7RoZeaEhmhkOnXnpX0LWxWZ1OWG9tyKrOGY5E_8Pyuw','2026-08-06 14:44:28.579497','2026-08-07 14:44:28.000000',8,'c195cbf7e6b04b52bd8457dada82494e'),(38,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCIsImV4cCI6MTc4NjE3NDY2MSwiaWF0IjoxNzg2MDg4MjYxLCJqdGkiOiI1ZGI3MmY2YjcwZjA0MTc5YTBjNDk3YTE5ZWM5ZTU3MyIsInVzZXJfaWQiOiI4In0.UIZJDR1874fle3Lbjw7bePsS4b_8gCGRKyjc7o6letY','2026-08-07 07:37:41.325267','2026-08-08 07:37:41.000000',8,'5db72f6b70f04179a0c497a19ec9e573'),(39,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCIsImV4cCI6MTc4NjE3NTM4MSwiaWF0IjoxNzg2MDg4OTgxLCJqdGkiOiIwYTdiNzRjOGZkYTY0OGRmYjY4ODgyMGQxMzk0ODRmZCIsInVzZXJfaWQiOiI4In0.bF33Sycfzw5U9IWhyIkh9CxjNbQgk1P4TlVGz141L9g','2026-08-07 07:49:41.001247','2026-08-08 07:49:41.000000',8,'0a7b74c8fda648dfb688820d139484fd'),(40,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCIsImV4cCI6MTc4NjE3NTc3OSwiaWF0IjoxNzg2MDg5Mzc5LCJqdGkiOiJkNDlmODFkZmY4MmM0YzExYTI4YTZmOWNlZTU4OWIxMyIsInVzZXJfaWQiOiI0In0.7B310gJTkydXdaVTn2cH5SHtHys6nRT6NE8IbuMjztA','2026-08-07 07:56:19.751494','2026-08-08 07:56:19.000000',4,'d49f81dff82c4c11a28a6f9cee589b13'),(41,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCIsImV4cCI6MTc4NjE3NjM1MSwiaWF0IjoxNzg2MDg5OTUxLCJqdGkiOiI0NzVlMmRiOGI5NjA0YTA2OGY0NThkODE1ZGNmNzY2YiIsInVzZXJfaWQiOiI0In0.ezbqHvp4tGBivz_QVNiYA4CUQFSxcQpewWIoHhBlMv8','2026-08-07 08:05:51.293232','2026-08-08 08:05:51.000000',4,'475e2db8b9604a068f458d815dcf766b'),(42,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCIsImV4cCI6MTc4NjE3NjQyNywiaWF0IjoxNzg2MDkwMDI3LCJqdGkiOiIwYzk1OGRhODc5ZTM0MzY2YWY2ZGViMjAwYjczMGRkYyIsInVzZXJfaWQiOiI1In0.KN7mXwSJZPpQGbxrdNBzpP95vnlffsAQgQGeyS79QuQ','2026-08-07 08:07:07.032142','2026-08-08 08:07:07.000000',5,'0c958da879e34366af6deb200b730ddc'),(43,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCIsImV4cCI6MTc4NjE3NjQzMSwiaWF0IjoxNzg2MDkwMDMxLCJqdGkiOiIzOWU3NzYzZDVhNWU0MDIxODRmNjcxN2UyOTVmMTZkMSIsInVzZXJfaWQiOiI1In0.wDxr_-Wd3bW3q_6Ir_gnCfPBkl0Fio8777wPpk-7zs4','2026-08-07 08:07:11.474332','2026-08-08 08:07:11.000000',5,'39e7763d5a5e402184f6717e295f16d1'),(44,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCIsImV4cCI6MTc4NjE3NjUwMywiaWF0IjoxNzg2MDkwMTAzLCJqdGkiOiI3OWRlOTQ2ZDA3YjA0NWE3YWE1NzQyNTJlNDJlYzU2YSIsInVzZXJfaWQiOiI1In0.M5fMHrjbj06yL80OFwcafOxdB3dofppsi3A-kqJeAAw','2026-08-07 08:08:23.151375','2026-08-08 08:08:23.000000',5,'79de946d07b045a7aa574252e42ec56a'),(45,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCIsImV4cCI6MTc4NjE3NzM3NiwiaWF0IjoxNzg2MDkwOTc2LCJqdGkiOiIwYzliZWY3ZDc3MWI0Y2Q5OGFkZmEzZDkzMGE2ZWQ5YyIsInVzZXJfaWQiOiI1In0.qPhaIyymOhYzwJ7YrlFWjU0HiNwnueWhgAkHHpbOz8Y','2026-08-07 08:22:56.901779','2026-08-08 08:22:56.000000',5,'0c9bef7d771b4cd98adfa3d930a6ed9c'),(46,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCIsImV4cCI6MTc4NjE3ODAzMywiaWF0IjoxNzg2MDkxNjMzLCJqdGkiOiJkOWRhYjc3MTZkOGY0OGU0ODAzZjIxZDZlZWQ5NDA5YSIsInVzZXJfaWQiOiI1In0.7WbrWsEl0_dliR5MIz-DbBrr7plcw1waIbRVpGz1PzU','2026-08-07 08:33:53.266198','2026-08-08 08:33:53.000000',5,'d9dab7716d8f48e4803f21d6eed9409a'),(47,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCIsImV4cCI6MTc4NjE3ODUxNiwiaWF0IjoxNzg2MDkyMTE2LCJqdGkiOiIxYTIyM2I0YWI3NjY0MDIyYWQxOTliMGE4MTI1ZjIxMSIsInVzZXJfaWQiOiI1In0.Msb5SKHOM7IXMC7inJCm4FVrNTabmnXHCllGubisIlw','2026-08-07 08:41:56.128822','2026-08-08 08:41:56.000000',5,'1a223b4ab7664022ad199b0a8125f211'),(48,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCIsImV4cCI6MTc4NjE3ODYzMCwiaWF0IjoxNzg2MDkyMjMwLCJqdGkiOiI0ODlmYTEyMDE2MTM0NTEwOWY0YTE5OGUzNTU3NGVmZSIsInVzZXJfaWQiOiI1In0.vXc0E-95pCJX4i1HgmhnB88TeA5DT9xvJQyBNv-825E','2026-08-07 08:43:50.607422','2026-08-08 08:43:50.000000',5,'489fa120161345109f4a198e35574efe'),(49,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCIsImV4cCI6MTc4NjE3OTY5MSwiaWF0IjoxNzg2MDkzMjkxLCJqdGkiOiJmZTZmNTRjYzY2OWY0YmMyYTcxY2NiY2RhYTMzOWEyYyIsInVzZXJfaWQiOiI1In0.W3Tgo_NEB9Q4NYZqvVtpYY7qVUu2LlceJ9L3FoN1u5I','2026-08-07 09:01:31.320082','2026-08-08 09:01:31.000000',5,'fe6f54cc669f4bc2a71ccbcdaa339a2c'),(50,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCIsImV4cCI6MTc4NjE4MDA1MiwiaWF0IjoxNzg2MDkzNjUyLCJqdGkiOiI1NmY5MmVjODFmZDg0YTk1YWIwYTZlNTg1MjBkNmI1NCIsInVzZXJfaWQiOiI0In0.yju8kM2NXBpU7wyab3CK0WQbcRMnf3Tm1kWFysifFIc','2026-08-07 09:07:32.981732','2026-08-08 09:07:32.000000',4,'56f92ec81fd84a95ab0a6e58520d6b54'),(51,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCIsImV4cCI6MTc4NjE4MDIzMiwiaWF0IjoxNzg2MDkzODMyLCJqdGkiOiIwNmVmM2IzODE1NWE0YzFiYTZkNDgwZmNhYzRkNDY4YSIsInVzZXJfaWQiOiI2In0.0psImTCxUruclesUv2ytg20blX1e2A7m_Rxu2ykElaY','2026-08-07 09:10:32.938813','2026-08-08 09:10:32.000000',6,'06ef3b38155a4c1ba6d480fcac4d468a'),(52,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCIsImV4cCI6MTc4NjE4MjQ4NCwiaWF0IjoxNzg2MDk2MDg0LCJqdGkiOiJiOGM4ZTEzODhlYzE0OTQ2YjkxNTU0YTE0YWVkNTJhOCIsInVzZXJfaWQiOiI2In0.pLvzETTXE7rK4zJc2d__VY0LIwl80G2ZBQA5ZEHJ3lU','2026-08-07 09:48:04.090076','2026-08-08 09:48:04.000000',6,'b8c8e1388ec14946b91554a14aed52a8'),(53,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCIsImV4cCI6MTc4NjE4Mjg2MSwiaWF0IjoxNzg2MDk2NDYxLCJqdGkiOiIwMmRjZDhjMWRkMDQ0MDUyOTA4NGEzZWEwNWRlZTY3NiIsInVzZXJfaWQiOiI2In0.yhWpUTu5yDaV0oUvvuxzjasrb1F7M0fIJumZQm640o4','2026-08-07 09:54:21.072653','2026-08-08 09:54:21.000000',6,'02dcd8c1dd0440529084a3ea05dee676'),(54,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCIsImV4cCI6MTc4NjE4MzA3NCwiaWF0IjoxNzg2MDk2Njc0LCJqdGkiOiJjZmYxY2Y1Y2QwOGY0ZTU5YmUyNjljZDZkOTI0NWQ4MiIsInVzZXJfaWQiOiI0In0.eK8u-j6yHSgd_8ka1D6Gl6tipzX6LZhRfS-trcyFlH4','2026-08-07 09:57:54.335258','2026-08-08 09:57:54.000000',4,'cff1cf5cd08f4e59be269cd6d9245d82'),(55,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCIsImV4cCI6MTc4NjE4NTgwNiwiaWF0IjoxNzg2MDk5NDA2LCJqdGkiOiJmNGQwOGJlYjAxNmQ0MmQ1OWM2ODQ3ZWJlMmJhZDhmZiIsInVzZXJfaWQiOiI0In0.C_fDc3kSklq2j3oGflvKzMusQCluAD3bt8RU3ejEJcY','2026-08-07 10:43:26.607802','2026-08-08 10:43:26.000000',4,'f4d08beb016d42d59c6847ebe2bad8ff'),(56,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCIsImV4cCI6MTc4NjE4NTkyMSwiaWF0IjoxNzg2MDk5NTIxLCJqdGkiOiI5YmQ2ZWY1NDg3YjA0OTgxYWY5NTMzOGMyNTFlN2ZiYiIsInVzZXJfaWQiOiI0In0.UtgVd6ZqXSrNLX2ad9htX0wAxfu_J6KtphytIGcAplY','2026-08-07 10:45:21.909003','2026-08-08 10:45:21.000000',4,'9bd6ef5487b04981af95338c251e7fbb'),(57,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCIsImV4cCI6MTc4NjI5MzkxMCwiaWF0IjoxNzg2MjA3NTEwLCJqdGkiOiI2ZTUzZTQ4YmM5NjE0ZjBiOGI4MzdkOWY2YzIwNDQyMiIsInVzZXJfaWQiOiI0In0.sIdedTfB11iH4y0qvfpKPZtzHbEjgt5Rgg30JE4x3LM','2026-08-08 16:45:10.576229','2026-08-09 16:45:10.000000',4,'6e53e48bc9614f0b8b837d9f6c204422'),(58,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCIsImV4cCI6MTc4NjI5NDAxNiwiaWF0IjoxNzg2MjA3NjE2LCJqdGkiOiJhMjI0ODU4MzIxOTU0MzExYjZhODc0OWEzMjdiNzE4MSIsInVzZXJfaWQiOiI0In0.b4dSuH6NpkZRuWQvJHbBwX1cDCs6BvtIFYdA8WMvNbo','2026-08-08 16:46:56.530478','2026-08-09 16:46:56.000000',4,'a224858321954311b6a8749a327b7181'),(59,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCIsImV4cCI6MTc4NjM1MjA1NywiaWF0IjoxNzg2MjY1NjU3LCJqdGkiOiJjZDQyNDBjZmIxMWM0NmUzOWZmMzNlZDkxMGUxNTBiNSIsInVzZXJfaWQiOiIyIn0.9pibVrOth6eCkXIDMV5nX77_XF8TIrxMq91xeMWu3K4','2026-08-09 08:54:17.659964','2026-08-10 08:54:17.000000',2,'cd4240cfb11c46e39ff33ed910e150b5'),(60,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCIsImV4cCI6MTc4NjM1MzA4NSwiaWF0IjoxNzg2MjY2Njg1LCJqdGkiOiIzNjBjMjE0MmYwNmI0NzI1ODgzOWU0Nzg4ZmZkYzcxYSIsInVzZXJfaWQiOiIyIn0.ulpAiq2CWlBTGvrgQGMFDBEXZENMUBqdcs13FJJjzc4','2026-08-09 09:11:25.961264','2026-08-10 09:11:25.000000',2,'360c2142f06b47258839e4788ffdc71a'),(61,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCIsImV4cCI6MTc4NjM1NjE0MSwiaWF0IjoxNzg2MjY5NzQxLCJqdGkiOiI1M2YwMmFjNGFhODM0ZmRkODA5M2Y2NmJkMWViNTczOSIsInVzZXJfaWQiOiI1In0.7fOFkeoq9YjlJp_mML-RctsMopwvG0ElWh80GPr8a2Q','2026-08-09 10:02:21.446292','2026-08-10 10:02:21.000000',5,'53f02ac4aa834fdd8093f66bd1eb5739'),(62,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCIsImV4cCI6MTc4NjM1NjczNCwiaWF0IjoxNzg2MjcwMzM0LCJqdGkiOiIzZjY5MWM1NmE5YjI0NmVlYjA4ZWI1NGI3OWQxMTRmNCIsInVzZXJfaWQiOiI2In0.RJnBBLZ5VT6qzXdgFozktqPGDK4ejfBGHt7XwjQURf4','2026-08-09 10:12:14.835792','2026-08-10 10:12:14.000000',6,'3f691c56a9b246eeb08eb54b79d114f4'),(63,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCIsImV4cCI6MTc4NjM1NzAyMiwiaWF0IjoxNzg2MjcwNjIyLCJqdGkiOiJhMjY3MDAxYWI0ZjE0YmRlOTJlYmE0YjcyMzJjNzlkYyIsInVzZXJfaWQiOiIyIn0.H6bDDxO_ET9fkfFWMEuD381tFubzHQF4BxKFzlFr62g','2026-08-09 10:17:02.531518','2026-08-10 10:17:02.000000',2,'a267001ab4f14bde92eba4b7232c79dc'),(64,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCIsImV4cCI6MTc4NjQ1NTM1MCwiaWF0IjoxNzg2MzY4OTUwLCJqdGkiOiJjOWEwZjIyOGQ2MWM0YzFiOGRmMGUwYTE4MDljYTZjMiIsInVzZXJfaWQiOiI0In0.xOCrSTawEHWnEHaocb4kxtli0CGjPH1ZilNycZZhh_E','2026-08-10 13:35:50.567111','2026-08-11 13:35:50.000000',4,'c9a0f228d61c4c1b8df0e0a1809ca6c2'),(65,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCIsImV4cCI6MTc4NjQ1NTU2NSwiaWF0IjoxNzg2MzY5MTY1LCJqdGkiOiIwZDFiZTVkY2QzMmU0OGM2OWI4Nzk4NGMzNzk2ZjNjMCIsInVzZXJfaWQiOiI4In0.j1zlEx5qYyNIUGs315kl3aLd-bYSdIwhfCWC_CcYoxc','2026-08-10 13:39:25.864632','2026-08-11 13:39:25.000000',8,'0d1be5dcd32e48c69b87984c3796f3c0'),(66,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCIsImV4cCI6MTc4NjUzNTU3MiwiaWF0IjoxNzg2NDQ5MTcyLCJqdGkiOiIzNzhjM2YxOTc0NjM0YzEwYTg3ZmYxMDM1MGYyZWU3NSIsInVzZXJfaWQiOiIyIn0.2fXfFnOFLkPj40BfNlNKTLYeLGgb-m7BVbHZ67upwjQ','2026-08-11 11:52:52.430962','2026-08-12 11:52:52.000000',2,'378c3f1974634c10a87ff10350f2ee75'),(67,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCIsImV4cCI6MTc4NjUzNTg1MCwiaWF0IjoxNzg2NDQ5NDUwLCJqdGkiOiJiYzEzNzE0OTgyODg0ZDcyYjJjNGMyZDYxYWRlMzI1OCIsInVzZXJfaWQiOiI1In0.J6r4dFwOe0t9WpgQGRdCMMBuAekSBFI_mOV60silZLA','2026-08-11 11:57:30.801886','2026-08-12 11:57:30.000000',5,'bc13714982884d72b2c4c2d61ade3258'),(68,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCIsImV4cCI6MTc4NjU0MDMwMCwiaWF0IjoxNzg2NDUzOTAwLCJqdGkiOiIxOWM0ZjZjMjUyMzQ0Mjc3YThhYThiNTNjMDc0ZjZhZiIsInVzZXJfaWQiOiI2In0.jjD2Tl_L4rvDkHQy_F-6lx81--AdEB6-vhpTZNWGbgA','2026-08-11 13:11:40.274874','2026-08-12 13:11:40.000000',6,'19c4f6c252344277a8aa8b53c074f6af'),(69,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCIsImV4cCI6MTc4NjU0MjM2MywiaWF0IjoxNzg2NDU1OTYzLCJqdGkiOiI1OGFhMTE5Yjc5N2Q0OWZhYWUyYmRlZmVmOWM0MDkxNCIsInVzZXJfaWQiOiIxIn0.OuYQaX24Tq3oXLXABAC5ISTgz_lh9j0Sfo6EEvGVNSo','2026-08-11 13:46:03.088548','2026-08-12 13:46:03.000000',1,'58aa119b797d49faae2bdefef9c40914'),(70,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCIsImV4cCI6MTc4NjU0NDA0NSwiaWF0IjoxNzg2NDU3NjQ1LCJqdGkiOiI2ZWQ2NGEwN2M5MmM0NjMwODFjYTRmNmU5MTFlMTdlOSIsInVzZXJfaWQiOiI0In0.Bqbr9kz28hg3Lw3_vsGhgG0RvQp7jPAOZTca2M9Lquo','2026-08-11 14:14:05.987663','2026-08-12 14:14:05.000000',4,'6ed64a07c92c463081ca4f6e911e17e9'),(71,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCIsImV4cCI6MTc4NjU2MDg3MSwiaWF0IjoxNzg2NDc0NDcxLCJqdGkiOiI5M2FhY2ExYTA5MTk0YTQ3OGJiNzA1YTMwNmYzYmYwNCIsInVzZXJfaWQiOiIxIn0.IIjyg0KBBmhgvUb7q1Sgo7f7VUk8xwwzlUbh2UQumNI','2026-08-11 18:54:31.138101','2026-08-12 18:54:31.000000',1,'93aaca1a09194a478bb705a306f3bf04'),(72,'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCIsImV4cCI6MTc4NjU2MTAwNCwiaWF0IjoxNzg2NDc0NjA0LCJqdGkiOiIwZDc1ZjIyNTY0ZmQ0OTExOWI2Mjk5YzU3MTcwNTcxYyIsInVzZXJfaWQiOiI1In0.FcNb9_cJdA_lJYzbDf8aZnR2j4sxd-jhye7ttabVEfk','2026-08-11 18:56:44.794934','2026-08-12 18:56:44.000000',5,'0d75f22564fd49119b6299c57170571c');
/*!40000 ALTER TABLE `token_blacklist_outstandingtoken` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `vehicles_brand`
--

DROP TABLE IF EXISTS `vehicles_brand`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `vehicles_brand` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `name` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_active` tinyint(1) NOT NULL,
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`),
  KEY `vehicle_brand_name_idx` (`name`),
  KEY `vehicle_brand_active_idx` (`is_active`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `vehicles_brand`
--

LOCK TABLES `vehicles_brand` WRITE;
/*!40000 ALTER TABLE `vehicles_brand` DISABLE KEYS */;
INSERT INTO `vehicles_brand` VALUES (1,'Probe Brand',1,'2026-08-03 15:13:44.029992','2026-08-03 15:13:44.030010');
/*!40000 ALTER TABLE `vehicles_brand` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `vehicles_parking`
--

DROP TABLE IF EXISTS `vehicles_parking`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `vehicles_parking` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `name` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `address` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `latitude` decimal(9,6) DEFAULT NULL,
  `longitude` decimal(9,6) DEFAULT NULL,
  `capacity` int unsigned NOT NULL,
  `is_active` tinyint(1) NOT NULL,
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`),
  KEY `parking_name_idx` (`name`),
  KEY `parking_active_idx` (`is_active`),
  CONSTRAINT `parking_capacity_positive` CHECK ((`capacity` > 0)),
  CONSTRAINT `parking_latitude_range` CHECK (((`latitude` is null) or ((`latitude` >= -(90)) and (`latitude` <= 90)))),
  CONSTRAINT `parking_longitude_range` CHECK (((`longitude` is null) or ((`longitude` >= -(180)) and (`longitude` <= 180)))),
  CONSTRAINT `vehicles_parking_chk_1` CHECK ((`capacity` >= 0))
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `vehicles_parking`
--

LOCK TABLES `vehicles_parking` WRITE;
/*!40000 ALTER TABLE `vehicles_parking` DISABLE KEYS */;
INSERT INTO `vehicles_parking` VALUES (1,'Probe Park','a',50.000000,4.000000,10,1,'2026-08-03 15:13:44.089231','2026-08-03 15:13:44.089252');
/*!40000 ALTER TABLE `vehicles_parking` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `vehicles_parkingspace`
--

DROP TABLE IF EXISTS `vehicles_parkingspace`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `vehicles_parkingspace` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `number` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_active` tinyint(1) NOT NULL,
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  `parking_id` bigint NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `parking_space_unique_number` (`parking_id`,`number`),
  KEY `parking_space_parking_idx` (`parking_id`),
  KEY `parking_space_number_idx` (`number`),
  KEY `parking_space_active_idx` (`is_active`),
  KEY `parking_space_pk_num_idx` (`parking_id`,`number`),
  CONSTRAINT `vehicles_parkingspace_parking_id_531726d0_fk_vehicles_parking_id` FOREIGN KEY (`parking_id`) REFERENCES `vehicles_parking` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `vehicles_parkingspace`
--

LOCK TABLES `vehicles_parkingspace` WRITE;
/*!40000 ALTER TABLE `vehicles_parkingspace` DISABLE KEYS */;
INSERT INTO `vehicles_parkingspace` VALUES (1,'P1',1,'2026-08-03 15:13:44.101859','2026-08-03 15:13:44.101875',1),(2,'P2',1,'2026-08-05 15:29:04.607044','2026-08-05 15:29:04.607087',1),(3,'P3',1,'2026-08-11 09:22:34.796110','2026-08-11 09:22:34.796128',1),(4,'P4',1,'2026-08-11 09:22:34.807854','2026-08-11 09:22:34.807868',1),(5,'P5',1,'2026-08-11 09:22:34.815226','2026-08-11 09:22:34.815239',1);
/*!40000 ALTER TABLE `vehicles_parkingspace` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `vehicles_vehicle`
--

DROP TABLE IF EXISTS `vehicles_vehicle`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `vehicles_vehicle` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `registration_number` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `model_name` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `year` int unsigned NOT NULL,
  `color` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `energy_type` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `transmission` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `seats` int unsigned NOT NULL,
  `doors` int unsigned NOT NULL,
  `mileage` int unsigned NOT NULL,
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_active` tinyint(1) NOT NULL,
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  `brand_id` bigint NOT NULL,
  `category_id` bigint NOT NULL,
  `parking_space_id` bigint NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `registration_number` (`registration_number`),
  UNIQUE KEY `parking_space_id` (`parking_space_id`),
  KEY `vehicle_status_idx` (`status`),
  KEY `vehicle_category_idx` (`category_id`),
  KEY `vehicle_brand_idx` (`brand_id`),
  KEY `vehicle_active_idx` (`is_active`),
  CONSTRAINT `vehicles_vehicle_brand_id_4d8d6d5d_fk_vehicles_brand_id` FOREIGN KEY (`brand_id`) REFERENCES `vehicles_brand` (`id`),
  CONSTRAINT `vehicles_vehicle_category_id_27ac5ae1_fk_vehicles_` FOREIGN KEY (`category_id`) REFERENCES `vehicles_vehiclecategory` (`id`),
  CONSTRAINT `vehicles_vehicle_parking_space_id_64ffbcd1_fk_vehicles_` FOREIGN KEY (`parking_space_id`) REFERENCES `vehicles_parkingspace` (`id`),
  CONSTRAINT `vehicle_doors_positive` CHECK ((`doors` > 0)),
  CONSTRAINT `vehicle_mileage_non_negative` CHECK ((`mileage` >= 0)),
  CONSTRAINT `vehicle_seats_positive` CHECK ((`seats` > 0)),
  CONSTRAINT `vehicles_vehicle_chk_1` CHECK ((`year` >= 0)),
  CONSTRAINT `vehicles_vehicle_chk_2` CHECK ((`seats` >= 0)),
  CONSTRAINT `vehicles_vehicle_chk_3` CHECK ((`doors` >= 0)),
  CONSTRAINT `vehicles_vehicle_chk_4` CHECK ((`mileage` >= 0))
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `vehicles_vehicle`
--

LOCK TABLES `vehicles_vehicle` WRITE;
/*!40000 ALTER TABLE `vehicles_vehicle` DISABLE KEYS */;
INSERT INTO `vehicles_vehicle` VALUES (1,'PROBE-001','Probe',2024,'Black','Hybrid','Auto',5,5,1,'LOUE','',1,'2026-08-03 15:13:44.127892','2026-08-03 15:13:44.148112',1,1,1),(2,'1-TEST-002','DemoCar',2025,'Bleu','Essence','Automatique',5,5,15120,'MAINTENANCE','Véhicule fictif créé pour les tests AutoRental.',1,'2026-08-05 15:30:12.808285','2026-08-11 11:28:11.572238',1,1,2),(3,'AAB-123-A','Probe',2024,'Black','Hybrid','Auto',5,5,15000,'DISPONIBLE','',1,'2026-08-11 09:23:09.190303','2026-08-11 09:23:09.190399',1,1,3),(4,'AAB-123-X','Probe',2024,'Black','Hybrid','Auto',5,5,15000,'DISPONIBLE','',1,'2026-08-11 09:26:33.076429','2026-08-11 09:35:35.001171',1,1,4);
/*!40000 ALTER TABLE `vehicles_vehicle` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `vehicles_vehiclecategory`
--

DROP TABLE IF EXISTS `vehicles_vehiclecategory`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `vehicles_vehiclecategory` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `name` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `daily_rate` decimal(10,2) NOT NULL,
  `hourly_rate` decimal(10,2) DEFAULT NULL,
  `minimum_deposit` decimal(10,2) NOT NULL,
  `minimum_rental_hours` int unsigned NOT NULL,
  `is_active` tinyint(1) NOT NULL,
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`),
  KEY `vehicle_cat_name_idx` (`name`),
  KEY `vehicle_cat_active_idx` (`is_active`),
  KEY `vehicle_cat_daily_idx` (`daily_rate`),
  CONSTRAINT `vehicle_cat_daily_rate_non_negative` CHECK ((`daily_rate` >= 0)),
  CONSTRAINT `vehicle_cat_deposit_non_negative` CHECK ((`minimum_deposit` >= 0)),
  CONSTRAINT `vehicle_cat_hourly_rate_non_negative` CHECK (((`hourly_rate` is null) or (`hourly_rate` >= 0))),
  CONSTRAINT `vehicle_cat_min_hours_positive` CHECK ((`minimum_rental_hours` > 0)),
  CONSTRAINT `vehicles_vehiclecategory_chk_1` CHECK ((`minimum_rental_hours` >= 0))
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `vehicles_vehiclecategory`
--

LOCK TABLES `vehicles_vehiclecategory` WRITE;
/*!40000 ALTER TABLE `vehicles_vehiclecategory` DISABLE KEYS */;
INSERT INTO `vehicles_vehiclecategory` VALUES (1,'Probe Cat','d',100.00,20.00,300.00,1,1,'2026-08-03 15:13:44.062323','2026-08-03 15:13:44.062352');
/*!40000 ALTER TABLE `vehicles_vehiclecategory` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `vehicles_vehiclephoto`
--

DROP TABLE IF EXISTS `vehicles_vehiclephoto`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `vehicles_vehiclephoto` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `file` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_primary` tinyint(1) NOT NULL,
  `position` int unsigned NOT NULL,
  `caption` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  `vehicle_id` bigint NOT NULL,
  PRIMARY KEY (`id`),
  KEY `vehicle_photo_vehicle_idx` (`vehicle_id`),
  KEY `vehicle_photo_primary_idx` (`is_primary`),
  KEY `vehicle_photo_position_idx` (`position`),
  CONSTRAINT `vehicles_vehiclephoto_vehicle_id_810e101a_fk_vehicles_vehicle_id` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles_vehicle` (`id`),
  CONSTRAINT `vehicles_vehiclephoto_chk_1` CHECK ((`position` >= 0))
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `vehicles_vehiclephoto`
--

LOCK TABLES `vehicles_vehiclephoto` WRITE;
/*!40000 ALTER TABLE `vehicles_vehiclephoto` DISABLE KEYS */;
INSERT INTO `vehicles_vehiclephoto` VALUES (1,'vehicles/photos/bd9566fbf9f14c80a4a88c3795dc1ed3.jpeg',1,0,'','2026-08-11 09:35:35.530475','2026-08-11 09:35:35.530514',4);
/*!40000 ALTER TABLE `vehicles_vehiclephoto` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-08-11 22:30:24
