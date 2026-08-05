# 🗄️ Database Resources — PinjamBarang (MySQL)

Folder ini berisi semua resource database yang bisa langsung dipakai untuk
meng-setup database **MySQL / MariaDB** dari nol di environment mana pun.

## 📁 Isi Folder

| File              | Isi                                                              | Kapan Dipakai                                |
| ----------------- | ---------------------------------------------------------------- | -------------------------------------------- |
| `app_db_full.sql` | Dump lengkap (schema + data) hasil `mysqldump`                   | Restore penuh: struktur **plus** data contoh |
| `schema.sql`      | Hanya struktur: `CREATE TABLE`, enum, FK constraint (tanpa data) | Setup struktur bersih tanpa data contoh      |
| `seed.sql`        | Hanya data (`INSERT`) — 8 barang, 3 peminjam, 9 transaksi        | Isi data contoh ke struktur yang sudah ada   |

## 🚀 Cara Menggunakan

### Opsi A — Restore full dump (paling mudah)

```bash
# Buat database lalu restore
mysql -h 127.0.0.1 -u root -p -e "CREATE DATABASE app_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -h 127.0.0.1 -u root -p app_db < database/app_db_full.sql
```

Dump sudah berisi `DROP TABLE IF EXISTS` jadi aman dijalankan berulang kali —
data lama akan diganti.

### Opsi B — Schema saja, tanpa data

```bash
mysql -h 127.0.0.1 -u root -p app_db < database/schema.sql
```

### Opsi C — Isi ulang data contoh saja

```bash
mysql -h 127.0.0.1 -u root -p app_db < database/seed.sql
```

> ⚠️ Jalankan setelah schema dibuat. Jika tabel sudah berisi data, kosongkan
> dahulu dengan:
> `SET FOREIGN_KEY_CHECKS=0; TRUNCATE transactions; TRUNCATE borrowers; TRUNCATE items; SET FOREIGN_KEY_CHECKS=1;`

## 🛠️ Alternatif: via Drizzle (recommended untuk development)

Jika ingin langsung dari source of truth (`src/db/schema.ts`), tidak perlu
file SQL sama sekali:

```bash
# 1. Push schema ke database (otomatis buat tabel + enum + FK)
npm run db:push

# 2. Isi data contoh via TypeScript seed (hati-hati: mengosongkan tabel dulu)
npm run db:seed
```

Atau kalau pakai *migrations*:

```bash
npm run db:generate   # buat file migrasi baru dari perubahan src/db/schema.ts
npm run db:migrate    # jalankan migrasi di drizzle/ ke database
```

Buka GUI browser database:

```bash
npm run db:studio     # Drizzle Studio di https://local.drizzle.studio
```

## 🔄 Generate ulang dump dari database aktif

```bash
mysqldump -h 127.0.0.1 -u app -p app_db > database/app_db_full.sql
mysqldump -h 127.0.0.1 -u app -p --no-data app_db > database/schema.sql
mysqldump -h 127.0.0.1 -u app -p --no-create-info app_db > database/seed.sql
```

> Kompatibel dengan MySQL 8+ dan MariaDB 10.11+.
> Connection string default app: `mysql://app:app1234@127.0.0.1:3306/app_db`
