const pool = require('../src/db');

const NIM = 'T00000000001';
const hasil = [];
const assert = (k, m) => { if (!k) throw new Error(m); };

async function uji(nama, fn) {
  try { hasil.push({ Pengujian: nama, Status: 'LULUS', Detail: (await fn()) || '' }); }
  catch (e) { hasil.push({ Pengujian: nama, Status: 'GAGAL', Detail: e.message }); }
}

(async () => {
  await pool.query("INSERT INTO prodi VALUES ('TST','Prodi Uji','S1') ON CONFLICT DO NOTHING");
  await pool.query('DELETE FROM mahasiswa WHERE nim = $1', [NIM]);

  await uji('CREATE mahasiswa', async () => {
    const r = await pool.query(
      `INSERT INTO mahasiswa (nim,nama,email,tahun_masuk,status,kode_prodi)
       VALUES ($1,'Uji Satu','uji@uji.ac.id',2024,'Aktif','TST') RETURNING *`, [NIM]);
    assert(r.rowCount === 1, 'Insert gagal');
  });

  await uji('READ mahasiswa', async () => {
    const r = await pool.query('SELECT * FROM mahasiswa WHERE nim = $1', [NIM]);
    assert(r.rows[0]?.nama === 'Uji Satu', 'Data tidak sesuai');
  });

  await uji('UPDATE mahasiswa', async () => {
    await pool.query("UPDATE mahasiswa SET nama = 'Uji Diubah' WHERE nim = $1", [NIM]);
    const r = await pool.query('SELECT nama FROM mahasiswa WHERE nim = $1', [NIM]);
    assert(r.rows[0].nama === 'Uji Diubah', 'Update tidak tersimpan');
  });

  await uji('NEGATIF: NIM duplikat harus ditolak (23505)', async () => {
    try {
      await pool.query(`INSERT INTO mahasiswa (nim,nama,tahun_masuk,kode_prodi) VALUES ($1,'X',2024,'TST')`, [NIM]);
    } catch (e) { assert(e.code === '23505', 'Kode error salah: ' + e.code); return 'Ditolak: ' + e.code; }
    throw new Error('Duplikat malah diterima');
  });

  await uji('NEGATIF: prodi tidak ada harus ditolak (23503)', async () => {
    try {
      await pool.query(`INSERT INTO mahasiswa (nim,nama,tahun_masuk,kode_prodi) VALUES ('T00000000002','X',2024,'ZZZ')`);
    } catch (e) { assert(e.code === '23503', 'Kode error salah: ' + e.code); return 'Ditolak: ' + e.code; }
    throw new Error('FK tidak berfungsi');
  });

  await uji('NEGATIF: nama kosong harus ditolak (23502)', async () => {
    try {
      await pool.query(`INSERT INTO mahasiswa (nim,nama,tahun_masuk,kode_prodi) VALUES ('T00000000003',NULL,2024,'TST')`);
    } catch (e) { assert(e.code === '23502', 'Kode error salah: ' + e.code); return 'Ditolak: ' + e.code; }
    throw new Error('NOT NULL tidak berfungsi');
  });

  await uji('DELETE mahasiswa', async () => {
    await pool.query('DELETE FROM mahasiswa WHERE nim = $1', [NIM]);
    const r = await pool.query('SELECT 1 FROM mahasiswa WHERE nim = $1', [NIM]);
    assert(r.rowCount === 0, 'Data masih ada');
  });

  await pool.query("DELETE FROM prodi WHERE kode_prodi = 'TST'");
  console.table(hasil);
  await pool.end();
})();