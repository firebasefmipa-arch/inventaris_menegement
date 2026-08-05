# 📦 PinjamBarang — Sistem Manajemen Peminjaman Barang

Aplikasi web fullstack untuk mengelola peminjaman barang/aset internal,
lengkap dengan **dashboard admin** dan **portal peminjaman mandiri** untuk
user.

![Stack](https://img.shields.io/badge/Next.js%2016-000?style=flat&logo=nextdotjs) ![DB](https://img.shields.io/badge/MySQL%20%2F%20MariaDB-4479A1?style=flat&logo=mysql&logoColor=white) ![ORM](https://img.shields.io/badge/Drizzle%20ORM-C5F74F?style=flat&logo=drizzle&logoColor=000) ![CSS](https://img.shields.io/badge/Tailwind%20CSS%204-06B6D4?style=flat&logo=tailwindcss&logoColor=white)

---

## ✨ Fitur

### 🖥️ Dashboard Admin (`/`)
- Statistik realtime: total barang, tersedia, dipinjam, peminjam, transaksi aktif, keterlambatan
- Daftar barang dengan pencarian, filter kategori & status — `src/app/(admin)/items`
- CRUD barang (tambah, edit, detail + riwayat, hapus)
- Manajemen peminjam — `src/app/(admin)/borrowers`
- Transaksi + pengembalian satu klik (stok otomatis kembali) — `src/app/(admin)/transactions`

### 🌐 Portal Peminjaman Mandiri (`/pinjam`)
- Tanpa login, 3 langkah: **Pilih Barang → Isi Data Diri → Kode Peminjaman**
- Katalog dengan progress bar stok realtime
- Peminjam lama otomatis dikenali lewat email/no. HP
- Kode peminjaman unik (`PB-0007`) yang bisa disalin — bukti untuk mengambil barang
- Stok otomatis terkunci saat permintaan dibuat

## 🧱 Struktur Proyek

```
├── drizzle/                    # File migrasi SQL hasil drizzle-kit generate
│   ├── 0000_init.sql           # Migrasi awal (enum + 3 tabel + FK)
│   └── meta/                   # Snapshot & journal migrasi
├── database/                   # 💾 Resource database siap pakai
│   ├── app_db_full.sql         # Dump penuh (schema + data contoh)
│   ├── schema.sql              # Struktur saja
│   ├── seed.sql                # Data contoh saja
│   └── README.md               # Panduan restore/setup
├── src/
│   ├── db/
│   │   ├── index.ts            # Koneksi Drizzle + pool mysql2
│   │   ├── schema.ts           # ⭐ Source of truth schema (3 tabel + 2 enum)
│   │   └── seed.ts             # Seed TypeScript (npm run db:seed)
│   ├── components/
│   │   ├── Sidebar.tsx         # Navigasi admin
│   │   └── Toaster.tsx         # ToastProvider + useToast hook
│   └── app/
│       ├── layout.tsx          # Root layout (font, toast)
│       ├── (admin)/            # 🔒 Route group: layout sidebar + semua halaman admin
│       │   ├── layout.tsx
│       │   ├── page.tsx        # Dashboard
│       │   ├── items/          # List, tambah, detail, edit barang
│       │   ├── borrowers/      # List + tambah peminjam
│       │   └── transactions/   # List, pinjam baru (admin), pengembalian
│       ├── pinjam/             # 🌐 Portal publik peminjaman mandiri
│       │   ├── page.tsx        # Server component: ambil barang tersedia
│       │   └── PinjamFlow.tsx  # Client component: wizard 3 langkah
│       └── api/
│           ├── health/         # Healthcheck
│           ├── items/          # CRUD barang (+/[id])
│           ├── borrowers/      # List + create peminjam
│           ├── transactions/   # List + create, PUT [id] untuk pengembalian
│           ├── pinjam/         # POST: permintaan mandiri (auto-find/create borrower)
│           └── stats/          # Statistik dashboard
├── drizzle.config.json         # Konfigurasi Drizzle Kit (dialect, schema, out)
├── .env.example                # Contoh environment variable
└── package.json
```

## 🗄️ Database

**MySQL 8+ / MariaDB 10.11+** — 3 tabel + 2 enum inline:

| Tabel         | Kolom utama                                                                              |
| ------------- | ---------------------------------------------------------------------------------------- |
| `items`       | name, category, description, quantity, available_quantity, status (enum), location, ...  |
| `borrowers`   | name, email, phone, department                                                           |
| `transactions`| item_id → FK, borrower_id → FK, quantity, status (enum), borrow_date, expected_return_date, actual_return_date |

Enum: `status` pada items (`available`/`borrowed`/`maintenance`),
`status` pada transactions (`active`/`returned`/`overdue`).

**Source of truth** ada di `src/db/schema.ts`. Semua artefak (migrasi +
dump SQL) sudah tersedia — lihat [`database/README.md`](database/README.md).

## 🚀 Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Setup env
cp .env.example .env   # sesuaikan DATABASE_URL

# 3. Setup database — salah satu cara:
npm run db:push && npm run db:seed                       # via Drizzle (dev)
# ATAU
mysql -h 127.0.0.1 -u root -p app_db < database/app_db_full.sql   # via SQL dump

# 4. Jalankan
npm run dev          # development
npm run build && npm start   # production
```

Portal user: **http://localhost:3000/pinjam** · Dashboard admin: **http://localhost:3000**

## 📜 NPM Scripts

| Script              | Fungsi                                              |
| ------------------- | --------------------------------------------------- |
| `npm run dev`       | Dev server (Turbopack)                              |
| `npm run build`     | Production build                                    |
| `npm run db:push`   | Sinkron `src/db/schema.ts` → database (tanpa migrasi) |
| `npm run db:generate`| Buat file migrasi baru di `drizzle/`               |
| `npm run db:migrate`| Jalankan migrasi ke database                       |
| `npm run db:seed`   | Reset & isi data contoh                            |
| `npm run db:studio` | GUI browser database (Drizzle Studio)              |
