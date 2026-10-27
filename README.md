# SI-KRS Profesional

Aplikasi web CRUD Sistem Informasi Kartu Rencana Studi dengan Node.js, Express, dan PostgreSQL. Struktur tabel mengikuti file ERD yang diberikan: `prodi`, `dosen`, `mahasiswa`, `mata_kuliah`, `periode`, `kelas`, `krs`, `krs_detail`, `aturan_akademik`.

## 1. Persiapan
- PostgreSQL Server harus aktif.
- Node.js versi LTS harus terpasang.
- Jangan menghapus atau menimpa folder PostgreSQL lama.

## 2. Buka proyek di VS Code
Ekstrak ZIP ke folder baru, misalnya `D:\\SIKRS-PROFESIONAL`. Buka folder tersebut di VS Code.

## 3. Siapkan database
Buka pgAdmin 4, konek ke server PostgreSQL, lalu pilih database target. Bila ingin memakai database yang sudah ada, pastikan isinya dulu. `database/schema.sql` menggunakan `CREATE TABLE IF NOT EXISTS` dan tidak menghapus data, tetapi nama tabel yang sudah ada bisa saja punya struktur berbeda. Untuk pengujian paling aman, buat database baru bernama `sikrs_dev`, lalu jalankan `database/schema.sql` pada database tersebut. Jika wajib menggunakan `krs_dev`, buat backup terlebih dahulu dan pastikan skema lama cocok.

Di pgAdmin: pilih database > Tools > Query Tool > buka `database/schema.sql` > Execute.

## 4. Konfigurasi koneksi
Salin `.env.example` menjadi `.env`, lalu isi password PostgreSQL lokal pada `DB_PASSWORD`. Contoh:
```
PORT=3001
DB_HOST=localhost
DB_PORT=5432
DB_NAME=sikrs_dev
DB_USER=postgres
DB_PASSWORD=password_postgres_kamu
```
Jangan mengunggah `.env` ke GitHub.

## 5. Jalankan
Buka terminal di folder proyek yang berisi `package.json`, jalankan:
```
npm install
npm start
```
Buka `http://localhost:3001`. Port 3001 sengaja digunakan agar tidak bentrok dengan aplikasi lama di port 3000.

## Modul CRUD
- Program Studi
- Dosen
- Mahasiswa
- Mata Kuliah
- Periode Akademik
- Kelas Kuliah
- KRS Mahasiswa
- Detail KRS
- Aturan Akademik

## Catatan penting
- Aplikasi ini merupakan fondasi CRUD akademik yang terkoneksi langsung ke PostgreSQL; ini bukan lagi demo “transaksi tanpa database”.
- Foreign key dan aturan utama mengikuti ERD, dengan validasi tambahan untuk jenjang, status, SKS, kuota, rentang tanggal, dan nilai.
- Pengajuan KRS otomatis, pemeriksaan batas SKS, autentikasi/login, role, audit trail, dan cetak KRS belum diimplementasikan.
- Selalu buat backup sebelum mengubah database yang berisi data penting.
