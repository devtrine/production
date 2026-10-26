# 🚀 Panduan Deployment BIENSI ke VPS (Ubuntu 22.04 / 24.04 LTS)

Panduan ini berisi langkah-langkah komprehensif untuk men-deploy aplikasi **BIENSI** (Backend Express + Prisma PostgreSQL & Frontend React Vite) menggunakan **Nginx**, **PM2**, **Certbot (SSL HTTPS)**, dan **Cloudflare (DNS & Reverse Proxy)**.

---

## 📋 Prasyarat
Pastikan hal berikut sudah siap:
* Domain sudah terdaftar dan aktif di **Cloudflare**.
* Port berikut sudah dibuka di firewall VPS (Security Group / UFW):
  * **Port 22** (SSH)
  * **Port 80** (HTTP)
  * **Port 443** (HTTPS)

---

## Langkah 1: Persiapan Server VPS

Login ke VPS Anda via SSH:
```bash
ssh root@<IP_VPS_ANDA>
```

Update repositori paket sistem:
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl wget git build-essential ufw
```

Aktifkan Firewall UFW:
```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw --force enable
sudo ufw status
```

---

## Langkah 2: Install Node.js (v24), PM2, dan Nginx

Install Node.js 24 via NodeSource:
```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs nginx
```

Verifikasi versi:
```bash
node -v # v24.x.x
npm -v
```

Install PM2 secara global:
```bash
sudo npm install -g pm2
```

---

## Langkah 3: Install & Konfigurasi PostgreSQL

Install PostgreSQL:
```bash
sudo apt install -y postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

Masuk ke PostgreSQL dan buat database serta user baru:
```bash
sudo -u postgres psql
```

Jalankan perintah SQL berikut di dalam prompt psql:
```sql
CREATE DATABASE biensi_db;
CREATE USER biensi_user WITH ENCRYPTED PASSWORD 'BuatPasswordKuat123!';
GRANT ALL PRIVILEGES ON DATABASE biensi_db TO biensi_user;
ALTER DATABASE biensi_db OWNER TO biensi_user;
\q
```

---

## Langkah 4: Setup Source Code di VPS

Buat direktori aplikasi di `/var/www`:
```bash
sudo mkdir -p /var/www/biensi
sudo chown -R $USER:$USER /var/www/biensi
cd /var/www/biensi
```

Clone atau upload source code project Anda ke folder ini sehingga strukturnya menjadi:
```
/var/www/biensi/
├── biensi_be/
├── biensi_fe/
└── deploy/
```

---

## Langkah 5: Setup & Menjalankan Backend (`biensi_be`)

Masuk ke folder backend:
```bash
cd /var/www/biensi/biensi_be
```

Install dependensi backend:
```bash
npm install
```

Buat dan sesuaikan file `.env`:
```bash
cp .env.example .env
nano .env
```
Isi file `.env` dengan kredensial database VPS Anda:
```env
PORT=5000
NODE_ENV=production
DATABASE_URL="postgresql://biensi_user:BuatPasswordKuat123!@localhost:5432/biensi_db?schema=public"
JWT_SECRET="masukkan_string_acak_panjang_dan_rahasia_di_sini"
CORS_ORIGIN="*"
```
*(Tekan `Ctrl+O` lalu `Enter` untuk save, dan `Ctrl+X` untuk keluar dari nano)*.

Jalankan Prisma Generate & Migrate Database:
```bash
npx prisma generate
npx prisma migrate deploy
```
*(Opsional jika ingin seed data awal role / user)*:
```bash
node prisma/seed.js
```

> **Catatan:** Folder `uploads` dan izin aksesnya (`chmod 775`) sudah dibuat dan dikonfigurasi secara **otomatis** oleh aplikasi backend saat pertama kali dijalankan, sehingga Anda tidak perlu membuatnya secara manual.

Jalankan Backend dengan PM2 dari root project:
```bash
cd /var/www/biensi
pm2 start deploy/ecosystem.config.cjs
pm2 save
pm2 startup
```
*(Jalankan perintah yang disarankan oleh output `pm2 startup` agar PM2 otomatis menyala saat server restart).*

Periksa log backend:
```bash
pm2 status
pm2 logs biensi-backend --lines 20
```

---

## Langkah 6: Build Frontend (`biensi_fe`)

Masuk ke folder frontend:
```bash
cd /var/www/biensi/biensi_fe
```

