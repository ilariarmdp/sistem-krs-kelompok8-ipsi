// Membuat / memperbarui satu akun.
// Contoh:
//   node src/seed-user.js admin admin123 admin
//   node src/seed-user.js 2406123 rahasia mahasiswa 2406123
//   node src/seed-user.js dosen1 rahasia dosen 1
const bcrypt = require('bcryptjs');
const pool = require('./db');

const [username, password, role = 'admin', ref = null] = process.argv.slice(2);
const ROLES = ['admin', 'dosen', 'mahasiswa'];

if (!username || !password || !ROLES.includes(role)) {
  console.log('Pemakaian: node src/seed-user.js <username> <password> <admin|dosen|mahasiswa> [nim | id_dosen]');
  process.exit(1);
}
if (role !== 'admin' && !ref) {
  console.log(`Peran ${role} wajib menyertakan ${role === 'mahasiswa' ? 'NIM' : 'id_dosen'} di argumen ke-4`);
  process.exit(1);
}

(async () => {
  try {
    if (role === 'mahasiswa') {
      const r = await pool.query('SELECT 1 FROM mahasiswa WHERE nim = $1', [ref]);
      if (!r.rowCount) throw new Error(`NIM ${ref} tidak ditemukan di tabel mahasiswa`);
    }
    if (role === 'dosen') {
      const r = await pool.query('SELECT 1 FROM dosen WHERE id_dosen = $1', [Number(ref)]);
      if (!r.rowCount) throw new Error(`id_dosen ${ref} tidak ditemukan di tabel dosen`);
    }

    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      `INSERT INTO users (username, password_hash, role, ref_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (username, role) DO UPDATE
         SET password_hash = EXCLUDED.password_hash,
             role = EXCLUDED.role,
             ref_id = EXCLUDED.ref_id`,
      [username, hash, role, ref]
    );
    console.log(`Akun siap: ${username} (${role})`);
  } catch (e) {
    console.error('Gagal:', e.message);
  } finally {
    await pool.end();
  }
})();