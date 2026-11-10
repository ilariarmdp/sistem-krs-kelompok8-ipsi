const express = require('express');
const path = require('path');
const session = require('express-session');
const pool = require('./db');
const auth = require('./auth');
const access = require('./access');
const app = express();
app.use(express.json());

app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-ganti-di-env',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, maxAge: 1000 * 60 * 60 * 8 }
}));

// Cek koneksi aplikasi ke server dan database.
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    return res.json({ ok: true });
  } catch (error) {
    console.error('Health:', error);
    return res.status(500).json({
      ok: false,
      error: 'Database tidak terhubung'
    });
  }
});

app.use('/api/auth', auth.router);
app.use('/api', auth.requireApiLogin);
app.use('/api/paket', require('./paket'));
app.use('/api', access.guard);
app.use(auth.requirePage);

app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api/paket', require('./paket'));
app.use('/api', access.guard);
app.use(auth.requirePage);

app.use(express.static(path.join(__dirname, '..', 'public')));

// Mengambil ref (NIM / id_dosen) dari sesi.
const ambilRefPengguna = (user) => user.ref ?? user.ref_id;

// Metadata tabel.
const tables = {
  prodi: {
    label: 'Program Studi',
    pk: ['kode_prodi'],
    fields: [
      ['kode_prodi', 'Kode Prodi', 'text', true],
      ['nama_prodi', 'Nama Program Studi', 'text', true],
      ['jenjang', 'Jenjang', 'select', true, ['D3', 'D4', 'S1', 'S2', 'S3']]
    ]
  },

  dosen: {
    label: 'Dosen',
    pk: ['id_dosen'],
    fields: [
      ['id_dosen', 'ID Dosen', 'number', false],
      ['nidn', 'NIDN', 'text', false],
      ['nama', 'Nama Dosen', 'text', true],
      ['email', 'Email', 'email', false],
      ['kode_prodi', 'Program Studi', 'fk', true, 'prodi', 'kode_prodi', 'nama_prodi']
    ]
  },

  mahasiswa: {
    label: 'Mahasiswa',
    pk: ['nim'],
    fields: [
      ['nim', 'NIM', 'text', true],
      ['nama', 'Nama Mahasiswa', 'text', true],
      ['email', 'Email', 'email', false],
      ['tahun_masuk', 'Tahun Masuk', 'number', true],
      ['status', 'Status', 'select', true, ['aktif', 'cuti', 'lulus', 'keluar']],
      ['kode_prodi', 'Program Studi', 'fk', true, 'prodi', 'kode_prodi', 'nama_prodi'],
      ['id_dosen_pa', 'Dosen PA', 'fk', false, 'dosen', 'id_dosen', 'nama']
    ]
  },

  mata_kuliah: {
    label: 'Mata Kuliah',
    pk: ['kode_mk'],
    fields: [
      ['kode_mk', 'Kode MK', 'text', true],
      ['nama_mk', 'Nama Mata Kuliah', 'text', true],
      ['sks', 'SKS', 'number', true],
      ['semester_ke', 'Semester', 'number', true],
      ['kode_prodi', 'Program Studi', 'fk', true, 'prodi', 'kode_prodi', 'nama_prodi']
    ]
  },

  periode: {
    label: 'Periode Akademik',
    pk: ['id_periode'],
    fields: [
      ['id_periode', 'ID Periode', 'text', true],
      ['nama_periode', 'Nama Periode', 'text', true],
      ['tgl_mulai', 'Tanggal Mulai', 'date', true],
      ['tgl_selesai', 'Tanggal Selesai', 'date', true]
    ]
  },

  kelas: {
    label: 'Kelas Kuliah',
    pk: ['id_kelas'],
    fields: [
      ['id_kelas', 'ID Kelas', 'number', false],
      ['kode_mk', 'Mata Kuliah', 'fk', true, 'mata_kuliah', 'kode_mk', 'nama_mk'],
      ['id_periode', 'Periode', 'fk', true, 'periode', 'id_periode', 'nama_periode'],
      ['id_dosen', 'Dosen Pengampu', 'fk', true, 'dosen', 'id_dosen', 'nama'],
      ['nama_kelas', 'Nama Kelas', 'text', true],
      ['kuota', 'Kuota', 'number', true],
      ['ruangan', 'Ruangan', 'text', false]
    ]
  },

  krs: {
    label: 'KRS Mahasiswa',
    pk: ['id_krs'],
    fields: [
      ['id_krs', 'ID KRS', 'number', false],
      ['nim', 'Mahasiswa', 'fk', true, 'mahasiswa', 'nim', 'nama'],
      ['id_periode', 'Periode', 'fk', true, 'periode', 'id_periode', 'nama_periode'],
      ['kode_aturan', 'Aturan Akademik', 'fk', true, 'aturan_akademik', 'kode_aturan', 'keterangan'],
      ['tgl_isi', 'Tanggal Isi', 'date', true],
      ['status', 'Status KRS', 'select', true, ['draft', 'diajukan', 'disetujui', 'ditolak']]
    ]
  },

  krs_detail: {
    label: 'Detail KRS',
    pk: ['id_krs', 'id_kelas'],
    fields: [
      ['id_krs', 'KRS', 'fk', true, 'krs', 'id_krs', 'id_krs'],
      ['id_kelas', 'Kelas', 'fk', true, 'kelas', 'id_kelas', 'id_kelas'],
      ['nilai_huruf', 'Nilai Huruf', 'select', false, ['', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'D', 'E']]
    ]
  },

  aturan_akademik: {
    label: 'Aturan Akademik',
    pk: ['kode_aturan'],
    fields: [
      ['kode_aturan', 'Kode Aturan', 'text', true],
      ['nilai', 'Nilai', 'number', true],
      ['keterangan', 'Keterangan', 'text', false]
    ]
  }
};

