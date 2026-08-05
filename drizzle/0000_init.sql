CREATE TABLE `borrowers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`email` varchar(255),
	`phone` varchar(50),
	`department` varchar(100),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `borrowers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`category` varchar(100) NOT NULL,
	`description` text,
	`image_url` varchar(500),
	`quantity` int NOT NULL DEFAULT 1,
	`available_quantity` int NOT NULL DEFAULT 1,
	`status` enum('available','borrowed','maintenance') NOT NULL DEFAULT 'available',
	`location` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`item_id` int NOT NULL,
	`borrower_id` int NOT NULL,
	`quantity` int NOT NULL DEFAULT 1,
	`status` enum('active','returned','overdue') NOT NULL DEFAULT 'active',
	`borrow_date` timestamp NOT NULL DEFAULT (now()),
	`expected_return_date` timestamp NOT NULL,
	`actual_return_date` timestamp,
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `transactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_item_id_items_id_fk` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_borrower_id_borrowers_id_fk` FOREIGN KEY (`borrower_id`) REFERENCES `borrowers`(`id`) ON DELETE cascade ON UPDATE no action;