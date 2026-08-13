# Panduan Deploy — Sistem Peminjaman Barang FMIPA UII

> Panduan ini berdasarkan pengalaman deploy nyata. Ikuti urutan dengan benar.

---

## Prasyarat

- Ubuntu Server (20.04 / 22.04)
- Akses root atau sudo
- Domain yang sudah diarahkan ke Cloudflare
- Google Cloud Console project dengan OAuth 2.0 credentials

---

## 1. Install Dependencies di Server

```bash
# Update sistem
sudo apt update && sudo apt upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install PM2 secara global
sudo npm install -g pm2

# Install MySQL
sudo apt install -y mysql-server
sudo mysql_secure_installation
```

---

## 2. Setup Database

```bash
sudo mysql -u root -p
```

```sql
-- Buat database
CREATE DATABASE modern_lending CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Buat user khusus aplikasi (lebih aman dari root)
CREATE USER 'appuser'@'localhost' IDENTIFIED BY 'password-kuat-disini';
GRANT ALL PRIVILEGES ON modern_lending.* TO 'appuser'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

### Fix Foreign Key CASCADE (wajib dijalankan sekali)

Ini mencegah orphan data di tabel `account` dan `session` saat user dihapus:

```bash
sudo mysql -u root -p modern_lending
```

```sql
-- Cek nama FK yang ada dulu
SHOW CREATE TABLE account;
SHOW CREATE TABLE session;

-- Drop FK lama lalu buat ulang dengan CASCADE
ALTER TABLE account DROP FOREIGN KEY account_userId_user_id_fk;
ALTER TABLE session DROP FOREIGN KEY session_userId_user_id_fk;

ALTER TABLE account ADD CONSTRAINT account_userId_user_id_fk
  FOREIGN KEY (userId) REFERENCES user(id) ON DELETE CASCADE;

ALTER TABLE session ADD CONSTRAINT session_userId_user_id_fk
  FOREIGN KEY (userId) REFERENCES user(id) ON DELETE CASCADE;

EXIT;
```

---

## 3. Clone Repo dan Install

```bash
cd /var/www
git clone https://github.com/firebasefmipa-arch/inventaris_menegement.git inventaris_menegement
cd inventaris_menegement

npm install
```

---

## 4. Buat File .env.local

```bash
nano /var/www/inventaris_menegement/.env.local
```

Isi:

```env
DATABASE_URL=mysql://appuser:password-kuat-disini@127.0.0.1:3306/modern_lending
NEXTAUTH_URL=https://domain-kamu.com
NEXTAUTH_SECRET=isi-hasil-perintah-openssl-dibawah
GOOGLE_CLIENT_ID=dari-google-cloud-console
GOOGLE_CLIENT_SECRET=dari-google-cloud-console
```

Generate `NEXTAUTH_SECRET`:

```bash
openssl rand -base64 32
```

---

## 5. Import Schema Database

```bash
# Import schema utama
mysql -u appuser -p modern_lending < database/schema_only.sql

# Migrasi kolom tambahan (jalankan semuanya sekaligus)
mysql -u appuser -p modern_lending -e "
  ALTER TABLE user ADD COLUMN IF NOT EXISTS nim varchar(50) DEFAULT NULL AFTER phone;
  ALTER TABLE transactions ADD COLUMN IF NOT EXISTS borrower_nim varchar(50) DEFAULT NULL AFTER borrower_department;
  ALTER TABLE transactions ADD COLUMN IF NOT EXISTS borrower_location varchar(255) DEFAULT NULL AFTER borrower_nim;
  ALTER TABLE transactions ADD COLUMN IF NOT EXISTS purpose TEXT DEFAULT NULL AFTER notes;
  ALTER TABLE account MODIFY COLUMN access_token TEXT;
  ALTER TABLE account MODIFY COLUMN id_token TEXT;
  ALTER TABLE account MODIFY COLUMN refresh_token TEXT;
"