const validTable = (name) =>
  Object.prototype.hasOwnProperty.call(tables, name);

const cleanStatus = (value) =>
  typeof value === 'string' ? value.toLowerCase() : value;

const dbStatus = (value) =>
  typeof value === 'string'
    ? ({
        aktif: 'Aktif',
        draft: 'Draft',
        diajukan: 'Diajukan',
        disetujui: 'Disetujui',
        ditolak: 'Ditolak'
      }[value.toLowerCase()] || value)
    : value;

// Mengambil seluruh data dari PostgreSQL.
async function ambilSemuaBaris(table) {
  if (!validTable(table)) {
    throw new Error('Tabel tidak dikenal');
  }

  const { rows } = await pool.query(`SELECT * FROM ${table}`);

  return rows.map(row => ({
    ...row,
    ...(row.status ? { status: cleanStatus(row.status) } : {})
  }));
}

// Menambahkan label relasi agar tampilan frontend mudah dibaca.
async function withLabels(table, rows) {
  const [
    prodi,
    dosen,
    mahasiswa,
    mk,
    periode,
    kelas,
    krs
  ] = await Promise.all([
    ambilSemuaBaris('prodi'),
    ambilSemuaBaris('dosen'),
    ambilSemuaBaris('mahasiswa'),
    ambilSemuaBaris('mata_kuliah'),
    ambilSemuaBaris('periode'),
    ambilSemuaBaris('kelas'),
    ambilSemuaBaris('krs')
  ]);

    const prodiMap = Object.fromEntries(
    prodi.map(row => [row.kode_prodi, row.nama_prodi])
  );

  const dosenMap = Object.fromEntries(
    dosen.map(row => [row.id_dosen, row.nama])
  );

  const mahasiswaMap = Object.fromEntries(
    mahasiswa.map(row => [row.nim, row.nama])
  );

  const mkMap = Object.fromEntries(
    mk.map(row => [row.kode_mk, row.nama_mk])
  );

  const periodeMap = Object.fromEntries(
    periode.map(row => [row.id_periode, row.nama_periode])
  );

  const kelasMap = Object.fromEntries(
    kelas.map(row => [row.id_kelas, row.nama_kelas])
  );

  const krsMap = Object.fromEntries(
    krs.map(row => [row.id_krs, row.nim])
  );

  const kelasMkMap = Object.fromEntries(
    kelas.map(row => [row.id_kelas, row.kode_mk])
  );

  const sksMap = Object.fromEntries(
    mk.map(row => [row.kode_mk, row.sks])
  );

  return rows.map(row => {
    const result = { ...row };

    if (table === 'dosen' || table === 'mahasiswa' || table === 'mata_kuliah') {
      result.label_prodi = prodiMap[row.kode_prodi] || '';
    }

    if (table === 'mahasiswa') {
      result.label_dosen_pa = dosenMap[row.id_dosen_pa] || '';
    }

    if (table === 'kelas') {
      result.label_mk = mkMap[row.kode_mk] || '';
      result.label_periode = periodeMap[row.id_periode] || '';
      result.label_dosen = dosenMap[row.id_dosen] || '';
    }

    if (table === 'krs') {
      result.label_mahasiswa = mahasiswaMap[row.nim] || '';
      result.label_periode = periodeMap[row.id_periode] || '';
    }

    if (table === 'krs_detail') {
      const kodeMk = kelasMkMap[row.id_kelas];

      result.nim = krsMap[row.id_krs] || '';
      result.label_mahasiswa = mahasiswaMap[result.nim] || '';
      result.label_mk = mkMap[kodeMk] || '';
      result.label_kelas = kelasMap[row.id_kelas] || '';
      result.label_sks = sksMap[kodeMk] ?? 0;
    }

    return result;
  });
}

