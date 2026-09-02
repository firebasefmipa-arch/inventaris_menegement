# Database

## File yang ada

| File | Keterangan |
|---|---|
| `schema_only.sql` | Struktur tabel lengkap tanpa data — untuk restore manual di server baru |

---

## Setup Database Baru

### Cara 1 — Otomatis via Drizzle (disarankan)

Pastikan `DATABASE_URL` sudah diisi di `.env.local`, lalu jalankan:

```bash
npx drizzle-kit push
```

Drizzle akan membaca schema dari `src/db/schema.ts` dan membuat/memperbarui
tabel di database sesuai schema terkini.

### Cara 2 — Manual via SQL

Jika ingin restore dari file SQL (misalnya di server baru tanpa Node.js):

```bash
mysql -u USER -p NAMA_DATABASE < database/schema_only.sql
```

Ganti `USER` dan `NAMA_DATABASE` sesuai konfigurasi server kamu.

---

## Menambah Kolom / Mengubah Schema

1. Edit `src/db/schema.ts`
2. Jalankan `npx drizzle-kit push` — Drizzle akan otomatis mendeteksi
   perubahan dan menerapkannya ke database

> **Catatan:** Jangan edit file SQL secara manual untuk perubahan schema.
> Selalu edit `src/db/schema.ts` sebagai *source of truth*.

---

## Environment

Database URL dikonfigurasi melalui variabel `DATABASE_URL` di file `.env.local`
(tidak di-commit ke git). Format:

```
DATABASE_URL=mysql://USER:PASSWORD@HOST:PORT/NAMA_DATABASE
```
