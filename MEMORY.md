# MEMORY.md — Panduan Pengembangan Web Peminjaman Barang

> File ini adalah catatan hidup proyek. Perbarui setiap kali ada perubahan signifikan.
> Terakhir diperbarui: Agustus 2026

---

## 1. Identitas Proyek

| | |
|---|---|
| **Nama Sistem** | Sistem Peminjaman Alat & Barang — Divisi TI FMIPA UII |
| **Stack** | Next.js 16 (App Router) + MySQL + Drizzle ORM + NextAuth v5 |
| **Database** | `modern_lending` (MySQL/MariaDB via XAMPP lokal) |
| **Auth** | Google OAuth (user/admin) + Credentials (super_admin/admin native) |
| **Styling** | Tailwind CSS v4 |
| **Deploy target** | Ubuntu + PM2 + Nginx |

---

## 2. Struktur Folder Penting

```
src/
├── app/
│   ├── (public)/katalog/         # Halaman katalog publik
│   ├── admin/                    # Dashboard admin
│   │   ├── (auth)/login/         # Login admin/super_admin (native)
│   │   ├── items/                # Manajemen barang
│   │   ├── transactions/         # Manajemen peminjaman
│   │   └── users/                # Manajemen pengguna
│   ├── dashboard/                # Dashboard user
│   │   ├── pinjam/               # Form pinjam barang (multi-item cart)
│   │   ├── riwayat/              # Riwayat peminjaman user
│   │   └── profil/               # Edit profil user
│   ├── api/
│   │   ├── pinjam/               # POST — buat transaksi (multi-item cart)
│   │   ├── user/transactions/    # GET transaksi user + summary
│   │   ├── user/profile/         # GET/PATCH profil user
│   │   ├── transactions/[id]/    # PUT update + approve/reject + upload + generate-pdf
│   │   └── items/                # GET/POST items
│   ├── auth/callback/            # Redirect post-OAuth ke dashboard sesuai role
│   ├── login/                    # Login user (Google)
│   └── register/complete/        # Lengkapi profil setelah OAuth pertama kali
├── components/
│   ├── UserSidebar.tsx           # Sidebar dashboard user (badge notifikasi)
│   ├── Sidebar.tsx               # Sidebar dashboard admin
│   ├── PinjamFlow.tsx            # Form pinjam untuk halaman publik /katalog
│   └── Toaster.tsx               # Komponen notifikasi toast
├── lib/
│   └── pdf-generator.ts          # Generate PDF formulir peminjaman multi-halaman
├── db/
│   ├── index.ts                  # Koneksi Drizzle + MySQL pool
│   └── schema.ts                 # Schema semua tabel
├── auth.ts                       # Konfigurasi NextAuth (Google + Credentials)
├── middleware.ts                 # Proteksi route berbasis role (pakai getToken JWT)
└── types/next-auth.d.ts          # Type augmentation NextAuth (role, phone, department)

scripts/
└── create-super-admin.ts         # Script interaktif buat akun super_admin

database/
├── add_role_column.sql           # Migrasi: tambah kolom role ke tabel user
└── app_db_full.sql               # Backup schema lengkap
```

---

## 3. Sistem Role

| Role | Login | Akses | Dibuat Oleh |
|---|---|---|---|
| `super_admin` | `/admin/login` (email+password) | Semua fitur admin + kelola role + hapus data | Script `npm run setup:superadmin` |
| `admin` | `/admin/login` (email+password atau Google jika dipromosi) | Kelola barang, transaksi, suspend user | Super admin |
| `user` | `/login` (Google OAuth) | Dashboard user, pinjam barang, riwayat | Registrasi Google |

### Otoritas per Role

| Aksi | user | admin | super_admin |
|---|---|---|---|
| Pinjam barang | ✅ | ✅ | ✅ |
| Approve/reject transaksi | ❌ | ✅ | ✅ |
| Suspend user biasa | ❌ | ✅ | ✅ |
| Suspend admin lain | ❌ | ❌ | ✅ |
| Promosi/demosi role | ❌ | ❌ | ✅ |
| Buat akun admin native | ❌ | ❌ | ✅ |
| Hapus akun user | ❌ | ❌ | ✅ |
| Hapus history transaksi | ❌ | ❌ | ✅ |
| Bulk delete transaksi | ❌ | ❌ | ✅ |

---

## 4. Schema Database

### Tabel Utama

