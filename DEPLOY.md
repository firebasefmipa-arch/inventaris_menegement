# Panduan Deploy Manual — Manajemen Inventaris FMIPA UII

> Dokumen ini adalah panduan deploy nyata di server produksi, hasil belajar
> dari pengalaman langsung. Ikuti urutannya — jangan loncat langkah.
>
> **PENTING — arsitektur publik domain:**
> Aplikasi ini TIDAK diakses dari domain sendiri. Ia menumpang di sub-path pada
> domain milik orang lain (WordPress/gateway UII). Akibatnya ada aturan emas:
>
> **SEMUA URL yang keluar dari aplikasi (CSS/JS, link, fetch, callback login
> Google) HARUS diawali base path publik.** Kalau tidak, request "dimakan"
> gateway/WordPress dan tidak pernah sampai ke aplikasi.
>
> Ini yang membuat deploy base-path lebih rumit dari deploy biasa, dan kenapa
> dokumen ini terlihat panjang. **Baca bagian "Pilih Skenario" dulu** — semua
> langkah memakai variabel `[DOMAIN]`, `[FORWARD_HOST]`, `[BASE_PATH]` yang
> nilainya beda per skenario.

---

## Pilih Skenario Deploy

| | **A. Sub-path di domain gateway** (kondisi sekarang) | **B. Sub-path di domain lain** (masih gateway) | **C. Subdomain/domain sendiri** (tanpa gateway) |
|---|---|---|---|
| Contoh URL | pharmacy.uii.ac.id/empati | science.uii.ac.id/inventaris | inventaris.uii.ac.id |
| `[DOMAIN]` | `pharmacy.uii.ac.id` | `science.uii.ac.id` | `inventaris.uii.ac.id` |
| `[FORWARD_HOST]` (nginx) | `pharmacy.uii.ac.id` | `science.uii.ac.id` | `inventaris.uii.ac.id` |
| `[BASE_PATH]` (env) | `/empati` | `/inventaris` | **KOSONG** (hapus baris) |
| nginx rewrite prefix | perlu | perlu | **tidak perlu** |
| SSL dari mana | gateway (Cloudflare) | gateway (Cloudflare) | **certbot sendiri** |
| Butuh admin domain/gateway? | sudah beres | ya — arahkan path ke IP server | ya — DNS A record ke IP server + buka port 80/443 |
| Google redirect URI | `https://[DOMAIN][BASE_PATH]/api/auth/callback/google` | sama | `https://[DOMAIN]/api/auth/callback/google` (tanpa path) |

> Ringkasan aturan: **A & B identik secara teknis** — bedanya hanya nilai domain.
> **C berbeda total** karena tidak ada gateway yang strip prefix → app jalan di
> root, tanpa basePath. Semua langkah di bawah memakai variabel; isi sesuai
> skenario kamu.

---

## Ringkasan Alur Request (Skenario A & B)

```
Browser
  → https://[DOMAIN][BASE_PATH]/...
    → Gateway UII (WordPress di depan domain)
      → HANYA path berawalan [BASE_PATH] yang diteruskan, prefix-nya DIBUANG
        (kadang menjadi dobel slash //x)
      → Server ini (IP internal :80)
        → Nginx (pasang prefix [BASE_PATH] kembali + override X-Forwarded-Host)
          → Next.js (localhost:3000, basePath=[BASE_PATH])
```

Path TANPA `[BASE_PATH]` (mis. `/api/...`, `/_next/...`, `/`) **tidak pernah
sampai** ke aplikasi — dijawab gateway/WordPress sendiri.

Skenario C: Browser → DNS → IP server → Nginx (proxy root, tanpa rewrite) →
Next.js (basePath kosong). Tidak ada gateway di tengah.

---

## Langkah 0 — Yang Kamu Butuhkan

- Server Ubuntu (20.04/22.04+) akses root
- Nilai `[DOMAIN]`, `[FORWARD_HOST]`, `[BASE_PATH]` sesuai skenario (tabel atas)
- Skenario A/B: gateway sudah diarahkan ke IP server ini
- Skenario C: DNS domain → IP server ini (dan port 80/443 terbuka)
- Akun Google Cloud (untuk OAuth login, lihat Langkah 9)

