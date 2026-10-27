# SI-KRS — Sistem Informasi Kartu Rencana Studi

## 1. Deskripsi Proyek

SI-KRS adalah aplikasi web sederhana untuk mengelola data akademik dan transaksi Kartu Rencana Studi (KRS) mahasiswa. Aplikasi ini dibuat untuk menerapkan alur transaksi KRS yang mengikuti rancangan UML.

Pada tugas ini, aplikasi menggunakan data sementara di memori dan tidak memerlukan koneksi database.

## 2. Tujuan

1. Menerapkan rancangan sistem ke dalam aplikasi web.
2. Mengelola data akademik melalui fitur CRUD.
3. Menerapkan alur transaksi KRS mahasiswa.
4. Memvalidasi pengajuan KRS berdasarkan aturan akademik.

## 3. Teknologi

- Node.js
- Express.js
- HTML, CSS, dan JavaScript
- Penyimpanan data sementara di memori (_in-memory_)

## 4. Persiapan dan Cara Menjalankan

Pastikan Node.js sudah terpasang di komputer.

Buka terminal pada folder proyek yang berisi `package.json`, kemudian jalankan:

```bash
npm install
npm start
```

Setelah server berjalan, buka alamat berikut di browser:

`http://localhost:3001`

Aplikasi berjalan tanpa konfigurasi PostgreSQL.

## 5. Modul Aplikasi

Aplikasi menyediakan pengelolaan data untuk:

1. Program Studi
2. Dosen
3. Mahasiswa
4. Mata Kuliah
5. Periode Akademik
6. Kelas Kuliah
7. KRS Mahasiswa
8. Detail KRS
9. Aturan Akademik

## 6. Alur Transaksi KRS

1. KRS mahasiswa dibuat dengan status awal `draft`.
2. Mahasiswa dapat menambahkan kelas ke Detail KRS selama KRS masih berstatus `draft`.
3. Sistem memeriksa kesesuaian periode kelas dengan periode KRS.
4. Sistem menghitung total SKS berdasarkan mata kuliah yang diambil.
5. Pengajuan KRS ditolak jika tidak memiliki detail kelas atau jika total SKS melebihi batas maksimal yang ditetapkan.
6. Jika validasi berhasil, status KRS berubah menjadi `diajukan`.
7. Detail KRS dan data KRS yang sudah diajukan atau diproses tidak dapat diubah melalui fitur yang tersedia.

## 7. Aturan Akademik

Batas maksimal SKS menggunakan aturan `MAX_SKS`. Data awal aplikasi menetapkan batas maksimal sebesar 24 SKS per semester.

## 8. Catatan Penyimpanan Data

Aplikasi menggunakan data contoh yang disimpan sementara di memori. Data yang dibuat atau diubah selama aplikasi berjalan tidak dijamin tetap tersedia setelah server dimulai ulang.

Aplikasi ini tidak menggunakan database pada pelaksanaan tugas ini.

## 9. Pengujian

Pengujian dilakukan melalui browser dengan memeriksa fitur CRUD dan alur transaksi KRS, termasuk penambahan Detail KRS, penolakan data duplikat, pengajuan KRS, dan pembatasan perubahan setelah KRS diajukan.

Hasil pengujian aktual dicatat berdasarkan perilaku aplikasi yang diamati.
