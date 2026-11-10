const fs = require('fs');
const path = require('path');
const pool = require('../src/db');

const rows = fs.readFileSync(path.join(__dirname, 'data', 'mahasiswa_1000.csv'), 'utf8')
  .trim().split('\n').slice(1).map((l) => {
    const [nim, nama, email, tahun_masuk, status, kode_prodi] = l.trim().split(',');
    return { nim, nama, email, tahun_masuk: Number(tahun_masuk), status, kode_prodi };
  });

const hasil = [];
const bersih = () => pool.query("DELETE FROM mahasiswa WHERE kode_prodi = 'TST'");

async function ukur(nama, fn) {
  const t = performance.now();
  let gagal = 0;
  try { gagal = (await fn()) || 0; } catch (e) { gagal = 'ERROR: ' + e.message; }
  hasil.push({ Pengujian: nama, 'Waktu (ms)': Math.round(performance.now() - t), Gagal: gagal });
}

const SQL1 = `INSERT INTO mahasiswa (nim,nama,email,tahun_masuk,status,kode_prodi)
              VALUES ($1,$2,$3,$4,$5,$6)`;
const insertSatu = (r) => pool.query(SQL1, [r.nim, r.nama, r.email, r.tahun_masuk, r.status, r.kode_prodi]);

(async () => {
  await pool.query("INSERT INTO prodi VALUES ('TST','Prodi Uji','S1') ON CONFLICT DO NOTHING");
  await bersih();

  await ukur('INSERT 1000 data, satu per satu (berurutan)', async () => {
    let g = 0;
    for (const r of rows) { try { await insertSatu(r); } catch { g++; } }
    return g;
  });
  await bersih();

  await ukur('INSERT 1000 data, bulk (1 query)', async () => {
    await pool.query(
      `INSERT INTO mahasiswa (nim,nama,email,tahun_masuk,status,kode_prodi)
       SELECT * FROM unnest($1::text[],$2::text[],$3::text[],$4::int[],$5::text[],$6::text[])`,
      ['nim', 'nama', 'email', 'tahun_masuk', 'status', 'kode_prodi'].map((k) => rows.map((r) => r[k])));
  });
  await bersih();

  await ukur('INSERT 1000 data, paralel via pool (default max 10)', async () => {
    const res = await Promise.allSettled(rows.map(insertSatu));
    return res.filter((x) => x.status === 'rejected').length;
  });

  await ukur('READ: SELECT * mahasiswa x100', async () => {
    for (let i = 0; i < 100; i++) await pool.query('SELECT * FROM mahasiswa');
  });

  await ukur('READ SEBELUM refactor: 7 tabel penuh x20 (meniru withLabels)', async () => {
    const t = ['prodi', 'dosen', 'mahasiswa', 'mata_kuliah', 'periode', 'kelas', 'krs'];
    for (let i = 0; i < 20; i++) await Promise.all(t.map((n) => pool.query(`SELECT * FROM ${n}`)));
  });

  await ukur('READ SESUDAH refactor: 3 tabel saja x20 (mahasiswa+prodi+dosen)', async () => {
    const t = ['mahasiswa', 'prodi', 'dosen'];
    for (let i = 0; i < 20; i++) await Promise.all(t.map((n) => pool.query(`SELECT * FROM ${n}`)));
  });

  await ukur('UPDATE 1000 data, satu per satu', async () => {
    for (const r of rows) await pool.query("UPDATE mahasiswa SET status = 'Cuti' WHERE nim = $1", [r.nim]);
  });

  await ukur('DELETE 1000 data (bulk)', async () => { await bersih(); });

  await pool.query("DELETE FROM prodi WHERE kode_prodi = 'TST'");
  console.table(hasil);
  fs.writeFileSync(path.join(__dirname, 'hasil-stress.json'), JSON.stringify(hasil, null, 2));
  await pool.end();
})();