---

## Langkah 1 — Install Software di Server

```bash
sudo apt update && sudo apt upgrade -y

# Node.js versi 20+ (produksi memakai v26 — apa pun ≥20 aman)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# PM2 (jalankan aplikasi di background)
sudo npm install -g pm2

# MySQL
sudo apt install -y mysql-server
sudo mysql_secure_installation

# Nginx
sudo apt install -y nginx
```

Skenario C tambahan (SSL):

```bash
sudo apt install -y certbot python3-certbot-nginx
```

---

## Langkah 2 — Buat Database & User MySQL

```bash
sudo mysql -u root -p
```

```sql
CREATE DATABASE modern_lending CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'inventaris'@'localhost' IDENTIFIED BY 'GANTI-DENGAN-PASSWORD-KUAT';
GRANT ALL PRIVILEGES ON modern_lending.* TO 'inventaris'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

**Import struktur tabel** (setelah clone repo, Langkah 3):

```bash
mysql -u inventaris -p modern_lending < database/schema_only.sql
```

> Kalau tabel sudah ada tapi ada kolom kurang (gejala: error
> `Unknown column 'xxx' in 'field list'`), **jangan** jalankan `drizzle-kit push`
> otomatis — dia bisa gagal/merusak index foreign key. Tambahkan manual:
> ```sql
> ALTER TABLE <nama_tabel> ADD COLUMN <nama_kolom> varchar(255) NULL;
> ```
> (Contoh nyata: `ALTER TABLE handovers ADD COLUMN location varchar(255) NULL;`)

---

## Langkah 3 — Clone & Install Aplikasi

```bash
cd /var/www
git clone <url-repo> inventaris_menegement
cd inventaris_menegement
npm install
```

---

## Langkah 4 — Buat File .env.local

```bash
nano /var/www/inventaris_menegement/.env.local
```

Isi (nilai sesuai skenario):

```env
DATABASE_URL=mysql://inventaris:PASSWORD_DB@127.0.0.1:3306/modern_lending
NEXTAUTH_URL=https://[DOMAIN][BASE_PATH]
NEXTAUTH_SECRET=<generate: openssl rand -base64 32>
ENCRYPTION_KEY=<generate: openssl rand -hex 32>
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Skenario A/B — WAJIB. Prefix sub-path publik (mis. /empati).
# Skenario C — HAPUS/kosongkan baris ini (app di root).
NEXT_PUBLIC_BASE_PATH=[BASE_PATH]
```

**Aturan emas:**
- Skenario A/B: `NEXT_PUBLIC_BASE_PATH` dan path di `NEXTAUTH_URL` harus SAMA.
  Kalau salah satu kosong/tidak konsisten → styling hilang atau login rusak.
- Skenario C: `NEXT_PUBLIC_BASE_PATH` tidak boleh ada (kosong = app di root).

---

## Langkah 5 — Buat Akun Superadmin

```bash
npx tsx scripts/create-super-admin.ts
```

Isi nama, email, password, no HP, departemen. Catat email + password — dipakai
login di `/admin/login`.

> Kalau akun sudah ada tapi tidak bisa login, tidak ada cara melihat password
> (hash bcrypt satu arah). Hapus dari DB lalu buat ulang:
> ```sql
> DELETE FROM user WHERE email='email-lama@example.com';
> ```
> lalu jalankan script di atas lagi.

---

## Langkah 6 — Buat Folder Upload

```bash
mkdir -p /var/www/inventaris_menegement/public/uploads/signed_forms
mkdir -p /var/www/inventaris_menegement/public/uploads/handovers
mkdir -p /var/www/inventaris_menegement/public/uploads/pending
mkdir -p /var/www/inventaris_menegement/public/uploads/signatures
chmod -R 755 /var/www/inventaris_menegement/public/uploads/
```

---

## Langkah 7 — Build & Jalankan Aplikasi

```bash
cd /var/www/inventaris_menegement
npm run build

# Skenario A/B:
pm2 start npm --name "pinjam-app" -- start
# Skenario C:
pm2 start npm --name "pinjam-app" -- start   # (nama bebas, cuma label)

