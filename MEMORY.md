# MEMORY.md — Panduan Pengembangan Web Peminjaman Barang

> File ini adalah catatan hidup proyek. Perbarui setiap kali ada perubahan signifikan.
> Terakhir diperbarui: September 2026
>
> **CATATAN PENTING — ruang lingkup file ini:**
> Isinya HANYA sebatas **sourcecode proyek** (struktur folder, schema, konvensi,
> alur, env). **Urusan server (nginx, PM2, MySQL, gateway/domain, deploy)
> BUKAN di sini** — semua ada di `DEPLOY.md` (baca itu untuk hal server).
> Jika mengubah kode, file ini memberi konteks apa yang sedang dikerjakan.
>
> **Riwayat audit ada di `AUDIT.md`** — catatan waktu: temuan, bukti, commit
> penutupnya. Sebelum mengubah sesuatu yang menyangkut keamanan/stok, baca
> bagian "Temuan yang SENGAJA DIBIARKAN" di sana supaya tidak mengulang
> pemeriksaan atau menghidupkan lagi masalah yang sudah sengaja ditunda.

---

## 1. Identitas Proyek

| | |
|---|---|
| **Nama Sistem** | Management logistic — Sistem Peminjaman Alat & Barang, Divisi TI FMIPA UII |
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
│   │   ├── documents/            # Manajemen dokumen (super_admin; hapus/export/regenerate)
│   │   ├── handovers/            # Manajemen serah terima
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
│   ├── AuthProvider.tsx         # SessionProvider basePath (dari env NEXT_PUBLIC_BASE_PATH)
│   ├── BasePathProvider.tsx     # Patch window.fetch: tambah prefix base path ke /api & /uploads
│   ├── UserSidebar.tsx          # Sidebar dashboard user (badge notifikasi)
│   ├── Sidebar.tsx              # Sidebar dashboard admin
│   ├── PinjamFlow.tsx           # Form pinjam untuk halaman publik /katalog (DEAD CODE)
│   ├── UserPinjamFlow.tsx       # Form pinjam yang benar-benar dipakai dashboard user
│   ├── DueSoonCard.tsx          # Kartu "Segera Dikembalikan" (variant user|admin)
│   ├── LocationSelect.tsx       # Dropdown lokasi barang (25 opsi resmi + custom)
│   └── Toaster.tsx              # Komponen notifikasi toast
├── lib/
│   ├── basepath.ts              # Util bp()/withBase — prefix URL asset/link (cek pemakaian)
│   ├── locations.ts             # Sumber tunggal daftar lokasi + normalizeLocation/locationCode
│   ├── item-code.ts             # Generator kode barang FMIPA-<LOKASI>-<TAHUN>-<URUT>
│   ├── departments.ts           # Sumber tunggal daftar prodi/divisi (11 prodi)
│   ├── to-bool.ts               # Helper Boolean aman (Boolean("0") === true!)
│   └── pdf-generator.ts         # Generate PDF formulir peminjaman multi-halaman
├── db/
│   ├── index.ts                 # Koneksi Drizzle + MySQL pool
│   └── schema.ts                # Schema semua tabel (sumber kebenaran schema)
├── auth.ts                      # NextAuth (Google + Credentials); basePath Auth.js dari env
├── middleware.ts                # Proteksi route berbasis role (pakai getToken JWT)
└── types/next-auth.d.ts         # Type augmentation NextAuth (role, phone, department)

scripts/
├── create-super-admin.ts         # Script interaktif buat akun super_admin
└── check-pdf-layout.ts           # Uji tata letak tabel PDF (npm run check:pdf)

database/
├── add_role_column.sql           # Migrasi: tambah kolom role ke tabel user
└── app_db_full.sql               # Backup schema lengkap
```

Skrip penjaga lain (jalankan `npx tsx scripts/<nama>.ts`; semuanya wajib lulus
sebelum & sesudah deploy, dan menulis data ujinya sendiri lalu membersihkannya
sehingga aman diulang di database produksi):

| Skrip | Yang dijaga |
|---|---|
| `check-label-layout.ts` | geometri + isi label barang (`npm run check:label`) |
| `check-item-snapshot.ts` | tiap pemakaian `namaSql*` punya tabel sumber (`npm run check:snapshot`) |
| `check-import-fix.ts` | impor Excel: nomor inv 12 digit, lokasi salah ketik, formData |
| `check-terlambat.ts` | satu definisi "Terlambat" — SQL == klien |
| `check-barang-habis.ts` | barang habis diserahkan: tetap ada, tersembunyi, terkunci (`npm run check:habis`) |
| `check-berkas-tak-terpakai.ts` | berkas unggahan tanpa rujukan DB (`--hapus` = buang) |

---

## 3. Sistem Role

| Role | Login | Akses | Dibuat Oleh |
|---|---|---|---|
| `super_admin` | `/admin/login` (email+password) | Semua fitur admin + kelola role + hapus data | Script `npm run setup:superadmin` |
| `admin` | `/admin/login` (email+password atau Google jika dipromosi) | Kelola barang, transaksi, suspend user. **Double role**: boleh masuk `/dashboard` sebagai user, tombol switch 2 arah di sidebar | Super admin |
| `user` | `/login` (Google OAuth) | Dashboard user, pinjam barang, riwayat | Registrasi Google |

Catatan double role: hanya `role === 'admin'` yang bisa masuk `/dashboard`;
`super_admin` tetap di-redirect ke `/admin` (perilaku lama). Di dashboard admin,
data diri peminjam boleh custom; di dashboard user, data diri dipaksa milik
akun sendiri — dikunci di server (`/api/pinjam`, `/api/handovers`, `/api/transactions`).

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

-- items (flag ketersediaan manual, ditambah September 2026)
can_borrow   TINYINT(1) NOT NULL DEFAULT 1  -- boleh dipinjam?
can_handover TINYINT(1) NOT NULL DEFAULT 1  -- boleh diserahterimakan?
is_labelable TINYINT(1) NOT NULL DEFAULT 1  -- boleh dicetak labelnya?
                                            -- 0 untuk kabel/dongle wifi dsb

-- items (kode barang otomatis, ditambah 11 September 2026)
item_code VARCHAR(255) NULL UNIQUE  -- FMIPA-<KODE LOKASI>-<TAHUN>-<URUT>
                                    -- dibuat server, terkunci, barang lama NULL
```