```sql
user                  -- Semua pengguna (user, admin, super_admin)
items                 -- Inventaris barang
transactions          -- Header transaksi peminjaman
transaction_items     -- Detail barang per transaksi (multi-item)
account               -- OAuth accounts (NextAuth)
session               -- Sessions (NextAuth)
verificationToken     -- Token verifikasi (NextAuth)
```

### Kolom Kritis

```sql
-- user
role ENUM('user','admin','super_admin') DEFAULT 'user'
password VARCHAR(255)          -- hanya diisi untuk akun native (bcrypt hash)
status ENUM('pending','active','suspended')

-- transactions
item_id INT NULL               -- nullable sejak multi-item (FK ke items, ON DELETE SET NULL)
rejection_reason TEXT          -- wajib diisi saat status = rejected
status ENUM('pending_signature','pending_approval','active','rejected','returned','overdue')

-- transaction_items
transaction_id INT → transactions.id (CASCADE DELETE)
item_id        INT → items.id        (CASCADE DELETE)
quantity       INT
notes          TEXT
```

### Foreign Key Penting

```sql
transactions.user_id    → user.id    ON DELETE SET NULL   -- hapus user, history tetap ada
transactions.item_id    → items.id   ON DELETE SET NULL   -- nullable, multi-item pakai transaction_items
transaction_items.transaction_id → transactions.id ON DELETE CASCADE
```

---

## 5. Alur Utama

### Alur User Baru
```
/ (landing) → klik "Mulai Pinjam"
→ /login → Google OAuth
→ /auth/callback (cek role + profil)
→ /register/complete (isi HP + prodi/divisi) jika profil belum lengkap
→ /dashboard/pinjam
```

### Alur Peminjaman
```
/dashboard/pinjam
→ Step 1: Pilih barang (multi-item cart, klik untuk masuk/keluar cart)
→ Step 2: Isi tanggal kembali + catatan per item
→ Submit → POST /api/pinjam (buat 1 transaction + N transaction_items)
→ Countdown 5 detik → /transactions/[id]/upload
→ Upload formulir TTD → status: pending_approval
→ Admin approve/reject
→ Jika approved: status: active → user ambil barang
→ Saat dikembalikan: admin klik Return → status: returned + stok dikembalikan
```

### Alur Admin Login
```
/admin/login → POST credentials → NextAuth CredentialsProvider
→ Cek role = 'admin' atau 'super_admin' + password bcrypt
→ JWT token dengan role → /admin dashboard
```

---

## 6. Environment Variables

```env
# .env.local (jangan di-commit)
DATABASE_URL=mysql://root:@127.0.0.1:3306/modern_lending
NEXTAUTH_URL=http://localhost:3000           # Ganti dengan domain saat deploy
NEXTAUTH_SECRET=<random string panjang>
GOOGLE_CLIENT_ID=<dari Google Cloud Console>
GOOGLE_CLIENT_SECRET=<dari Google Cloud Console>
SMTP_EMAIL=                                  # Opsional, untuk notifikasi email
SMTP_PASSWORD=
```

---

## 7. Script & Commands

```bash
# Development
npm run dev                    # Jalankan dev server

# TypeScript check
npm run typecheck              # Harus 0 errors sebelum deploy

# Database
npm run db:studio              # Buka Drizzle Studio (GUI database)
npm run db:generate            # Generate migrasi dari perubahan schema
npm run db:push                # Push schema langsung ke DB (development)

# Setup
npm run setup:superadmin       # Buat akun super_admin (interaktif via terminal)

# Deploy
npm run build                  # Build production
npm start                      # Jalankan production server
pm2 start npm --name "app" -- start   # Jalankan via PM2
pm2 restart app                # Restart setelah update
```

---

## 8. Migrasi Database

Setiap kali deploy ke server baru atau setelah reset DB, jalankan SQL berikut secara berurutan:

