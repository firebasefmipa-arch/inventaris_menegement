# Panduan Deploy — Manajemen Inventaris FMIPA UII

> Panduan ini berdasarkan pengalaman deploy nyata di server produksi.
> Ikuti urutannya — jangan loncat langkah.

---

## Yang Kamu Butuhkan Sebelum Mulai

- Server Ubuntu 20.04 / 22.04 dengan akses root
- Domain yang sudah diarahkan ke Cloudflare
- Akun Google Cloud dengan project yang sudah dibuat
- Sekitar 30–60 menit waktu

---

## Langkah 1 — Install Software di Server

```bash
# Update sistem dulu
sudo apt update && sudo apt upgrade -y

# Install Node.js versi 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install PM2 (untuk menjalankan aplikasi di background)
sudo npm install -g pm2

# Install MySQL
sudo apt install -y mysql-server
sudo mysql_secure_installation
```

---

## Langkah 2 — Buat Database MySQL

```bash
sudo mysql -u root -p
```

```sql
-- Buat database
CREATE DATABASE modern_lending CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Buat user khusus aplikasi (lebih aman dari pakai root)
CREATE USER 'appuser'@'localhost' IDENTIFIED BY 'password-kuat-disini';
GRANT ALL PRIVILEGES ON modern_lending.* TO 'appuser'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

### Import Struktur Tabel

Setelah clone repo (langkah 3), jalankan:

```bash
mysql -u appuser -p modern_lending < database/schema_only.sql
```

Atau pakai Drizzle (lebih mudah, otomatis sinkron dengan schema terbaru):

```bash
npx drizzle-kit push
```

---

## Langkah 3 — Clone dan Install Aplikasi

```bash
cd /var/www
git clone https://github.com/firebasefmipa-arch/inventaris_menegement.git inventaris_menegement
cd inventaris_menegement

npm install
```

---

## Langkah 4 — Buat File Konfigurasi (.env.local)

```bash
nano /var/www/inventaris_menegement/.env.local
```

Isi dengan nilai yang sesuai:

```env
DATABASE_URL=mysql://appuser:password-kuat-disini@127.0.0.1:3306/modern_lending
NEXTAUTH_URL=https://domain-kamu.com
NEXTAUTH_SECRET=
ENCRYPTION_KEY=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Opsional: isi jika app dihosting di sub-path, contoh /inventaris
# Kosongkan jika pakai subdomain langsung
# NEXT_PUBLIC_BASE_PATH=/inventaris

# URL dasar untuk link email verifikasi (tanpa trailing slash)
# NEXT_PUBLIC_APP_URL=https://domain-kamu.com
```

**Cara generate nilai yang dibutuhkan:**

```bash
# NEXTAUTH_SECRET
openssl rand -base64 32

# ENCRYPTION_KEY (untuk enkripsi password akun native)
openssl rand -hex 32
```

`GOOGLE_CLIENT_ID` dan `GOOGLE_CLIENT_SECRET` diambil dari Google Cloud Console
(lihat Langkah 9).

---

## Langkah 5 — Sinkronisasi Schema Database

Cara paling mudah — biarkan Drizzle yang handle:

```bash
npx drizzle-kit push
```

Drizzle akan membaca `src/db/schema.ts` dan membuat semua tabel yang dibutuhkan
secara otomatis. Tidak perlu jalankan SQL manual.

> Kalau MySQL tidak jalan di lokal dan kamu ingin import manual:
> ```bash
> mysql -u appuser -p modern_lending < database/schema_only.sql
> ```

---

## Langkah 6 — Buat Akun Superadmin

```bash
npm run setup:superadmin
```

Ikuti instruksi yang muncul — isi nama, email, dan password.

---

## Langkah 7 — Buat Folder untuk File Upload

```bash
mkdir -p /var/www/inventaris_menegement/public/uploads/signed_forms
mkdir -p /var/www/inventaris_menegement/public/uploads/handovers
mkdir -p /var/www/inventaris_menegement/public/uploads/pending
mkdir -p /var/www/inventaris_menegement/public/uploads/signatures
chmod -R 755 /var/www/inventaris_menegement/public/uploads/
```

---

## Setup BasePath (Opsional — jika pakai sub-path)

Jika app dihosting di sub-path seperti `domain.com/inventaris`, tambahkan ke `.env.local`:

```env
NEXT_PUBLIC_BASE_PATH=/inventaris
NEXTAUTH_URL=https://domain.com/inventaris
NEXT_PUBLIC_APP_URL=https://domain.com
```

Lalu tambahkan `location /inventaris/` di Nginx:

```nginx
location /inventaris/ {
    proxy_pass http://localhost:3001/inventaris/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
}