// Mengambil nilai primary key dari data.
function getPk(table, row) {
  return tables[table].pk.map(key => row[key]);
}

// Memeriksa apakah nilai wajib sudah diisi.
function validateRequired(table, data) {
  const requiredFields = tables[table].fields
    .filter(field => field[3])
    .map(field => field[0]);

  return requiredFields.every(field => {
    const value = data[field];
    return value !== undefined && value !== null && value !== '';
  });
}

// Memeriksa apakah data memiliki field yang dikenal.
function filterFields(table, data) {
  const allowedFields = tables[table].fields.map(field => field[0]);

  return Object.fromEntries(
    Object.entries(data).filter(([key]) => allowedFields.includes(key))
  );
}

// Mengambil data berdasarkan primary key.
async function findByPk(table, values) {
  if (!validTable(table)) {
    throw new Error('Tabel tidak dikenal');
  }

  const keys = tables[table].pk;
  const where = keys.map((key, index) => `${key} = $${index + 1}`).join(' AND ');

  const { rows } = await pool.query(
    `SELECT * FROM ${table} WHERE ${where}`,
    values
  );

  return rows[0] || null;
}

// Mengubah status KRS.
async function updateKrsStatus(idKrs, status) {
  const { rows } = await pool.query(
    `UPDATE krs
     SET status = $1
     WHERE id_krs = $2
     RETURNING *`,
    [dbStatus(status), idKrs]
  );

  return rows[0] || null;
}

// Metadata tabel untuk membangun menu dan form di frontend.
app.get('/api/meta', (req, res) => res.json(tables));

// Alias agar frontend tidak perlu fallback ke /api/auth/me.
app.get('/api/me', (req, res) => res.json(req.session.user));