pm2 save
pm2 startup    # ikuti output-nya, agar auto-start setelah reboot
```

Cek jalan:

```bash
# Skenario A/B:
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000[BASE_PATH]   # → 200
# Skenario C:
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000              # → 200
```

---

## Langkah 8 — Konfigurasi Nginx (PALING PENTING)

Buat file `/etc/nginx/sites-available/inventaris`.

### Skenario A/B (ada gateway strip prefix):

```nginx
# App Next.js basePath=[BASE_PATH]; gateway strip prefix lalu kirim sisa path
# (bisa //x) ke sini. Nginx memasang KEMBALI [BASE_PATH].
server {
    listen 80;
    server_name _;

    client_max_body_size 10M;
    merge_slashes off;

    # File upload dilayani langsung Nginx
    location /uploads/ {
        alias /var/www/inventaris_menegement/public/uploads/;
        expires 7d;
        add_header Cache-Control "public";
    }

    # Semua request: tambahkan prefix [BASE_PATH] kembali, lalu proxy ke Next
    location / {
        rewrite ^/$ [BASE_PATH] break;
        rewrite ^//+(.*)$ [BASE_PATH]/$1 break;
        rewrite ^/(.+)$ [BASE_PATH]/$1 break;
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        # WAJIB: override X-Forwarded-Host. Tanpa ini, Server Actions Next.js
        # (submit form, login) ditolak "Invalid Server Actions request" karena
        # gateway mengirim Host IP internal yang tidak cocok Origin browser.
        proxy_set_header X-Forwarded-Host [FORWARD_HOST];
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Skenario C (tanpa gateway — proxy root langsung):

```nginx
server {
    listen 80;
    server_name [DOMAIN];

    client_max_body_size 10M;

    location /uploads/ {
        alias /var/www/inventaris_menegement/public/uploads/;
        expires 7d;
        add_header Cache-Control "public";
    }

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

> Catatan skenario C: TIDAK ada rewrite prefix, TIDAK perlu override
> X-Forwarded-Host (Host asli = domain, sudah cocok). Next.js basePath kosong
> sehingga route `/api/auth/...` dan `/_next/...` jalan normal di root.

Aktifkan:

```bash
sudo ln -sf /etc/nginx/sites-available/inventaris /etc/nginx/sites-enabled/inventaris
# Pastikan tidak ada site default yang listen di port 80:
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

Skenario C — pasang SSL:

```bash
sudo certbot --nginx -d [DOMAIN]
```

---

## Langkah 9 — Modifikasi Kode yang WAJIB Ada

Kode di repo ini SUDAH path-agnostic: semua membaca env
`NEXT_PUBLIC_BASE_PATH`, jadi **tidak perlu diubah saat ganti path/domain**.
Yang wajib ada (kalau clone baru dari repo yang belum punya patch ini):

### 9a. `next.config.ts` — basePath dari env

```ts
import type { NextConfig } from "next";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  serverExternalPackages: ["bcryptjs", "archiver"],
  allowedDevOrigins: ["10.41.0.5"],
  images: { unoptimized: true }, // workaround bug image optimizer Next 16
  ...(basePath ? { basePath } : {}),
};

export default nextConfig;
```

> JANGAN set `assetPrefix` — cukup `basePath`.

### 9b. `src/auth.ts` — basePath Auth.js dinamis

Di dalam `NextAuth({...})`:

```ts
basePath: `${process.env.NEXT_PUBLIC_BASE_PATH || ""}/api/auth`,
```

### 9c. `src/app/api/auth/[...nextauth]/route.ts` — handler addBase

```ts
import { handlers } from "@/auth"
import { NextRequest } from "next/server"

// Workaround Auth.js v5 + gateway strip-prefix.
// Next.js basePath otomatis strip prefix sebelum route matching, jadi request
// sampai sebagai /api/auth/... Handler menambah prefix kembali (addBase)
// karena Auth.js dikonfigurasi basePath `${BASE}/api/auth`.
// Saat BASE kosong (skenario C), addBase nonaktif — request auth polos.
const PREFIX = process.env.NEXT_PUBLIC_BASE_PATH || ""

function addBase(req: NextRequest) {
  if (!PREFIX) return req
  const url = req.nextUrl.clone()
  if (url.pathname.startsWith("/api/auth")) {
    url.pathname = `${PREFIX}${url.pathname}`
  }
  return new NextRequest(url.toString(), req)
}

export const GET = (req: NextRequest) => handlers.GET(addBase(req))
export const POST = (req: NextRequest) => handlers.POST(addBase(req))
```

### 9d. `src/components/AuthProvider.tsx` — SessionProvider basePath

```tsx
"use client";
import { SessionProvider } from "next-auth/react";
import type { ReactNode } from "react";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

export function AuthProvider({ children }: { children: ReactNode }) {
  return (
    <SessionProvider basePath={`${BASE_PATH}/api/auth`}>{children}</SessionProvider>
  );
}
```

### 9e. `src/components/BasePathProvider.tsx` — file BARU

```tsx
"use client";
import { useEffect, type ReactNode } from "react";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

// Next.js basePath TIDAK otomatis menambah prefix ke fetch() manual di client.
// Semua /api/... & /uploads/... dari browser harus ber-prefix [BASE_PATH]
// (gateway hanya melewatkan [BASE_PATH]/*). Saat BASE kosong, provider no-op.
export function BasePathProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (!BASE_PATH) return;

    const originalFetch = window.fetch.bind(window);

    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      let url: string;
      if (typeof input === "string") url = input;
      else if (input instanceof URL) url = input.toString();
      else url = input.url;

      if (
        (url.startsWith("/api/") || url.startsWith("/uploads/")) &&
        !url.startsWith(`${BASE_PATH}/`)
      ) {
        const prefixed = `${BASE_PATH}${url}`;
        if (typeof input === "string") return originalFetch(prefixed, init);
        if (input instanceof URL)
          return originalFetch(new URL(prefixed, window.location.origin), init);
        return originalFetch(new Request(prefixed, input), init);
      }

      return originalFetch(input, init);
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  return <>{children}</>;
}
```

### 9f. `src/app/layout.tsx` — pasang BasePathProvider

Import & bungkus (paling luar, di dalam ThemeProvider):

```tsx
import { BasePathProvider } from "@/components/BasePathProvider";
// ...
<ThemeProvider>
  <BasePathProvider>
    <AuthProvider>
      <ToastProvider>{children}</ToastProvider>
    </AuthProvider>
  </BasePathProvider>
</ThemeProvider>
```

Setelah modifikasi: `npm run build` + `pm2 restart pinjam-app --update-env`.

> **Kenapa 4 lapis (9b–9e)?** Karena base path harus konsisten di 4 lapis
> auth/client: (1) Next `basePath` untuk asset/link server-render, (2) Auth.js
> `basePath` agar callback URL Google menyertakan prefix, (3) SessionProvider
> `basePath` agar signIn/signOut client memanggil URL ber-prefix, (4)
> BasePathProvider agar `fetch()` manual client ber-prefix. Kurang satu saja →
> salah satu alur patah (styling, callback nyasar ke WordPress, atau halaman
> gagal load data).

---

## Langkah 10 — Setup Google OAuth

Buka console.cloud.google.com:

1. APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID
2. Pilih **Web application**
3. **Authorized JavaScript origins:** `https://[DOMAIN]`
4. **Authorized redirect URIs** — INI YANG SERING SALAH, harus persis:
   - Skenario A/B: `https://[DOMAIN][BASE_PATH]/api/auth/callback/google`
   - Skenario C: `https://[DOMAIN]/api/auth/callback/google`
5. Salin Client ID & Secret ke `.env.local` (Langkah 4), lalu:
   ```bash
   pm2 restart pinjam-app --update-env
   ```

> Kalau redirect URI tidak cocok persis (termasuk ada/tidaknya path), login
> Google gagal dengan error `Configuration`.

---

## Langkah 11 — Cek Semua Berjalan

```bash
pm2 status                     # pinjam-app online

# Skenario A/B — lewat nginx lokal (simulasi gateway yang strip prefix):
curl -s -o /dev/null -w '%{http_code}\n' http://localhost/                      # 200
curl -s -o /dev/null -w '%{http_code}\n' "http://localhost/[BASE_PATH]/api/items"  # 200
# Skenario C:
curl -s -o /dev/null -w '%{http_code}\n' http://localhost/api/items             # 200
```

Lalu buka dari browser (URL publik sesuai skenario):
- Halaman utama muncul DENGAN styling
- `/admin/login` → login superadmin
- Login Google → kembali ke `/api/auth/callback/...`, BUKAN ke wp-login

**Kalau ada yang salah, cek gejala umum:**

| Gejala | Penyebab | Fix |
|---|---|---|
| HTML polos tanpa CSS | basePath tidak aktif / asset tanpa prefix | 9a + blok nginx A/B |
| Login Google nyasar ke wp-login | basePath Auth.js/SessionProvider kurang | 9b, 9c, 9d |
| "Invalid Server Actions request", form mati | X-Forwarded-Host tidak di-override | blok nginx A/B (baris X-Forwarded-Host) |
| Halaman gagal memuat data | fetch client tanpa prefix | 9e + 9f |
| `Unknown column 'location'` (atau kolom lain) | DB kurang kolom | ALTER TABLE manual (Langkah 2) |
| Logo/gambar tidak muncul | Bug image optimizer Next 16 | `images: { unoptimized: true }` (9a) |
| Konten terlihat versi lama | Cache browser/Cloudflare | Hard refresh Ctrl+Shift+R |

---

## Update Aplikasi (Setelah Ada Perubahan Baru)

```bash
cd /var/www/inventaris_menegement
git pull
npm install        # hanya jika package.json berubah
npm run build
pm2 restart pinjam-app
```

Perubahan schema DB → tambahkan kolom manual (Langkah 2), jangan
`drizzle-kit push`.

---

## Pindah Path / Domain / Subdomain (Ringkas)

**Ganti path di domain sama (A → A), mis. /empati → /inventaris:**
1. `.env.local`: `NEXT_PUBLIC_BASE_PATH=/inventaris` + `NEXTAUTH_URL=https://pharmacy.uii.ac.id/inventaris`
2. nginx: ganti semua `[BASE_PATH]` → `/inventaris` (3 baris rewrite)
3. Google Console: tambah redirect URI baru `.../inventaris/api/auth/callback/google`
4. Gateway: arahkan `/inventaris` ke IP server (admin UII)
5. `npm run build && pm2 restart pinjam-app --update-env && sudo systemctl reload nginx`

**Ganti domain + path (A → B):** langkah sama, tambah ganti `[FORWARD_HOST]`
nginx ke domain baru. Kode TIDAK berubah.

**Pindah ke subdomain tanpa path (A/C → C):**
1. `.env.local`: hapus `NEXT_PUBLIC_BASE_PATH`; `NEXTAUTH_URL=https://[DOMAIN]`
2. nginx: pakai blok skenario C (tanpa rewrite), `server_name [DOMAIN]`
3. Google Console: redirect URI tanpa path
4. SSL certbot; DNS A record ke IP server
5. Kode TIDAK berubah — addBase & BasePathProvider otomatis no-op saat env kosong

---

## Troubleshooting Tambahan

### Login Google error "Configuration"
99% penyebab: redirect URI di Google Cloud Console tidak cocok persis (cek
Langkah 10 — jangan sampai ada/tidaknya `[BASE_PATH]` salah). Cek juga env
`NEXT_PUBLIC_BASE_PATH` konsisten dengan `NEXTAUTH_URL`.

### Akun superadmin tidak bisa login
Password hash bcrypt satu arah — tidak bisa dilihat/direset. Hapus & buat ulang
(Langkah 5).

### PM2 app restart terus-menerus
```bash
pm2 logs pinjam-app --lines 100
```
- `Unknown column` = DB kurang kolom (ALTER manual)
- `Invalid Server Actions` = nginx X-Forwarded-Host belum di-override
- `Cannot parse action` / auth error = route handler belum di-addBase (9c)

### Server reboot — app tidak jalan
```bash
pm2 startup   # jalankan sekali, ikuti output-nya
pm2 save
```

### Memori Proyek
- Detail sourcecode & konvensi kode (struktur folder, schema, role, alur):
  lihat `MEMORY.md` di root repo.
- Urusan server (nginx/PM2/DB setup) = dokumen ini saja.