location /inventaris/uploads/ {
    alias /var/www/inventaris_menegement/public/uploads/;
    expires 7d;
}
```

> Jika ingin kembali ke subdomain langsung, hapus `NEXT_PUBLIC_BASE_PATH` dari `.env.local` dan build ulang.

---

## Langkah 8 — Build dan Jalankan Aplikasi

```bash
npm run build

# Jalankan dengan PM2
pm2 start npm --name "pinjam-app" -- start
pm2 save

# Agar aplikasi otomatis jalan setelah server reboot
pm2 startup
# Jalankan perintah yang muncul dari output pm2 startup
```

---

## Langkah 9 — Setup Google OAuth

Buka [console.cloud.google.com](https://console.cloud.google.com):

1. Pilih project kamu (atau buat baru)
2. Pergi ke **APIs & Services → Credentials**
3. Klik **Create Credentials → OAuth 2.0 Client ID**
4. Pilih **Web application**
5. Tambahkan:

**Authorized JavaScript origins:**
```
https://domain-kamu.com
```

**Authorized redirect URIs:**
```
https://domain-kamu.com/api/auth/callback/google
```

6. Salin `Client ID` dan `Client Secret` ke `.env.local`

---

## Langkah 10 — Setup Nginx (Reverse Proxy)

```bash
sudo nano /etc/nginx/sites-available/pinjam-app
```

```nginx
server {
    listen 80;
    server_name domain-kamu.com;

    # Batas ukuran file upload (sesuai dengan limit di aplikasi)
    client_max_body_size 10M;

    # File upload dilayani langsung oleh Nginx — lebih cepat dan
    # tidak hilang setelah npm run build
    location /uploads/ {
        alias /var/www/inventaris_menegement/public/uploads/;
        expires 7d;
        add_header Cache-Control "public";
    }

    # Semua request lain diteruskan ke aplikasi Next.js
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

```bash
sudo ln -s /etc/nginx/sites-available/pinjam-app /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

---

## Langkah 11 — Setup Cloudflare Tunnel (agar bisa diakses via domain)

```bash
# Download dan install cloudflared
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o cloudflared.deb
sudo dpkg -i cloudflared.deb

# Login (akan muncul link, buka di browser)
cloudflared tunnel login

# Buat tunnel — catat Tunnel ID yang muncul
cloudflared tunnel create pinjam-app
```

```bash
nano ~/.cloudflared/config.yml
```

```yaml
tunnel: <TUNNEL-ID-dari-langkah-diatas>
credentials-file: /root/.cloudflared/<TUNNEL-ID>.json

ingress:
  - hostname: domain-kamu.com
    service: http://localhost:3000
  - service: http_status:404
```

```bash
# Hubungkan domain ke tunnel
cloudflared tunnel route dns pinjam-app domain-kamu.com

# Jalankan tunnel via PM2 supaya auto-restart
pm2 start "cloudflared tunnel run pinjam-app" --name "cf-tunnel"
pm2 save
```

---

## Langkah 12 — Cek Semua Berjalan Normal

```bash
pm2 status
```

Kalau berhasil, tampilannya seperti ini:

```
┌────┬───────────────┬─────────┬──────┐
│ id │ name          │ status  │ ↺    │
├────┼───────────────┼─────────┼──────┤
│ 0  │ cf-tunnel     │ online  │ 0    │
│ 1  │ pinjam-app    │ online  │ 0    │
└────┴───────────────┴─────────┴──────┘
```

Kalau ada error, cek log:

```bash
pm2 logs pinjam-app --lines 50
```

---

## Update Aplikasi (Setelah Ada Perubahan Baru)

```bash
cd /var/www/inventaris_menegement

git pull
npm run build
pm2 restart pinjam-app
```

Jalankan `npm install` hanya jika ada perubahan di `package.json`.

Jika ada perubahan schema database, jalankan `npx drizzle-kit push` sebelum build.

---

## Troubleshooting

### Login Google tidak bisa

Pastikan URL di Google Cloud Console sudah sesuai dengan domain yang dipakai.

### File yang diupload tidak muncul (404)

```bash
# Pastikan folder ada
ls /var/www/inventaris_menegement/public/uploads/

# Pastikan Nginx dikonfigurasi dengan location /uploads/
sudo nginx -t
```

### Aplikasi error 500

```bash
pm2 logs pinjam-app --lines 100
```

### Akun superadmin terhapus

```bash
npm run setup:superadmin
```

### Database tidak bisa diakses

```bash
# Cek MySQL berjalan
sudo systemctl status mysql

# Cek koneksi dengan DATABASE_URL di .env.local
cat /var/www/inventaris_menegement/.env.local
```