// Statistik dashboard per peran (nama field mengikuti public/app.js).
app.get('/api/stats', async (req, res) => {
  try {
    const user = req.session.user;
    const role = user.role;
    const ref = ambilRefPengguna(user);

    if (role === 'mahasiswa') {
      const { rows } = await pool.query(`
        SELECT
          (SELECT COUNT(*) FROM krs WHERE nim = $1)::int AS "totalKRS",
          (SELECT COUNT(*)
             FROM krs_detail kd JOIN krs k ON k.id_krs = kd.id_krs
            WHERE k.nim = $1)::int AS "totalMatkul",
          (SELECT COALESCE(SUM(mk.sks), 0)
             FROM krs_detail kd
             JOIN krs k ON k.id_krs = kd.id_krs
             JOIN kelas kl ON kl.id_kelas = kd.id_kelas
             JOIN mata_kuliah mk ON mk.kode_mk = kl.kode_mk
            WHERE k.nim = $1)::int AS "totalSKS",
          (SELECT COUNT(*) FROM krs
            WHERE nim = $1 AND LOWER(status) = 'diajukan')::int AS "krsDiajukan",
          (SELECT COUNT(*) FROM krs
            WHERE nim = $1 AND LOWER(status) = 'disetujui')::int AS "krsDisetujui",
          (SELECT COUNT(*) FROM krs
            WHERE nim = $1 AND LOWER(status) = 'ditolak')::int AS "krsDitolak"
      `, [ref]);

      return res.json({ role, ...rows[0] });
    }

    if (role === 'dosen') {
      const { rows } = await pool.query(`
        SELECT
          (SELECT COUNT(*) FROM mahasiswa
            WHERE id_dosen_pa = $1)::int AS "totalMahasiswa",
          (SELECT COUNT(*) FROM kelas
            WHERE id_dosen = $1)::int AS "totalKelas",
          (SELECT COUNT(*) FROM krs k JOIN mahasiswa m ON m.nim = k.nim
            WHERE m.id_dosen_pa = $1
              AND LOWER(k.status) = 'diajukan')::int AS "krsMenunggu",
          (SELECT COUNT(*) FROM krs k JOIN mahasiswa m ON m.nim = k.nim
            WHERE m.id_dosen_pa = $1
              AND LOWER(k.status) = 'disetujui')::int AS "krsDisetujui"
      `, [Number(ref)]);

      return res.json({ role, ...rows[0] });
    }

    const { rows } = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM mahasiswa)::int AS "totalMahasiswa",
        (SELECT COUNT(*) FROM dosen)::int AS "totalDosen",
        (SELECT COUNT(*) FROM mata_kuliah)::int AS "totalMataKuliah",
        (SELECT COUNT(*) FROM krs)::int AS "totalKRS"
    `);

    return res.json({ role, ...rows[0] });
  } catch (error) {
    console.error('Stats:', error);
    return res.status(500).json({ error: 'Gagal mengambil statistik' });
  }
});

// Pilihan untuk dropdown foreign key di form.
app.get('/api/options/:table', async (req, res) => {
  const { table } = req.params;

  if (!validTable(table)) {
    return res.status(404).json({ error: 'Tabel tidak dikenal' });
  }

  try {
    return res.json(await ambilSemuaBaris(table));
  } catch (error) {
    console.error(`GET /api/options/${table}:`, error);
    return res.status(500).json({ error: 'Gagal mengambil pilihan' });
  }
});

// Ringkasan total SKS dari satu KRS.
app.get('/api/krs/:idKrs/summary', async (req, res) => {
  const idKrs = Number(req.params.idKrs);

  if (!Number.isInteger(idKrs) || idKrs <= 0) {
    return res.status(400).json({ error: 'ID KRS tidak valid' });
  }

  try {
    const { rows } = await pool.query(`
      SELECT
        COALESCE(SUM(mk.sks), 0)::int AS total_sks,
        COUNT(*)::int AS total_matkul
      FROM krs_detail kd
      JOIN kelas kl ON kl.id_kelas = kd.id_kelas
      JOIN mata_kuliah mk ON mk.kode_mk = kl.kode_mk
      WHERE kd.id_krs = $1
    `, [idKrs]);

    return res.json(rows[0]);
  } catch (error) {
    console.error('Summary KRS:', error);
    return res.status(500).json({ error: 'Gagal mengambil ringkasan KRS' });
  }
});

// Mengambil seluruh data dari tabel yang diizinkan.
app.get('/api/:table', async (req, res, next) => {
  const { table } = req.params;

  if (!validTable(table)) {
    return next();
  }

  try {
    const rows = await ambilSemuaBaris(table);
    const labeledRows = await withLabels(table, rows);

    return res.json(labeledRows);
  } catch (error) {
    console.error(`GET /api/${table}:`, error);
    return res.status(500).json({ error: 'Gagal mengambil data' });
  }
});

// Mengambil satu data berdasarkan primary key.
app.get('/api/:table/:id', async (req, res, next) => {
  const { table, id } = req.params;

  if (!validTable(table)) {
    return next();
  }

  try {
    const keys = tables[table].pk;
    const values = keys.length === 1
      ? [id]
      : id.split('~');

    if (values.length !== keys.length) {
      return res.status(400).json({ error: 'Primary key tidak valid' });
    }

    const row = await findByPk(table, values);

    if (!row) {
      return res.status(404).json({ error: 'Data tidak ditemukan' });
    }

    const labeledRows = await withLabels(table, [row]);

    return res.json(labeledRows[0]);
  } catch (error) {
    console.error(`GET /api/${table}/${id}:`, error);
    return res.status(500).json({ error: 'Gagal mengambil data' });
  }
});

// Menambahkan data baru.
app.post('/api/:table', async (req, res, next) => {
  const { table } = req.params;

  if (!validTable(table)) {
    return next();
  }

  try {
    const data = filterFields(table, req.body);

    if (!validateRequired(table, data)) {
      return res.status(400).json({ error: 'Field wajib belum lengkap' });
    }

    const fields = Object.keys(data);

    if (!fields.length) {
      return res.status(400).json({ error: 'Tidak ada data yang dikirim' });
    }

    const values = fields.map(field => data[field]);
    const placeholders = fields.map((_, index) => `$${index + 1}`);

    const { rows } = await pool.query(
      `INSERT INTO ${table} (${fields.join(', ')})
       VALUES (${placeholders.join(', ')})
       RETURNING *`,
      values
    );

    return res.status(201).json(rows[0]);
  } catch (error) {
    console.error(`POST /api/${req.params.table}:`, error);
    return res.status(500).json({ error: 'Gagal menambahkan data' });
  }
});

// Memperbarui data berdasarkan primary key.
app.put('/api/:table/:id', async (req, res, next) => {
  const { table, id } = req.params;

  if (!validTable(table)) {
    return next();
  }

  try {
    const keys = tables[table].pk;
    const pkValues = keys.length === 1 ? [id] : id.split('~');

    if (pkValues.length !== keys.length) {
      return res.status(400).json({ error: 'Primary key tidak valid' });
    }

    const data = filterFields(table, req.body);

    for (const key of keys) {
      delete data[key];
    }

    const fields = Object.keys(data);

    if (!fields.length) {
      return res.status(400).json({ error: 'Tidak ada data untuk diperbarui' });
    }

    const values = fields.map(field => data[field]);
    const setClause = fields
      .map((field, index) => `${field} = $${index + 1}`)
      .join(', ');

    const whereClause = keys
      .map((key, index) => `${key} = $${fields.length + index + 1}`)
      .join(' AND ');

    const { rows } = await pool.query(
      `UPDATE ${table}
       SET ${setClause}
       WHERE ${whereClause}
       RETURNING *`,
      [...values, ...pkValues]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Data tidak ditemukan' });
    }

    return res.json(rows[0]);
  } catch (error) {
    console.error(`PUT /api/${table}/${id}:`, error);
    return res.status(500).json({ error: 'Gagal memperbarui data' });
  }
});

// Menghapus data berdasarkan primary key.
app.delete('/api/:table/:id', async (req, res, next) => {
  const { table, id } = req.params;

  if (!validTable(table)) {
    return next();
  }

  try {
    const keys = tables[table].pk;
    const values = keys.length === 1 ? [id] : id.split('~');

    if (values.length !== keys.length) {
      return res.status(400).json({ error: 'Primary key tidak valid' });
    }

    
    const whereClause = keys
      .map((key, index) => `${key} = $${index + 1}`)
      .join(' AND ');

    const { rowCount } = await pool.query(
      `DELETE FROM ${table} WHERE ${whereClause}`,
      values
    );

    if (!rowCount) {
      return res.status(404).json({ error: 'Data tidak ditemukan' });
    }

    return res.json({ ok: true, message: 'Data berhasil dihapus' });
  } catch (error) {
    console.error(`DELETE /api/${table}/${id}:`, error);

    if (error.code === '23503') {
      return res.status(409).json({
        error: 'Data tidak dapat dihapus karena masih digunakan oleh data lain'
      });
    }

    return res.status(500).json({ error: 'Gagal menghapus data' });
  }
});

// Mahasiswa mengajukan KRS.
app.post('/api/krs/:idKrs/ajukan', async (req, res) => {
  const user = req.session.user;

  if (!user || user.role !== 'mahasiswa') {
    return res.status(403).json({
      error: 'Hanya mahasiswa yang dapat mengajukan KRS'
    });
  }

  const idKrs = Number(req.params.idKrs);
  const nim = ambilRefPengguna(user);

  if (!Number.isInteger(idKrs) || idKrs <= 0) {
    return res.status(400).json({ error: 'ID KRS tidak valid' });
  }

  try {
    const { rows } = await pool.query(`
      UPDATE krs
      SET status = 'Diajukan'
      WHERE id_krs = $1
        AND nim = $2
        AND LOWER(status) = 'draft'
      RETURNING *
    `, [idKrs, nim]);

    if (!rows.length) {
      return res.status(404).json({
        error: 'KRS tidak ditemukan atau tidak berstatus draft'
      });
    }

    return res.json({
      ok: true,
      message: 'KRS berhasil diajukan',
      krs: rows[0]
    });
  } catch (error) {
    console.error('Ajukan KRS:', error);
    return res.status(500).json({ error: 'Gagal mengajukan KRS' });
  }
});

// Dosen PA menyetujui atau menolak KRS mahasiswa bimbingannya.
app.put('/api/krs/:idKrs/persetujuan', async (req, res) => {
  const user = req.session.user;

  if (!user || user.role !== 'dosen') {
    return res.status(403).json({
      error: 'Hanya dosen PA yang dapat memproses persetujuan KRS'
    });
  }

  const idKrs = Number(req.params.idKrs);
  const idDosen = Number(ambilRefPengguna(user));
  const status = String(req.body?.status ?? '').toLowerCase();

  if (
    !Number.isInteger(idKrs) ||
    idKrs <= 0 ||
    !Number.isFinite(idDosen) ||
    !['disetujui', 'ditolak'].includes(status)
  ) {
    return res.status(400).json({ error: 'Data persetujuan tidak valid' });
  }

  try {
    const { rows } = await pool.query(`
      UPDATE krs AS k
      SET status = $1
      FROM mahasiswa AS m
      WHERE k.id_krs = $2
        AND m.nim = k.nim
        AND m.id_dosen_pa = $3
        AND LOWER(k.status) = 'diajukan'
      RETURNING k.*
    `, [dbStatus(status), idKrs, idDosen]);

    if (!rows.length) {
      return res.status(404).json({
        error: 'KRS tidak ditemukan, belum diajukan, atau mahasiswa bukan bimbingan Anda'
      });
    }

    return res.json({
      ok: true,
      message: `KRS berhasil ${status}`,
      krs: rows[0]
    });
  } catch (error) {
    console.error('Persetujuan KRS:', error);
    return res.status(500).json({ error: 'Gagal memproses persetujuan KRS' });
  }
});

// Dosen pengampu menginput atau memperbarui nilai huruf mahasiswa.
app.put('/api/krs-detail/:idKrs/:idKelas/nilai', async (req, res) => {
  const user = req.session.user;

  if (!user || user.role !== 'dosen') {
    return res.status(403).json({
      error: 'Hanya dosen pengampu yang dapat menginput nilai'
    });
  }

  const idDosen = Number(ambilRefPengguna(user));
  const idKrs = Number(req.params.idKrs);
  const idKelas = Number(req.params.idKelas);
  const nilai = String(req.body?.nilai_huruf ?? '').trim().toUpperCase();
  const nilaiValid = ['', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'D', 'E'];

  if (
    !Number.isInteger(idKrs) ||
    idKrs <= 0 ||
    !Number.isInteger(idKelas) ||
    idKelas <= 0 ||
    !Number.isFinite(idDosen) ||
    !nilaiValid.includes(nilai)
  ) {
    return res.status(400).json({ error: 'ID atau nilai huruf tidak valid' });
  }

  try {
    const result = await pool.query(`
      UPDATE krs_detail AS kd
      SET nilai_huruf = NULLIF($1, '')
      FROM krs AS k, kelas AS kl
      WHERE kd.id_krs = $2
        AND kd.id_kelas = $3
        AND k.id_krs = kd.id_krs
        AND kl.id_kelas = kd.id_kelas
        AND kl.id_dosen = $4
        AND LOWER(k.status) = 'disetujui'
      RETURNING kd.id_krs, kd.id_kelas, kd.nilai_huruf
    `, [nilai, idKrs, idKelas, idDosen]);

    if (!result.rowCount) {
      return res.status(404).json({
        error: 'Detail KRS tidak ditemukan, KRS belum disetujui, atau kelas bukan kelas yang Anda ampu'
      });
    }

    return res.json({
      ok: true,
      message: 'Nilai berhasil disimpan',
      ...result.rows[0]
    });
  } catch (error) {
    console.error('Input nilai:', error);
    return res.status(500).json({ error: 'Gagal menyimpan nilai' });
  }
});

// Menangani endpoint yang tidak ditemukan.
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Endpoint tidak ditemukan' });
  }

  return res.status(404).send('Halaman tidak ditemukan');
});

// Menjalankan server.
const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Server berjalan di http://localhost:${PORT}`);
});