# Migrasi tabel serah terima (handovers)
mysql -u appuser -p modern_lending -e "
  CREATE TABLE IF NOT EXISTS handovers (
    id int(11) NOT NULL AUTO_INCREMENT,
    user_id varchar(255) DEFAULT NULL,
    receiver_name varchar(255) NOT NULL,
    receiver_nim varchar(50) DEFAULT NULL,
    unit_name varchar(255) DEFAULT NULL,
    department varchar(100) DEFAULT NULL,
    phone varchar(50) DEFAULT NULL,
    purpose text DEFAULT NULL,
    notes text DEFAULT NULL,
    signed_document_url varchar(500) DEFAULT NULL,
    status enum('pending_signature','pending_approval','completed','rejected') NOT NULL DEFAULT 'pending_signature',
    rejection_reason text DEFAULT NULL,
    handover_date timestamp NOT NULL DEFAULT current_timestamp(),
    created_at timestamp NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (id),
    CONSTRAINT handovers_user_id_fk FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  CREATE TABLE IF NOT EXISTS handover_items (
    id int(11) NOT NULL AUTO_INCREMENT,
    handover_id int(11) NOT NULL,
    item_id int(11) NOT NULL,
    quantity int(11) NOT NULL DEFAULT 1,
    notes text DEFAULT NULL,
    PRIMARY KEY (id),
    CONSTRAINT hi_handover_id_fk FOREIGN KEY (handover_id) REFERENCES handovers(id) ON DELETE CASCADE,
    CONSTRAINT hi_item_id_fk FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
"
```

---

## 6. Buat Akun Superadmin

```bash
npm run setup:superadmin
```

Ikuti prompt — isi nama, email, dan password superadmin.

---

## 7. Buat Folder Upload

```bash
mkdir -p /var/www/inventaris_menegement/public/uploads/signed_forms
mkdir -p /var/www/inventaris_menegement/public/uploads/handovers
chmod -R 755 /var/www/inventaris_menegement/public/uploads/
```

---

## 8. Build dan Jalankan dengan PM2

```bash
npm run build

pm2 start npm --name "pinjam-app" -- start
pm2 save

# Auto-start setelah reboot — copy-paste perintah yang muncul
pm2 startup
```

---

## 9. Konfigurasi Nginx

```bash
sudo nano /etc/nginx/sites-available/pinjam-app
```

```nginx
server {
    listen 80;
    server_name domain-kamu.com;

    client_max_body_size 10M;

    # Serve file upload langsung via Nginx (tidak lewat Next.js)
    # Ini penting agar file yang diupload tidak hilang setelah npm run build
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

```bash
sudo ln -s /etc/nginx/sites-available/pinjam-app /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

---

## 10. Setup Cloudflare Tunnel

```bash
# Install cloudflared
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o cloudflared.deb
sudo dpkg -i cloudflared.deb

# Login ke Cloudflare (akan muncul URL, buka di browser)
cloudflared tunnel login

# Buat tunnel
cloudflared tunnel create pinjam-app
# Catat Tunnel ID yang muncul
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
# Arahkan DNS domain ke tunnel
cloudflared tunnel route dns pinjam-app domain-kamu.com

# Jalankan tunnel via PM2
pm2 start "cloudflared tunnel run pinjam-app" --name "cf-tunnel"
pm2 save
```

---

## 11. Update Google Cloud Console

Buka [console.cloud.google.com](https://console.cloud.google.com) → APIs & Services → Credentials → OAuth 2.0 Client ID.

Tambahkan:

**Authorized JavaScript origins:**
```
https://domain-kamu.com
```

**Authorized redirect URIs:**
```
https://domain-kamu.com/api/auth/callback/google
```

---

## 12. Verifikasi Deployment

Cek semua proses berjalan:

```bash
pm2 status
```

Output yang diharapkan:

```
┌─────┬───────────────┬─────────┬──────┬──────────┐
│ id  │ name          │ status  │ ↺    │ cpu/mem  │
├─────┼───────────────┼─────────┼──────┼──────────┤
│ 0   │ cf-tunnel     │ online  │ 0    │ ...      │
│ 1   │ pinjam-app    │ online  │ 0    │ ...      │
└─────┴───────────────┴─────────┴──────┴──────────┘
```

Cek log jika ada masalah:

```bash
pm2 logs pinjam-app --lines 50
```

---

## Update Aplikasi (Deploy Berikutnya)

```bash
cd /var/www/inventaris_menegement

git pull
npm install        # hanya jika ada perubahan di package.json
npm run build
pm2 restart pinjam-app
```

Jika ada perubahan schema database, jalankan ALTER TABLE yang sesuai **sebelum** `npm run build`.

---

## Troubleshooting

### Login Google tidak bisa / OAuthAccountNotLinked

```bash
mysql -u appuser -p modern_lending -e "
  DELETE FROM account WHERE userId NOT IN (SELECT id FROM user);
  DELETE FROM session WHERE userId NOT IN (SELECT id FROM user);
"
```

### File upload 404

Pastikan folder ada dan Nginx sudah dikonfigurasi dengan `location /uploads/`:

```bash
ls /var/www/inventaris_menegement/public/uploads/signed_forms/
```

### Aplikasi error 500

```bash
pm2 logs pinjam-app --lines 100
```

### Superadmin terhapus tidak sengaja

```bash
npm run setup:superadmin
```

### Database connection refused

Pastikan `DATABASE_URL` di `.env.local` sudah benar dan MySQL berjalan:

```bash
sudo systemctl status mysql
```