Sumber tunggal daftar lokasi + kode: `src/lib/locations.ts` (25 lokasi resmi,
`normalizeLocation()`, `locationCode()`, `buildItemCode()`). Penomoran:
`src/lib/item-code.ts` (`generateItemCode()`, `resolvePrefix()`, `nextSequence()`,
`formatCode()`).

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
# .env.local (jangan di-commit) — nilai contoh dev lokal
DATABASE_URL=mysql://root:@127.0.0.1:3306/modern_lending
NEXTAUTH_URL=http://localhost:3000           # Ganti dengan URL publik saat deploy
NEXTAUTH_SECRET=<random string panjang>
GOOGLE_CLIENT_ID=<dari Google Cloud Console>
GOOGLE_CLIENT_SECRET=<dari Google Cloud Console>
SMTP_EMAIL=                                  # Opsional, untuk notifikasi email
SMTP_PASSWORD=
```

### `NEXT_PUBLIC_BASE_PATH` — variabel KUNCI (path-agnostic app)

App ini **path-agnostic**: dijalankan di sub-path (mis. `/empati`) ATAU di root
(subdomain), cukup ganti env — kode TIDAK perlu diubah.

- **Sub-path publik** (deploy di belakang gateway): `NEXT_PUBLIC_BASE_PATH=/empati`
  (nilai apa pun; wajib konsisten dengan path di `NEXTAUTH_URL`).
- **Root/subdomain tanpa gateway**: variabel ini KOSONG/tidak ada → app di root.
- Env ini dibaca di 5 titik yang HARUS sinkron (semua memakai
  `process.env.NEXT_PUBLIC_BASE_PATH` — jangan hardcode nilai):
  1. `next.config.ts` → `basePath` (asset/link/redirect server-render)
  2. `src/auth.ts` → basePath Auth.js = `"${BASE}/api/auth"` (callback URL Google)
  3. `src/app/api/auth/[...nextauth]/route.ts` → addBase: tambah prefix kembali
     ke pathname `/api/auth/*` sebelum diteruskan Auth.js (Next sudah strip
     prefix saat route matching). No-op bila BASE kosong.
  4. `src/components/AuthProvider.tsx` → `SessionProvider basePath`
     (`"${BASE}/api/auth"`) agar signIn/signOut client benar.
  5. `src/components/BasePathProvider.tsx` (BARU, `"use client"`) → patch
     `window.fetch`: tambah BASE ke fetch(`/api/...`) & fetch(`/uploads/...`)
     (basePath Next TIDAK otomatis menambah ke fetch manual). No-op bila kosong.
     Terpasang di `src/app/layout.tsx` (paling luar, bungkus AuthProvider).

> **Penting:** 5 lapis ini harus konsisten. Kalau app dipindah ke path/domain
> lain, cukup ubah env + (urusan server) — JANGAN hardcode "/empati" di kode.
> Detail & urusan server ada di DEPLOY.md.

---

## 7. Script & Commands

```bash
# Development
npm run dev                    # Jalankan dev server

# TypeScript check
npm run typecheck              # Harus 0 errors sebelum deploy

# Uji tata letak tabel PDF (generate PDF asli lalu baca isinya)
npm run check:pdf              # Harus "SEMUA LOLOS" setelah mengubah kolom PDF

# Uji label barang (geometri + isi PDF nyata)
npm run check:label            # Harus "SEMUA LOLOS" setelah mengubah label

# Uji snapshot identitas barang di riwayat/dokumen
npm run check:snapshot         # Harus "SEMUA LOLOS"

# Uji lain (belum ber-alias npm run):
npx tsx scripts/check-import-fix.ts            # impor Excel
npx tsx scripts/check-terlambat.ts             # definisi "Terlambat"
npx tsx scripts/check-barang-habis.ts          # barang habis diserahkan (tetap ada & tersembunyi)
npx tsx scripts/check-berkas-tak-terpakai.ts   # berkas unggahan tanpa rujukan

# Database
npm run db:studio              # Buka Drizzle Studio (GUI database)
npm run db:generate            # Generate migrasi dari perubahan schema
npm run db:push                # Push schema langsung ke DB (development)

# Setup
npm run setup:superadmin       # Buat akun super_admin (interaktif via terminal)

# Build & jalankan (urusan server: PM2/nginx ada di DEPLOY.md)
npm run build                  # Build production
npm start                      # Jalankan production server
```

---

## 8. Migrasi Database

Setiap kali deploy ke server baru atau setelah reset DB, jalankan SQL berikut secara berurutan.
> (Cara menjalankan di server & akun superadmin: DEPLOY.md.)

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

-- 8. Flag ketersediaan barang (September 2026)
--    Barang lama otomatis dapat nilai 1 (Tersedia) — perilaku tidak berubah.
ALTER TABLE items
  ADD COLUMN can_borrow   TINYINT(1) NOT NULL DEFAULT 1,
  ADD COLUMN can_handover TINYINT(1) NOT NULL DEFAULT 1;

-- 9. Kode barang otomatis (11 September 2026)
--    Barang lama dibiarkan NULL; kode dibuat saat barang baru disimpan.
ALTER TABLE items
  ADD COLUMN item_code VARCHAR(255) NULL AFTER sn,
  ADD UNIQUE INDEX items_item_code_unique (item_code);

-- 9b. Bersihkan tulisan lokasi lama yang tidak konsisten (opsional, sekali jalan)
UPDATE items SET location = 'Divisi Teknologi Informasi'
WHERE UPPER(location) IN ('DIVISI TI', 'DIVISI IT', 'DIVISI TEKNOLOGI INFORMASI');

-- 10. Snapshot identitas barang di baris riwayat (22 September 2026)
--     Riwayat & dokumen tetap menampilkan nama/data barang walau barangnya
--     sudah dihapus. Lihat src/lib/item-snapshot.ts.
ALTER TABLE transaction_items
  ADD COLUMN item_name             VARCHAR(255) NULL,
  ADD COLUMN item_code             VARCHAR(255) NULL,
  ADD COLUMN item_inventory_number VARCHAR(255) NULL;

ALTER TABLE handover_items
  ADD COLUMN item_name             VARCHAR(255) NULL,
  ADD COLUMN item_code             VARCHAR(255) NULL,
  ADD COLUMN item_inventory_number VARCHAR(255) NULL;

-- Backfill baris lama dari tabel items (yang masih ada)
UPDATE transaction_items ri JOIN items i ON i.id = ri.item_id
  SET ri.item_name = i.name, ri.item_code = i.item_code,
      ri.item_inventory_number = i.inventory_number
  WHERE ri.item_name IS NULL;

UPDATE handover_items ri JOIN items i ON i.id = ri.item_id
  SET ri.item_name = i.name, ri.item_code = i.item_code,
      ri.item_inventory_number = i.inventory_number
  WHERE ri.item_name IS NULL;
```

> Catatan tanggal 8: JANGAN pakai `drizzle-kit push` di produksi — pernah
> menggagalkan/menghapus index FK `account_userId_idx`. Tambah kolom manual
> dengan ALTER seperti di atas.

---

## 9. Konvensi Kode

### API Routes
- Selalu ada auth guard di setiap endpoint yang butuh login
- **`/api/transactions` GET wajib admin** — mengembalikan data pribadi peminjam
  (nama, email, no HP, prodi). Pernah terbuka untuk umum; jangan dilonggarkan.
- Endpoint ber-ID (`transactions/[id]/*`, `handovers/[id]/*`) memakai pola
  "pemilik ATAU admin": `if (x.userId !== session.user.id && role !== "admin" && role !== "super_admin")`
- Gunakan `(session?.user as any)?.role` untuk cek role
- Kembalikan stok item saat transaksi ditolak atau dihapus
- Untuk multi-item, selalu query `transaction_items` terlebih dahulu, fallback ke `transactions.item_id` legacy
- **`transactions.item_id` SELALU NULL.** Tautan barang ada di pivot
  `transaction_items` (`transaction_id` → `transactions.id`). Jadi join
  `transactions.item_id → items.id` TIDAK PERNAH menghasilkan nama barang —
  ini penyebab temuan Audit #7 (nama kosong di kartu dashboard admin).
  Ambil nama lewat pivot: `namaSql(items.name, transactionItems.itemName)`
  di `.from(transactionItems)` + `.leftJoin(items, eq(transactionItems.itemId, items.id))`,
  atau subquery `WHERE ti.transaction_id = transactions.id` (BUKAN `ti.item_id`).
  Kalau perlu baca SETELAH barisnya terbaca (pivot butuh daftar id dulu),
  tampilkan `"Barang"` untuk baris yang belum punya salinan — jangan `null`.

### Komponen
- Client components: gunakan `"use client"` di baris pertama
- Server components: fetch data langsung, tidak perlu `"use client"`
- Toast notifikasi: gunakan `useToast()` dari `@/components/Toaster`

### Database
- Semua query lewat Drizzle ORM (`db` dari `@/db`)
- Gunakan `Promise.all()` untuk query paralel yang tidak saling bergantung
- Jangan gunakan `db.query.*` karena butuh schema di drizzle config

### Riwayat ↔ Data Barang (PENTING)
Aturan yang disepakati:
- **Riwayat selalu baca DATA MASTER (live)** — admin membetulkan nama barang,
  riwayat ikut berubah sendiri. Tidak ada yang dikunci.
- **Dokumen ikut data terbaru saat di-regenerate** (bukan otomatis).
- **Barang dihapus → riwayat tetap menampilkan nama & data barang.** Snapshot
  di `transaction_items`/`handover_items` disegarkan TEPAT SEBELUM hapus
  (`snapshotSebelumHapus()`), bukan saat transaksi dibuat — supaya yang
  tersimpan adalah kondisi TERAKHIR sebelum barang hilang.

Cara pakai (`src/lib/item-snapshot.ts`):
```ts
itemName: namaSql(items.name, transactionItems.itemName)   // di dalam select
namaBarang(snap, live)                                     // di luar query
```
JANGAN menulis `itemName: items.name` langsung — barang yang sudah dihapus
akan tampil "Barang". Sudah diterapkan di 20 tempat (riwayat user/admin,
PDF generate & regenerate, statistik).

**Penting saat memakai `namaSql()`:** query WAJIB sudah menyertakan tabel
pivot-nya (`transactionItems`/`handoverItems`) lewat `.from()` atau
`.leftJoin()`. Kalau tidak, MySQL menolak dengan
`ER_BAD_FIELD_ERROR: Unknown column 'transaction_items.item_name'` dan halaman
gagal render — pernah terjadi di `/admin/transactions`.
- Query dari tabel `transactions` (baris single-item lama) → pakai
  `namaSqlLegacy(transactions.itemId)` (subquery, tanpa join).
- Verifikasi: `npm run check:snapshot` (memeriksa 18 pemakaian).

### Status Transaksi
```
pending_signature → pending_approval → active → returned
                                     ↘ overdue (DIHITUNG dari tanggal, bukan ditulis)
                  ↘ rejected (dengan rejection_reason wajib)
```

**Penting — status `overdue` TIDAK PERNAH ditulis** ke DB oleh kode mana pun
(tidak ada cron). "Terlambat" dihitung saat query lewat
**`sqlTerlambat()`** (`src/lib/tanggal.ts`) — SATU-SATUNYA rumusnya:

```ts
sqlTerlambat()  =  DATE(expected_return_date WIB) < DATE(COALESCE(actual_return_date, NOW()) WIB)
```

Satu rumus menangani dua keadaan: belum kembali & lewat tenggat, ATAU sudah
kembali tapi dulu telat. **Jangan tulis ulang predikat ini di tempat lain** —
dulu ada tiga rumus berbeda (kartu pakai `NOW()` UTC + `status='active'`,
daftar pakai WIB, klien pakai `hariTerlambat`) dan ketiganya tidak sepakat
(kartu=0 vs daftar=1 pada data nyata — Audit #5.4).

Pemakai: kartu dashboard admin, `/api/stats`, `admin/transactions/page.tsx`,
`/api/transactions`, `/api/user/transactions`, `/api/user/transactions/summary`.
Jangan cari penulis status `overdue`; kalau ada kode yang memfilter
`status = 'overdue'`, itu bug.

### Tanggal dikembalikan (actualReturnDate)

`transactions.actual_return_date` diisi `new Date()` di
`PUT /api/transactions/[id]` saat admin menekan "Kembalikan" — jadi waktu klik,
bukan tanggal dokumen. Satu-satunya tempat yang menulis status `returned`.

Yang menampilkannya:
- riwayat user `src/app/dashboard/riwayat/page.tsx` (baris "Dikembalikan")
- history admin `src/app/admin/transactions/TransactionsClient.tsx`
  (hanya bila `status === "returned"`)
- **Bukan** PDF peminjaman. Baris "Tanggal Kembali" di PDF tetap
  `expectedReturnDate` (tenggat). User pernah minta jangan diubah.
- **Bukan** halaman detail barang `/admin/items/[id]`.

### Zona waktu — pakai `src/lib/tanggal.ts`

Server jalan di **UTC**, pengguna WIB. Jangan pakai `date-fns`/`toLocaleDateString`
langsung untuk tanggal yang dilihat user: bisa geser sehari (klik jam 07:00 WIB
= 00:00 UTC). Pakai `formatTanggalWIB()` / `formatTanggalJamWIB()`
(Intl + `timeZone: "Asia/Jakarta"`, format `18 Sep 2026, 10:09`).

Catatan: ini HANYA untuk tampilan. Nilai DB tetap UTC. Perhitungan
"Terlambat" juga sudah diseragamkan ke kalender WIB lewat `sqlTerlambat()`
(lihat bagian status di atas) — pilihan B (satu definisi), sudah dikerjakan.

### "Terlambat" pada transaksi yang SUDAH dikembalikan

Dulu badge "Terlambat" hilang begitu barang dikembalikan (statusnya jadi
`returned`, syarat `status='active'` gagal). Sekarang tetap tampil.

Definisi tunggal di `src/lib/tanggal.ts` → **`hariTerlambat(tenggat, dikembalikan)`**:
selisih hari **kalender WIB**, 0 = tidak telat. Tanpa argumen kedua, dibandingkan
dengan hari ini (untuk yang masih dipinjam).

**Jebakan penting:** `expected_return_date` jamnya SELALU 00:00 (tenggat itu
tanggal). Membandingkan jam mentah bikin salah — tenggat 14 Sep 00:00 vs kembali
14 Sep 10:00 terbaca "telat" padahal hari yang sama. Karena itu bandingkan
TANGGAL kalender (helper pakai `fmtISO`; jangan pakai `fmtTanggal` yang bulannya
"Sep" → `NaN`).

Titik yang memakainya:
- admin: `TransactionsClient.tsx` (badge kedua + filter "Terlambat")
- user: `dashboard/riwayat/page.tsx` (badge kedua + tab "Terlambat")
- query: pakai `sqlTerlambat()` dari `src/lib/tanggal.ts` — jangan tulis ulang

Bentuk tampilan: **dua badge** ("Dikembalikan" + "Terlambat"), tanpa jumlah hari.
Kartu statistik "Terlambat" kini memakai definisi yang SAMA (`sqlTerlambat()`),
jadi angka kartu dan daftar selalu cocok. Penjaga: `scripts/check-terlambat.ts`.

### PDF — tata letak tabel
Tabel barang di kedua generator PDF sekarang punya kolom **Kode Barang**:
- `pdf-generator.ts` (peminjaman): `No | Nama Alat/Barang | Kode Barang | Jumlah | No. Inventaris | Keterangan`
- `handover-pdf-generator.ts` (serah terima): `No | Nama Barang | Kode Barang | No. Asset/No. Inventaris | Jumlah`

Lebar kolom ditentukan dari **hasil ukur teks nyata** (`font.widthOfTextAtSize`),
bukan perkiraan — kode terpanjang (`FMIPA-FMIPA-2026-001`) = 96.9pt di 9pt.
`fitText()` memotong teks yang melebihi kolom dan menambah "…".
Ada `npm run check:pdf` (`scripts/check-pdf-layout.ts`) yang meng-generate PDF
sungguhan lalu membaca content stream untuk memastikan: kode & No. Inventaris
utuh, tiap sel muat atau dipotong rapi, semua header tidak luber.

> Catatan: teks di PDF di-encode WinAnsi, jadi "…" di content stream muncul
> sebagai byte `0x85` — bukan UTF-8. Alat pembaca teks eksternal bisa gagal
> membacanya; jangan panik, itu hanya tanda potong.

### Lokasi & Kode Barang
- Dropdown lokasi: komponen `src/components/LocationSelect.tsx` (dipakai
  `ItemModal`, `add/page.tsx`, `[id]/edit/page.tsx`). Opsi resmi dari
  `LOCATION_OPTIONS` + lokasi custom yang sudah dipakai barang di DB
  (`existingLocations`), jadi custom otomatis "tersimpan" tanpa tabel baru.
- Kapitalisasi lokasi dirapikan `normalizeLocation()` — cocok beda
  besar-kecil dengan opsi resmi langsung jadi bentuk resmi, nama baru jadi
  Title Case (akronim TI/IT/UII/FMIPA/OSCE/CEOS/D3/S1/S2/S3 dipertahankan).
- Kode barang `FMIPA-<KODE LOKASI>-<TAHUN>-<URUT>` dibuat di server oleh
  `generateItemCode()`. Input kode dari klien SELALU diabaikan; import Excel
  juga mengabaikan kolom kode dan men-generate ulang.

### Impor Barang dari Excel (`.xlsx` / `.xls` / `.csv`)

**Satu sumber kebenaran kolom: `src/lib/item-import.ts`** (`IMPORT_COLUMNS`).
Dipakai bersama oleh parser, pembuat template, dan modal petunjuk — jangan
menduplikasi nama kolom di tempat lain. Kalau daftar berubah, template dan
petunjuk ikut berubah sendiri.

| Kolom (tulisan di file) | Wajib | Alias yang juga diterima |
|---|---|---|
| Nama Barang | ya | nama, name |
| Kategori | — | category (kosong → kata pertama nama) |
| Spesifikasi | — | deskripsi, description |
| SN | — | serialnumber |
| No. Inv DTI | — | noinventaris, noinv, nomorinventaris, inventorynumber |
| No. Asset | — | nomorasset, assetnumber |
| Tanggal Cek | — | lastcheckdate, tanggalpengecekan |
| Kondisi | — | condition |
| Jumlah | — | quantity, qty (harus bilangan bulat ≥1, kalau tidak → 1 + peringatan) |
| Lokasi | — | location |

Normalisasi nama kolom: huruf kecil, spasi/titik/strip/underscore dibuang
(`normalizeHeader()`), jadi "No. Inv DTI" ≡ "NO_INV_DTI" ≡ "noinv-dti".

**Perbedaan penting:** header lama hanya menerima `noinvdti` untuk nomor
inventaris, sehingga "No Inventaris" dibuang diam-diam. Sekarang pakai alias.

**Duplikat** (`kunciBarang()`): kunci = `No. Inv DTI` → kalau kosong `SN` →
kalau dua-duanya kosong `Nama + Lokasi`. Dinormalisasi huruf kecil + spasi
dipadatkan. Barang yang sudah ada di DB, ATAU kembar di dalam file yang sama,
**DILEWATI** (tidak diimpor ulang, tidak menimpa). Dilaporkan di
`duplicateRows` + `duplicates[]`.

**Balasan route** `POST /api/items/import`:
`{ importedCount, skippedRows, duplicateRows, duplicates[], warnings[] }`.
`skippedRows` = baris tanpa nama; `warnings` = baris yang tetap masuk tapi ada
kolom bermasalah (mis. lokasi salah ketik). Kalau semua baris dilewati → 400
dengan pesan sebabnya.

**WAJIB `raw: true` saat `sheet_to_json()`.** `raw: false` mengambil TAMPILAN
sel, dan Excel menampilkan angka 12+ digit sebagai notasi ilmiah —
`409010025366` jadi `"4.0901E+11"` (angka belakang HILANG). Semua nomor
inventaris UII 12 digit, jadi ini merusak setiap impor yang nomornya diketik
sebagai angka. Konversi ke teks lewat `keTeks()` (number → `String()` utuh),
jangan `String(v)` telanjang. Penjaga: `scripts/check-import-fix.ts`.

**Salah ketik lokasi dirapikan otomatis.** `lokasiMirip()` di
`src/lib/locations.ts` (jarak edit / Levenshtein, ambang 15% panjang nama)
mencocokkan lokasi yang beda 1–2 huruf ke nama resmi — "Devisi Teknologi
Informasi" → "Divisi Teknologi Informasi" (kode DTI → TI). Kalau hasilnya SERI
(dua kandidat sama dekat) helper mengembalikan `null` dan sistem TIDAK
menebak, cuma memberi peringatan. Dipakai di impor dan `PUT /api/items/[id]`.
Lokasi yang benar-benar jauh tetap diterima sebagai lokasi baru (custom) —
keputusan user: boleh custom, tapi harus diberi tahu.

**Template** di-generate route `GET /api/items/import/template` (bukan berkas
biner di `public/`) memakai `xlsx` yang sudah jadi dependency. Isi: baris header
+ 2 baris contoh + lebar kolom. `<a download>` dari modal memakai `bp()`.
Unduh template **admin-only** (anon 401).

**UI**: tombol Impor membuka `src/app/admin/items/ImportModal.tsx` (bukan
langsung file picker). Modal memuat: tombol unduh template, tabel susunan kolom
(dari `IMPORT_COLUMNS`), drop zone + input file, dan ringkasan hasil setelah
selesai. Impor jalan otomatis begitu file dipilih.

**PITFALL saat menguji:** `xlsx@0.18.5` **salah membaca berkas lewat PATH** di
lingkungan `tsx` — hasilnya sampah, tapi tidak error. Selalu baca lewat
`read(fs.readFileSync(path), { type: "buffer" })`. Di dalam Next.js (route) hal
ini tidak terjadi.

**PITFALL formData:** `await request.formData()` MELEMPAR kalau Content-Type
bukan multipart/form-data, dan di dalam try/catch route berubah jadi 500
"server rusak" padahal berkasnya cuma tidak terkirim. Pakai
**`formDataAman()`** dari `src/lib/json-body.ts` → balas 400. Dua helper ini
satu keluarga: `jsonBody()` untuk body JSON, `formDataAman()` untuk unggahan
berkas. Jangan pakai `request.formData()` telanjang di route mana pun.
Pemakai: impor barang, TTD user, unggah transaksi, unggah serah terima.

- Kode lokasi custom = inisial kata (2–3 huruf); bentrok → tambah huruf kata
  berikutnya, lalu angka (`locations.ts` → `locationCode()`).
- Tampil di: kartu & list `ItemsClient.tsx`, halaman detail `[id]/page.tsx`,
  kolom baru PDF peminjaman (`pdf-generator.ts`) dan PDF serah terima
  (`handover-pdf-generator.ts`). Pencarian barang ikut mencocokkan kode.

### Label Barang (cetak fisik)
- Generator: `src/lib/label-pdf-generator.ts` (pdf-lib, tanpa dependency baru).
  Mengikuti template "Pelabelan Barang": A4 **landscape**, 2 kolom x 3 baris,
  **5 label per halaman** (baris terakhir sengaja 1 label, sama seperti template).
- API: `POST /api/items/labels` body `{ ids: number[] }` (guard admin/super_admin).
  Balas PDF + header `X-Label-Count` dan `X-Label-Skipped`.
- UI: mode pilih (`selectMode`) di `ItemsClient.tsx` → tombol "Cetak Label (n)"
  di bilah aksi bawah. Menu ini SUDAH ADA sebelumnya (dipakai hapus massal).
- Isi label (urut atas→bawah): Kode Barang (bold) · Nama · Spesifikasi ·
  `No. Inventaris: ...` (**hanya kalau ada**) · `Tanggal Cek: ...` · `Kondisi ...`.
  Logo FMIPA di kanan atas; baris kode dipotong agar tidak menabrak logo.
- **Barang tanpa Kode Barang DILEWATI** — kode TIDAK dibuat otomatis saat cetak
  (keputusan user; barang lama akan dibersihkan/dikosongkan kodenya).
- Uji: `npm run check:label` — geometri (tidak keluar sel / tidak menabrak logo)
  + baca ulang teks PDF nyata (parser content-stream sama seperti `check:pdf`).
- Layout dihitung fungsi murni `planLabels()` supaya bisa diuji tanpa menggambar.
  `ponytail:` kalau perlu ukuran label/stiker khusus (bukan A4), tambahkan preset
  ukuran di `LABEL_GEO` — sekarang hanya A4 landscape.
- Catatan: `pdf-parse` (devDep) v2 TIDAK punya default export seperti asumsi lama —
  jangan pakai untuk uji; pakai parser content-stream di `check-pdf-layout.ts`.

### Dokumen PDF (peminjaman & serah terima)
- Generator PDF ada 2: `src/lib/pdf-generator.ts` (peminjaman, prefix file `PB_`)
  dan `src/lib/handover-pdf-generator.ts` (serah terima, prefix `ST_`).
- Folder upload: `{pending,signed_forms,handovers,signatures}/` → URL publik
  `/uploads/<folder>/<file>` (klien wajib `bp()`/fetch ber-prefix).
- **Folder fisik upload DI LUAR repo:** default `<root>/uploads`, di server
  diarahkan lewat `UPLOAD_DIR=/var/www/inventaris_uploads` (`.env.local`).
  Tujuannya supaya tanda tangan & dokumen bertanda tangan tak mungkin
  ikut ter-commit. **Semua path lewat `src/lib/upload-dir.ts`**
  (`uploadPath(...)` untuk menulis, `uploadPathFromUrl(url)` untuk URL dari DB,
  `isInsideUploadRoot()` untuk cegah `../`). Jangan lagi menulis
  `path.join(process.cwd(), "public", ...)` untuk berkas unggahan.
- **Berkas unggahan TIDAK BOLEH dilayani sebagai berkas statis.** Aturan:
  folder upload jangan pernah ada di dalam `public/`, dan nginx jangan
  `alias` `/uploads/` — dulu keduanya membuat PDF bertanda tangan bisa
  diunduh siapa saja tanpa login. Sekarang penyajiannya lewat
  `src/app/uploads/[...path]/route.ts`: wajib login, admin boleh semua,
  pemilik berkas boleh berkasnya sendiri, selain itu 403.
  (Tidak perlu bind mount lagi; symlink tetap dilarang Turbopack.)
- **`uploads/` DILARANG masuk git.** Isinya tanda tangan asli + dokumen
  bertanda tangan peminjam = data pribadi.
  Jangan pernah `git add -f` ke sana, dan jangan pakai `git add -A`.
  (Riwayat: 3 PNG TTD sempat ter-commit; sudah dibersihkan dari seluruh
  riwayat dengan `git filter-repo --path public/uploads --invert-paths`
  + force-push pada 2026-09-18 — semua hash commit berubah di titik itu.)
- **File upload/regenerate WAJIB ber-prefix** `PB_`/`ST_` + nama unik per id
  (`PB_<nama>_<ddmmyyyy>_<id>_regen.pdf`). Nama tanpa id → tabrakan (hv2↔hv3
  & tx2↔tx3 pernah saling timpa).
- Isi barang PDF WAJIB baca tabel pivot `transaction_items` / `handover_items`
  (transactions.item_id & handovers.item_id = NULL di data lama; fallback ke
  item generik = salah isi dokumen).
- TTD hv diambil live dari `users.signature_url` (URL publik `/uploads/signatures/...`
  — path absolut bikin silent skip). Tabel `handovers` TIDAK punya kolom
  `signature_url` meski schema.ts mendeklarasikannya.
- Konvensi pdf-lib: `drawText` y = baseline teks (naik ke atas); `drawImage`
  y = BOTTOM image (image naik ke atas) — jangan kurangi `sigDims.height`.
  `drawLine` y = posisi garis.
- Blok TTD+nama peminjam (kolom kanan) mengikuti pola serah terima:
  nama bold + underline paling bawah; TTD bottom di `nama+12`.
- Kolom kiri/tengah PDF peminjaman ("Penerima Barang Kembali", "Divisi Informasi
  Teknologi"): garis TTD manual DI ATAS tulisan, digeser sehingga garisnya
  sejajar underline nama peminjam; jarak ke "Ketentuan Peminjaman:" jaga ≥ 8pt.
- UI admin: "Generate Ulang" tampil saat URL="deleted" ATAU file fisik hilang
  (`documentMissing` — `existsSync` di route admin).
- **Penanda `"deleted"` JANGAN disapu sebagai sampah.** Admin menghapus dokumen
  → berkas fisiknya dibuang, tapi `signed_document_url` diisi `'deleted'`
  (bukan `NULL`) supaya jejaknya tetap ada dan tombol "Buat Ulang Dokumen"
  muncul. `deleteUploadByUrl()` sengaja no-op untuk nilai ini
  (`src/lib/delete-upload.ts`). Penyebabnya: `admin/documents/delete` &
  `bulk-delete`.
- **Hapus baris DB selalu lewat APLIKASI, jangan `DELETE` langsung.**
  Aplikasi membuang berkas fisiknya di empat jalur pembatalan: user batalkan
  serah terima, admin tolak serah terima, user batalkan peminjaman, admin tolak
  peminjaman (`deleteUploadByUrl`). Lewat `DELETE` manual, berkasnya
  **ketinggalan** di disk tanpa rujukan. Pembersihnya:
  `npx tsx scripts/check-berkas-tak-terpakai.ts` (`--hapus` untuk membuang).

### Ketersediaan Barang (`can_borrow` / `can_handover`)

Dua flag manual per barang (bukan hitungan otomatis). Admin menentukannya di
form tambah/edit barang lewat 2 dropdown "Peminjaman" & "Serah Terima"
(Tersedia / Tidak Tersedia). Bawaan keduanya `1`.

Arti:
- `can_borrow = 0` → barang disembunyikan dari halaman **Pinjam** user.
- `can_handover = 0` → disembunyikan dari halaman **Serah Terima** user.
- Keduanya `0` → tak muncul di dua halaman user, tapi TETAP ada di daftar
  barang admin & riwayat.

**Admin TIDAK bisa menimpa aturan ini** (keputusan pemilik produk, Sep 2026) —
harus ubah flag dulu. Endpoint yang WAJIB menolak bila flag mati:
`/api/pinjam`, `/api/transactions`, `/api/transactions/[id]/correct`,
`/api/handovers`, `/api/admin/handovers`, `/api/admin/handovers/[id]/correct`,
`/api/public/borrow` (endpoint lama).

Titik filter (jangan lupa bila menambah daftar barang baru):
- `GET /api/items?canBorrow=1` / `?canHandover=1` (query param opsional).
- Halaman user: `dashboard/pinjam` (`canBorrow`), `dashboard/serah-terima`
  (`canHandover` + `availableQuantity>0` + `quantity>0`).
- Modal admin: `BorrowModal` (`canBorrow=1`), `HandoverModal` (`canHandover=1`),
  `CorrectItemsModal` (param ikut prop `type`), `transactions/new`.
- Label status di `ItemsClient.tsx` (kartu & list) + `admin/items/[id]`.
- Filter dropdown "Semua Peminjaman"/"Semua Serah Terima" di `ItemsClient.tsx`.

**Jangan pakai `Boolean(nilai)` untuk flag ini** — `Boolean("0")` = `true`.
Pakai helper `toBool()` dari `src/lib/to-bool.ts`.

### Bisa Dilabeli (`is_labelable`)

Flag manual per barang, sejajar `can_borrow`/`can_handover` (dropdown "Label" di
form tambah/edit). Bawaan `1`. Diset `0` untuk barang yang **secara fisik tidak
mungkin ditempeli label** — kabel, dongle wifi, adaptor: permukaannya kecil atau
tidak rata sehingga label lepas/hilang.

Syarat cetak label (DUA-duanya, dicek di `src/app/api/items/labels/route.ts`):
1. punya `item_code` (barang lama bisa NULL), dan
2. `is_labelable = 1`.

Baris yang gagal syarat **DILEWATI**, bukan memblokir seluruh permintaan. Header
balasan merinci sebabnya: `X-Label-Count` (jumlah label jadi), `X-Label-Skipped`
(total dilewati), `X-Label-NoCode`, `X-Label-NotLabelable` — UI memakainya untuk
pesan toast yang tepat.

Di `ItemsClient.tsx`, mode pilih dipisah dua (`selectMode`: `"label"` | `"hapus"`)
supaya "bisa dilabeli" tak ikut membatasi hapus massal:

- Mode **Cetak Label**: bar "Pilih Semua" hanya memilih baris yang lolos syarat
  label. Tombol Cetak Label disabled bila 0 baris terpilih yang lolos.
- Mode **Hapus**: "Pilih Semua" memilih seluruh baris hasil filter, tanpa syarat.
- Baris dengan `is_labelable = 0` diberi badge kuning "Tidak bisa dilabeli"
  (3 titik render: kartu grid, baris mobile, baris desktop). Checkbox-nya TETAP
  aktif supaya tetap bisa dihapus massal.

`quantity > 1` **BUKAN** penghalang — generator mencetak 1 label per baris
(label mewakili lot), dan kode barang memang per baris, bukan per unit.


---

## 10. Hal yang Perlu Diperhatikan Saat Pengembangan

1. **Middleware berjalan di Edge Runtime** — jangan import library Node.js (bcrypt, fs, dll) di `middleware.ts`. Gunakan `getToken()` dari `next-auth/jwt` saja.

2. **`transactions.itemId` nullable** — sejak multi-item, `itemId` di tabel transactions bisa `null`. Selalu cek null sebelum pakai di query Drizzle.

3. **Stock management** — stok dikurangi saat `POST /api/pinjam`. Dikembalikan saat: transaksi ditolak, dihapus, atau dikembalikan. Jangan lupa update kedua tabel: `items.availableQuantity` dan `items.status`.

4. **PDF generator** — fungsi `generateBorrowingPDF()` di `src/lib/pdf-generator.ts` sudah support multi-halaman otomatis. Jika menambah kolom baru di tabel PDF, sesuaikan `colWidths` agar total = `CONTENT_W` (483.28px).

5. **Auth callback** — setelah Google OAuth, user selalu diarahkan ke `/auth/callback` yang membaca role dari DB dan redirect ke tempat yang benar.

6. **Badge sidebar** — `UserSidebar` fetch `/api/user/transactions/summary` setiap 30 detik untuk update badge `pending_signature`.

7. **Alur request auth di belakang gateway** — Next.js basePath otomatis strip prefix saat route matching. Request publik `/empati/api/auth/providers` sampai route handler sebagai `/api/auth/providers`; handler (route.ts) menambah prefix kembali (addBase) karena Auth.js dikonfigurasi `basePath = ${BASE}/api/auth` (agar callback URL Google menyertakan prefix). Jangan pindahkan route handler ke folder `src/app/empati/api/auth/` — itu pernah dicoba dan GAGAL (pathname Auth.js tidak cocok). Route handler WAJIB di `src/app/api/auth/[...nextauth]/route.ts`.

8. **`images.unoptimized` jangan dihapus** — workaround bug image optimizer Next 16 yang 400 "received null" untuk semua gambar lokal di `public/`. Tanpa ini logo & gambar lain tidak muncul.

9. **Sidebar admin active state** — `Sidebar.tsx` memakai `navItemsAll` (navItems + item "Dokumen" `/admin/documents` khusus super_admin) untuk menghitung `bestMatch`. Jangan hitung bestMatch hanya dari `navItems` dasar, atau item yang di-append di luar (Dokumen) tak akan pernah kehover.

10. **Brand tampilan = "Management logistic"** — dipakai di SEMUA tempat: `metadata.title` tiap halaman, teks di bawah logo (`Sidebar.tsx`, `UserSidebar.tsx`), landing (`app/page.tsx`), katalog, login, `PinjamFlow.tsx`. Kalau ganti lagi, sisir semua file (pernah 14 kemunculan) — jangan hanya layout.tsx.

11. **Logo mode gelap** — pakai komponen klien `src/components/Logo.tsx`: mode terang `fmipa-logo.png`, mode gelap `fmipa-logo-kuning.png`. Wrapper-nya WAJIB `dark:bg-transparent` (kalau tetap putih, logo kuning tak terbaca di atas putih). Halaman server-component tak bisa pakai hook tema — pakai komponen ini.
    - Katalog publik (`(public)/katalog`) tidak punya dark mode → logo statis di sana aman.

12. **Barang habis karena DISERAHKAN: DISEMBUNYIKAN, BUKAN DIHAPUS** *(berubah 24 Sep 2026 — dulu otomatis dihapus)* — begitu stok FISIK (`quantity`) jadi 0 lewat serah terima, barangnya **TETAP ADA di tabel `items`**, hanya tak tampil di daftar. Alasannya: unitnya **bisa kembali** ke inventaris, dan saat dikembalikan admin mencarinya **lewat kode barang** — barang yang sudah dihapus tak bisa ditemukan.

    **Patokannya `quantity`, BUKAN `availableQuantity`.** Barang yang sedang DIPINJAM juga bisa punya `availableQuantity = 0` padahal barangnya bakal kembali; yang habis sungguhan hanya yang `quantity`-nya 0. Jangan tertukar. **Alur PEMINJAMAN tidak disentuh sama sekali** oleh aturan ini.

    Penyaringan `quantity > 0` sudah ada di 7 tempat (daftar admin, katalog publik, kotak pilih pinjam, kotak pilih serah terima, kartu dashboard) — itulah yang "menyembunyikan". **Tidak ada penghapusan otomatis di jalur mana pun.**

    Tampilan daftar barang (`src/app/admin/items/`):
    - `page.tsx` mengirim **SEMUA** barang (tanpa saringan) + prop `canSeeHidden`.
    - **admin** → tersembunyi, ada tombol `Tampilkan yang habis (N)` yang membuka/menutup.
    - **super_admin** → tampil langsung, bertanda `Habis`, tanpa tombol.
    - Penyaringan dilakukan di klien (`showHidden`), BUKAN di server — karena bergantung peran.
    - Badge status: `quantity === 0` → **"Habis"** (bukan "Dipinjam" — pinjaman tak pernah menurunkan stok fisik). Dipasang di TIGA tempat render (kartu grid, baris list desktop, baris mobile).

    **Penjaga di jalur hapus manual** (`src/app/api/items/[id]/route.ts` + `bulk-delete/route.ts`):
    - **F1** — barang yang masih dipegang (pinjaman/serah terima belum selesai) tidak boleh dihapus (`barangSedangDipakai`).
    - **F2** — **barang `quantity = 0` TERKUNCI**, tidak bisa dihapus, pesannya "unitnya mungkin kembali".
    - Barang `quantity > 0` **tetap bisa dihapus** seperti biasa (jangan over-kunci — admin perlu membuang barang salah input/rusak).

    **Stok 0 hanya boleh lahir dari serah terima.** `PUT /api/items/[id]` menolak **menurunkan** stok ke 0 (`berkurangKeNol`); barang yang SUDAH 0 tetap boleh disimpan apa adanya supaya admin bisa membetulkan nama/lokasinya. Form edit (`min`) ikut menyesuaikan agar tak terkunci sendiri. Ini yang menutup celah "barang tersembunyi tapi tak punya unit di luar → nyangkut".

    - Penjaga: `scripts/check-barang-habis.ts` (15 pemeriksaan) — `npm run check:habis`.
    - **Perilaku lama yang dibatalkan:** `hapusBarangHabis()` sudah DIHAPUS dari `src/lib/item-in-use.ts` beserta pemanggilannya di DUA pintu serah terima, dan `snapshotSebelumHapus()` **tidak lagi** dipanggil di jalur serah terima (karena tak ada yang dihapus). Snapshot tetap dipakai di jalur hapus manual.
    - **Konsekuensi data:** barang yang sudah telanjur terhapus oleh aturan lama **tidak dipulihkan** (keputusan user). Mulai 24 Sep 2026 perilaku barunya berlaku.


    Filter `gt(items.quantity, 0)` tetap ada di: `/api/items`, katalog, statistik dashboard, `/api/stats`. **`admin/items/page.tsx` TIDAK lagi menyaring** — semua barang dikirim, penyaringan di klien per peran (lihat di atas).
    - Menghapus barang dari menu admin **diperbolehkan** untuk stok >0 (tombol Hapus di kartu). FK CASCADE di `schema.ts` TIDAK ADA di MySQL produksi, jadi baris riwayat tidak ikut terhapus; nama barangnya diamankan snapshot (`snapshotSebelumHapus()`). Lihat bagian "Riwayat ↔ Data Barang".

13. **`toBool()` untuk flag boolean dari JSON** — `Boolean("0")` bernilai `true` di JS. Semua flag `can_borrow`/`can_handover` wajib lewat `toBool()` (`src/lib/to-bool.ts`), jangan `Boolean()`.

14. **Mode gelap: kelas ber-opasitas TIDAK ikut ter-remap** — proyek ini menggelapkan tampilan lewat pemetaan di `src/app/globals.css` (`.dark .bg-gray-50 { ... !important }`), mencocokkan **nama kelas Tailwind**. Masalahnya `bg-indigo-50/50` menghasilkan token CSS yang BERBEDA dari `bg-indigo-50`, jadi `.dark .bg-indigo-50` tidak cocok — kotaknya tetap terang dengan tulisan gelap dan nyaris tak terbaca.

    Aturan: setiap kali memakai kelas berwarna **ber-opasitas** (`bg-x-50/50`, `border-x-100/50`, `text-x-700/80`), tambahkan pasangannya di blok "Varian ber-opasitas" `globals.css`. Blok itu juga menangani `shadow-xl` (hanya `sm/md/lg` yang di-remap) dan `bg-black/40` (hanya `/50`).

    **Cara memeriksa:** sisir `src/` untuk `\b(bg|border|text)-[a-z]+-[0-9]+/[0-9]+` lalu bandingkan dengan daftar di `globals.css`; yang tak punya pasangan akan salah warna di mode gelap. Warna gelap yang memang sengaja gelap (`bg-indigo-900/30`) tidak perlu dipasangkan.

    Termudah dicek langsung: buka modal di mode gelap — kotak berwarna terang = kelasnya belum dipasangkan.

15. **Semua route mutasi WAJIB pakai `jsonBody()` untuk baca body** — `src/lib/json-body.ts`. `await request.json()` melempar `SyntaxError` kalau body kosong / JSON rusak; karena hampir semua route membungkus isinya dengan `try/catch`, error itu berubah jadi **500 "Terjadi kesalahan"** yang menyesatkan (harusnya 400). Dulu 20 route kena. Pola yang benar:

    ```ts
    const body = await jsonBody(request);
    if (!body) return NextResponse.json({ error: "Body permintaan tidak valid" }, { status: 400 });
    ```

    Jangan pakai `request.json()` telanjang lagi. Satu-satunya pengecualian: route yang memang butuh `formData()` (upload TTD/berkas).

16. **Barang yang "sedang dipegang" tidak boleh dihapus / diramping** — `src/lib/item-in-use.ts` (`barangSedangDipakai()` + `pesanBarangDipakai()`).

    Definisi "dipegang": dirujuk transaksi berstatus `pending_signature`/`pending_approval`/`active`/`overdue`, ATAU serah terima `pending_signature`/`pending_approval`.

    - `DELETE /api/items/[id]` dan `POST /api/items/bulk-delete` → **400** + nomor transaksinya. Hapus massal ditolak SELURUHNYA kalau ada satu saja yang dipegang (tidak sebagian-lalu-berhenti).
    - `PUT /api/items/[id]` → `quantity` tidak boleh lebih kecil dari `quantity - availableQuantity` (= unit yang sedang keluar) → **400** + angkanya.

    **Penting:** penghapusan otomatis (`hapusBarangHabis()`, nomor 12) memakai penjagaan yang sama — kalau ada pinjaman belum selesai, penghapusan DITAHAN, bukan dipaksa.

17. **`/api/public/borrow` = endpoint lama katalog, aturannya disamakan dengan `/api/pinjam`** — halaman `/katalog` sudah tidak punya menu/link ke sana, tapi alamatnya masih bisa dibuka langsung, jadi tetap dijaga:

    - status `pending_approval` (BUKAN `active`) — admin tetap menyetujui
    - identitas peminjam dari **SESI**, bukan body (body hanya `itemId`, `quantity`, `returnDate`, `purpose`, `location`)
    - wajib NIM + TTD

    Kalau menambah field identitas di body endpoint ini, itu regresi keamanan. Form di `KatalogClient.tsx` sengaja tidak lagi menanyakan nama/divisi/email/HP.

---

## 11. Fitur yang Belum Diimplementasi (Backlog)

- [ ] Notifikasi email ke user saat transaksi diapprove/reject
- [ ] Halaman ganti password untuk super_admin/admin native di dalam dashboard
- [ ] Export laporan transaksi ke Excel
- [ ] Pagination pada halaman riwayat admin (saat ini load semua)
- [ ] Cron job otomatis ubah status `active` yang melewati deadline ke `overdue`
- [ ] Push notification (PWA) untuk reminder pengembalian barang
- [ ] QR code pada formulir PDF untuk verifikasi

### DITUNDA — Ganti barang di transaksi yang sudah disetujui
**Keputusan user (22 Sep 2026): dibiarkan dulu, tidak perlu sekarang.**

Kasusnya: admin salah **memilih barang** (bukan salah ketik nama) — mis. sistem
mencatat Laptop #10 padahal fisik yang diserahkan Laptop #11.

Kesimpulan user: **sudah cukup terantisipasi** oleh fitur koreksi yang ada,
karena `correct` (`/api/transactions/[id]/correct`) bisa mengganti barang
selama status masih `pending_approval` — yaitu saat kesalahan masih bisa
disadari, sebelum dokumen berjalan. Kesalahan yang baru ketahuan SETELAH
disetujui dianggap jarang dan tidak sepadan biaya fiturnya.

Jadi: **jangan tambahkan fitur "edit barang" untuk transaksi aktif/selesai
tanpa persetujuan user dulu.** Kalau nanti diminta, yang perlu dikerjakan:
- Pindahkan stok: barang lama `+qty`, barang baru `-qty` (tolak kalau stok
  barang baru tidak cukup, jangan sampai minus)
- Kalau transaksi sudah `returned`, stok sudah normal sendiri → cukup
  perbaiki catatannya, jangan sentuh stok
- Snapshot baris riwayat ikut diperbarui (sudah ditangani `correct` yang ada)

Bedakan dari kasus **salah ketik NAMA** barang: itu cukup lewat edit barang
di menu data barang, dan riwayat ikut benar sendiri. Lihat bagian
"Riwayat ↔ Data Barang" di Konvensi Kode.

---

## 12. Deployment Checklist

> Checklist di bawah = kewajiban sebelum commit/perubahan sourcecode. Yang
> berhubungan server/domain (nginx, PM2 startup, SSL, gateway) ada di DEPLOY.md.

- [ ] `npm run typecheck` → 0 errors
- [ ] `npm run build` berhasil tanpa error
- [ ] `.env.local` TIDAK ikut ter-commit (ada di .gitignore)
- [ ] Tidak ada hardcode path (`/empati`, dst) — semua baca env `NEXT_PUBLIC_BASE_PATH` (5 titik di bagian 6)
- [ ] Jika menambah endpoint API yang dipanggil client: pastikan lewat fetch normal (BasePathProvider otomatis menambah prefix) — jangan hardcode `/empati` di URL fetch
- [ ] Jika menambah gambar lokal di `public/`: `next/image` aman karena `images.unoptimized` (jangan hapus opsi ini)
- [ ] Jika mengubah schema DB: tambahkan migrasi SQL manual di `database/` — JANGAN `drizzle-kit push` di produksi (bisa gagal pada index FK)
- [ ] Jika mengubah alur auth: cek 5 lapis basePath tetap sinkron (bagian 6)
- [ ] Semua migrasi DB sudah dijalankan (lihat bagian 8)
- [ ] `npm run check:snapshot` → setiap pemakaian `namaSql*` punya tabel sumbernya (WAJIB jika menyentuh query riwayat/dokumen)
- [ ] Kalau menyentuh jalur hapus barang atau serah terima: `npm run check:habis` (WAJIB — pastikan barang habis diserahkan TETAP ADA & tersembunyi, bukan terhapus)
- [ ] Kalau menyentuh riwayat/tanggal: `npx tsx scripts/check-terlambat.ts`
- [ ] Kalau menyentuh impor: `npx tsx scripts/check-import-fix.ts`
- [ ] Tidak ada berkas unggahan di dalam `public/` (cek: `ls public/uploads` harus kosong) — urusan server, DEPLOY.md
- [ ] Kalau menyentuh berkas unggahan: pakai helper `src/lib/upload-dir.ts`, jangan `path.join(process.cwd(), "public", ...)`
- [ ] Kalau menghapus baris DB yang punya dokumen: buang berkasnya lewat `deleteUploadByUrl()`, lalu cek `npx tsx scripts/check-berkas-tak-terpakai.ts`