Install dependensi:
```bash
npm install
```

Buat file environment dari template:
```bash
cp .env.example .env
```
Pastikan isi `.env` sudah sesuai (default template sudah langsung mengarah ke `/api/v1`):
```env
VITE_API_BASE_URL=/api/v1
```

Lakukan build:
```bash
npm run build
```
Hasil build akan berada di `/var/www/biensi/biensi_fe/dist/`.

---

## Langkah 7: Konfigurasi Nginx Web Server

Salin file konfigurasi Nginx dari folder `deploy`:
```bash
sudo cp /var/www/biensi/deploy/nginx/biensi.conf /etc/nginx/sites-available/biensi.conf
```

Edit konfigurasi untuk memasukkan subdomain Anda:
```bash
sudo nano /etc/nginx/sites-available/biensi.conf
```
Ganti baris `server_name yourdomain.com www.yourdomain.com;` cukup dengan subdomain Anda saja tanpa `www` (contoh: `server_name biensi.yourdomain.com;`).

Aktifkan konfigurasi dengan membuat symlink ke `sites-enabled`:
```bash
sudo ln -s /etc/nginx/sites-available/biensi.conf /etc/nginx/sites-enabled/
```

Hapus konfigurasi default jika tidak digunakan:
```bash
sudo rm -f /etc/nginx/sites-enabled/default
```

Uji sintaks Nginx dan restart layanan:
```bash
sudo nginx -t
sudo systemctl restart nginx
```

---

## Langkah 8: Konfigurasi Subdomain Cloudflare & SSL (Certbot)

### 1. Buat DNS Record Subdomain di Cloudflare (Matikan Proxy Sementara)
Buka Dashboard **Cloudflare** → pilih domain utama Anda → **DNS** → **Records**, lalu tambahkan **1 record `A`** dengan status **DNS only (Awan Abu-abu)** terlebih dahulu agar verifikasi awal Certbot langsung tembus ke VPS:
* **Type:** `A`
* **Name:** `biensi` *(cukup isi nama depan subdomainnya saja, misal `biensi` untuk `biensi.yourdomain.com`)*
* **IPv4 address:** `<IP_VPS_ANDA>`
* **Proxy status:** **DNS only** (awan abu-abu)

*(Catatan: Tidak perlu menambahkan `www` pada subdomain karena SSL gratis Cloudflare hanya mencakup 1 tingkat subdomain `*.yourdomain.com`).*

### 2. Pasang SSL Otomatis dengan Certbot di VPS
Install Certbot dan pasang sertifikat SSL untuk subdomain Anda:
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d biensi.yourdomain.com
```
Ikuti instruksi di layar (masukkan email dan setujui ToS). Certbot akan otomatis mengonfigurasi HTTPS di Nginx dan mengatur *auto-renewal* sertifikat.

### 3. Aktifkan Reverse Proxy Cloudflare
Setelah Certbot berhasil memasang SSL di VPS, kembali ke Dashboard **Cloudflare**:
1. Pastikan mode enkripsi SSL menggunakan **Full (strict)** di menu **SSL/TLS** → **Overview** agar tidak terjadi `ERR_TOO_MANY_REDIRECTS`.  
   *(Tips: Jika domain utama Anda juga dipakai aplikasi lain yang belum mendukung `Full (strict)` secara global, Anda cukup mengaturnya khusus untuk subdomain `biensi.yourdomain.com` melalui menu **Rules** → **Configuration Rules** → aktifkan **SSL: Full (strict)**).*
2. Buka kembali menu **DNS** → **Records**, edit record subdomain tadi, lalu ubah **Proxy status** menjadi **Proxied (Awan Oranye)**.

> **Catatan:** Pada Cloudflare Free Plan, batas maksimal upload adalah **100 MB** (aman untuk batas Excel BIENSI **50 MB**) dan batas *timeout* koneksi adalah **100 detik**.

---

## 🔄 Cara Update Code di Kemudian Hari (Maintenance)

Jika ada perubahan kode di masa depan:

### 1. Update Backend:
```bash
cd /var/www/biensi/biensi_be
git pull
npm install
npx prisma migrate deploy # jika ada perubahan skema DB
pm2 reload biensi-backend
```

### 2. Update Frontend:
```bash
cd /var/www/biensi/biensi_fe
git pull
npm install
npm run build
# Frontend langsung ter-update otomatis karena disajikan via Nginx!
```
