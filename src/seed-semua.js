// Membuat akun otomatis untuk SEMUA mahasiswa dan dosen yang ada di database.
//   Mahasiswa : username = NIM,            password awal = NIM
//   Dosen     : username = NIDN (atau dosen<id>), password awal = sama dengan username
// Akun yang sudah ada tidak diubah (password lama tetap aman).
// Jalankan:  node src/seed-semua.js
const bcrypt = require('bcryptjs');
const pool = require('./db');

async function buat(username, role, ref) {
  const hash = await bcrypt.hash(username, 10);
  const r = await pool.query(
    `INSERT INTO users (username, password_hash, role, ref_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (username) DO NOTHING`,
    [username, hash, role, ref]
  );
  return r.rowCount; // 1 = baru dibuat, 0 = sudah ada
}

(async () => {
  try {
    let mhsBaru = 0, dsnBaru = 0;

    const mhs = await pool.query('SELECT nim FROM mahasiswa');
    for (const m of mhs.rows) {
      mhsBaru += await buat(String(m.nim), 'mahasiswa', String(m.nim));
    }

    const dsn = await pool.query('SELECT id_dosen, nidn FROM dosen');
    for (const d of dsn.rows) {
      const username = d.nidn ? String(d.nidn) : `dosen${d.id_dosen}`;
      dsnBaru += await buat(username, 'dosen', String(d.id_dosen));
    }

    console.log(`Selesai. Akun mahasiswa baru: ${mhsBaru}, akun dosen baru: ${dsnBaru}`);
    console.log('Password awal sama dengan username (NIM / NIDN). Sarankan diganti.');
  } catch (e) {
    console.error('Gagal:', e.message);
  } finally {
    await pool.end();
  }
})();