```sql
-- 1. Import schema utama
-- (gunakan database/app_db_full.sql atau modern_lending_backup.sql)

-- 2. Tambah kolom role
ALTER TABLE `user`
  ADD COLUMN `role` ENUM('user', 'admin', 'super_admin') NOT NULL DEFAULT 'user'
  AFTER `status`;

-- 3. Tambah kolom rejection_reason
ALTER TABLE transactions
  ADD COLUMN rejection_reason TEXT NULL AFTER notes;

-- 4. Buat tabel transaction_items
CREATE TABLE IF NOT EXISTS transaction_items (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  transaction_id INT NOT NULL,
  item_id INT NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  notes TEXT NULL,
  CONSTRAINT fk_ti_transaction FOREIGN KEY (transaction_id)
    REFERENCES transactions(id) ON DELETE CASCADE,
  CONSTRAINT fk_ti_item FOREIGN KEY (item_id)
    REFERENCES items(id) ON DELETE CASCADE
);

-- 5. Ubah item_id di transactions jadi nullable
ALTER TABLE transactions MODIFY COLUMN item_id INT NULL;

-- 6. Update FK transactions.user_id ke ON DELETE SET NULL
-- (lihat database/add_role_column.sql untuk detail lengkap)

-- 7. Buat akun super_admin
-- Jalankan: npm run setup:superadmin
```

---

## 9. Konvensi Kode

### API Routes
- Selalu ada auth guard di setiap endpoint yang butuh login
- Gunakan `(session?.user as any)?.role` untuk cek role
- Kembalikan stok item saat transaksi ditolak atau dihapus
- Untuk multi-item, selalu query `transaction_items` terlebih dahulu, fallback ke `transactions.item_id` legacy

### Komponen
- Client components: gunakan `"use client"` di baris pertama
- Server components: fetch data langsung, tidak perlu `"use client"`
- Toast notifikasi: gunakan `useToast()` dari `@/components/Toaster`

### Database
- Semua query lewat Drizzle ORM (`db` dari `@/db`)
- Gunakan `Promise.all()` untuk query paralel yang tidak saling bergantung
- Jangan gunakan `db.query.*` karena butuh schema di drizzle config

### Status Transaksi
```
pending_signature → pending_approval → active → returned
                                     ↘ overdue (via cron/logic)
                  ↘ rejected (dengan rejection_reason wajib)
```

---

## 10. Hal yang Perlu Diperhatikan Saat Pengembangan

1. **Middleware berjalan di Edge Runtime** — jangan import library Node.js (bcrypt, fs, dll) di `middleware.ts`. Gunakan `getToken()` dari `next-auth/jwt` saja.

2. **`transactions.itemId` nullable** — sejak multi-item, `itemId` di tabel transactions bisa `null`. Selalu cek null sebelum pakai di query Drizzle.

3. **Stock management** — stok dikurangi saat `POST /api/pinjam`. Dikembalikan saat: transaksi ditolak, dihapus, atau dikembalikan. Jangan lupa update kedua tabel: `items.availableQuantity` dan `items.status`.

4. **PDF generator** — fungsi `generateBorrowingPDF()` di `src/lib/pdf-generator.ts` sudah support multi-halaman otomatis. Jika menambah kolom baru di tabel PDF, sesuaikan `colWidths` agar total = `CONTENT_W` (483.28px).

5. **Auth callback** — setelah Google OAuth, user selalu diarahkan ke `/auth/callback` yang membaca role dari DB dan redirect ke tempat yang benar.

6. **Badge sidebar** — `UserSidebar` fetch `/api/user/transactions/summary` setiap 30 detik untuk update badge `pending_signature`.

---

## 11. Fitur yang Belum Diimplementasi (Backlog)

- [ ] Notifikasi email ke user saat transaksi diapprove/reject
- [ ] Halaman ganti password untuk super_admin/admin native di dalam dashboard
- [ ] Export laporan transaksi ke Excel
- [ ] Pagination pada halaman riwayat admin (saat ini load semua)
- [ ] Cron job otomatis ubah status `active` yang melewati deadline ke `overdue`
- [ ] Push notification (PWA) untuk reminder pengembalian barang
- [ ] QR code pada formulir PDF untuk verifikasi

---

## 12. Deployment Checklist

- [ ] `npm run typecheck` → 0 errors
- [ ] `.env.local` sudah diisi dengan nilai production (NEXTAUTH_URL = domain asli)
- [ ] Semua migrasi DB sudah dijalankan (lihat bagian 8)
- [ ] `npm run setup:superadmin` sudah dijalankan di server
- [ ] `npm run build` berhasil tanpa error
- [ ] PM2 sudah dikonfigurasi dengan `pm2 startup` untuk auto-restart
- [ ] Nginx sudah dikonfigurasi sebagai reverse proxy ke port 3000
- [ ] SSL/HTTPS sudah aktif (certbot) jika menggunakan domain publik
- [ ] Folder `public/uploads/signed_forms/` sudah ada dan writable
