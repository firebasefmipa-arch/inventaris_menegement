import {
  mysqlTable,
  mysqlEnum,
  varchar,
  text,
  int,
  timestamp,
  datetime,
  primaryKey,
} from "drizzle-orm/mysql-core";
import type { AdapterAccountType } from "next-auth/adapters";

export const items = mysqlTable("items", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  category: varchar("category", { length: 100 }).notNull(),
  description: text("description"),
  sn: varchar("sn", { length: 255 }),
  inventoryNumber: varchar("inventory_number", { length: 255 }),
  assetNumber: varchar("asset_number", { length: 255 }),
  lastCheckDate: varchar("last_check_date", { length: 255 }),
  condition: varchar("condition", { length: 255 }),
  imageUrl: varchar("image_url", { length: 500 }),
  quantity: int("quantity").notNull().default(1),
  availableQuantity: int("available_quantity").notNull().default(1),
  status: mysqlEnum("status", ["available", "borrowed"])
    .notNull()
    .default("available"),
  location: varchar("location", { length: 255 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const users = mysqlTable("user", {
  id: varchar("id", { length: 255 })
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 255 }).unique(),
  emailVerified: timestamp("emailVerified", {
    mode: "date",
    fsp: 3,
  }),
  image: varchar("image", { length: 255 }),
  password: varchar("password", { length: 255 }),
  plainPassword: varchar("plain_password", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  nim: varchar("nim", { length: 50 }),
  department: varchar("department", { length: 100 }),
  status: mysqlEnum("status", ["pending", "active", "suspended"])
    .default("active"),
  role: mysqlEnum("role", ["user", "admin", "super_admin"])
    .notNull()
    .default("user"),
});

export const accounts = mysqlTable(
  "account",
  {
    userId: varchar("userId", { length: 255 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 255 })
      .$type<AdapterAccountType>()
      .notNull(),
    provider: varchar("provider", { length: 255 }).notNull(),
    providerAccountId: varchar("providerAccountId", { length: 255 }).notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: int("expires_at"),
    token_type: varchar("token_type", { length: 255 }),
    scope: varchar("scope", { length: 255 }),
    id_token: text("id_token"),
    session_state: varchar("session_state", { length: 255 }),
  },
  (account) => ({
    compoundKey: primaryKey({
      columns: [account.provider, account.providerAccountId],
    }),
  })
);

export const sessions = mysqlTable("session", {
  sessionToken: varchar("sessionToken", { length: 255 }).primaryKey(),
  userId: varchar("userId", { length: 255 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = mysqlTable(
  "verificationToken",
  {
    identifier: varchar("identifier", { length: 255 }).notNull(),
    token: varchar("token", { length: 255 }).notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => ({
    compoundKey: primaryKey({ columns: [vt.identifier, vt.token] }),
  })
);

export const transactions = mysqlTable("transactions", {
  id: int("id").autoincrement().primaryKey(),
  userId: varchar("user_id", { length: 255 })
    .references(() => users.id, { onDelete: "set null" }),
  // itemId tetap ada untuk backward-compatibility, nullable untuk multi-item
  itemId: int("item_id")
    .references(() => items.id, { onDelete: "set null" }),
  borrowerName: varchar("borrower_name", { length: 255 }).notNull(),
  borrowerEmail: varchar("borrower_email", { length: 255 }),
  borrowerPhone: varchar("borrower_phone", { length: 50 }),
  borrowerDepartment: varchar("borrower_department", { length: 100 }),
  borrowerNim: varchar("borrower_nim", { length: 50 }),
  borrowerLocation: varchar("borrower_location", { length: 255 }),
  quantity: int("quantity").notNull().default(1),
  status: mysqlEnum("status", [
    "pending_signature",
    "pending_approval",
    "active",
    "rejected",
    "returned",
    "overdue"
  ])
    .notNull()
    .default("pending_signature"),
  signedDocumentUrl: varchar("signed_document_url", { length: 500 }),
  borrowDate: timestamp("borrow_date").notNull().defaultNow(),
  expectedReturnDate: datetime("expected_return_date").notNull(),
  actualReturnDate: datetime("actual_return_date"),
  notes: text("notes"),
  purpose: text("purpose"),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Tabel join untuk multi-item per transaksi
export const transactionItems = mysqlTable("transaction_items", {
  id: int("id").autoincrement().primaryKey(),
  transactionId: int("transaction_id")
    .notNull()
    .references(() => transactions.id, { onDelete: "cascade" }),
  itemId: int("item_id")
    .notNull()
    .references(() => items.id, { onDelete: "cascade" }),
  quantity: int("quantity").notNull().default(1),
  notes: text("notes"),
});

// ── Serah Terima (permanen, stok berkurang permanen) ──────────────────────

export const handovers = mysqlTable("handovers", {
  id: int("id").autoincrement().primaryKey(),
  userId: varchar("user_id", { length: 255 })
    .references(() => users.id, { onDelete: "set null" }),
  // Informasi penerima
  receiverName: varchar("receiver_name", { length: 255 }).notNull(),
  receiverNim: varchar("receiver_nim", { length: 50 }),
  unitName: varchar("unit_name", { length: 255 }),
  department: varchar("department", { length: 100 }),
  phone: varchar("phone", { length: 50 }),
  location: varchar("location", { length: 255 }),
  purpose: text("purpose"),
  notes: text("notes"),
  // Dokumen TTD
  signedDocumentUrl: varchar("signed_document_url", { length: 500 }),
  // Status flow: pending_signature → pending_approval → completed / rejected
  status: mysqlEnum("status", [
    "pending_signature",
    "pending_approval",
    "completed",
    "rejected",
  ]).notNull().default("pending_signature"),
  rejectionReason: text("rejection_reason"),
  handoverDate: timestamp("handover_date").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const handoverItems = mysqlTable("handover_items", {
  id: int("id").autoincrement().primaryKey(),
  handoverId: int("handover_id")
    .notNull()
    .references(() => handovers.id, { onDelete: "cascade" }),
  itemId: int("item_id")
    .notNull()
    .references(() => items.id, { onDelete: "cascade" }),
  quantity: int("quantity").notNull().default(1),
  notes: text("notes"),
});
