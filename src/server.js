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

app.use('/api/auth', auth.router);
app.use('/api', auth.requireApiLogin);
app.use('/api', access.guard);
app.use(auth.requirePage);

app.use(express.static(path.join(__dirname, '..', 'public')));
// Metadata mengikuti struktur database modul_krs.
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

const keyOf = (table, row) =>
  tables[table].pk.map(k => String(row[k])).join('~');

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
async function all(table) {
  if (!validTable(table)) {
    throw new Error('Tabel tidak dikenal');
  }

  const { rows } = await pool.query(`SELECT * FROM ${table}`);

  return rows.map(row => ({
    ...row,
    ...(row.status ? { status: cleanStatus(row.status) } : {})
  }));
}

// Menambahkan label relasi agar tampilan frontend lebih mudah dibaca.
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
    all('prodi'),
    all('dosen'),
    all('mahasiswa'),
    all('mata_kuliah'),
    all('periode'),
    all('kelas'),
    all('krs')
  ]);

  const aturan = await all('aturan_akademik');

  if (table === 'dosen') {
    return rows.map(r => ({
      ...r,
      label_prodi: prodi.find(
        x => x.kode_prodi === r.kode_prodi
      )?.nama_prodi
    }));
  }

  if (table === 'mahasiswa') {
    return rows.map(r => ({
      ...r,
      label_prodi: prodi.find(
        x => x.kode_prodi === r.kode_prodi
      )?.nama_prodi,
      label_dosen_pa: dosen.find(
        x => Number(x.id_dosen) === Number(r.id_dosen_pa)
      )?.nama
    }));
  }

  if (table === 'mata_kuliah') {
    return rows.map(r => ({
      ...r,
      label_prodi: prodi.find(
        x => x.kode_prodi === r.kode_prodi
      )?.nama_prodi
    }));
  }

  if (table === 'kelas') {
    return rows.map(r => ({
      ...r,
      label_mk: mk.find(
        x => x.kode_mk === r.kode_mk
      )?.nama_mk,
      label_periode: periode.find(
        x => x.id_periode === r.id_periode
      )?.nama_periode,
      label_dosen: dosen.find(
        x => Number(x.id_dosen) === Number(r.id_dosen)
      )?.nama
    }));
  }

  if (table === 'krs') {
    return rows.map(r => ({
      ...r,
      label_mahasiswa: mahasiswa.find(
        x => x.nim === r.nim
      )?.nama,
      label_periode: periode.find(
        x => x.id_periode === r.id_periode
      )?.nama_periode,
      label_aturan: aturan.find(
        x => x.kode_aturan === r.kode_aturan
      )?.keterangan
    }));
  }

  if (table === 'krs_detail') {
    return rows.map(r => {
      const parent = krs.find(
        x => Number(x.id_krs) === Number(r.id_krs)
      );

      const selectedClass = kelas.find(
        x => Number(x.id_kelas) === Number(r.id_kelas)
      );

      const subject = mk.find(
        x => x.kode_mk === selectedClass?.kode_mk
      );

      return {
        ...r,
        label_mahasiswa: mahasiswa.find(
          x => x.nim === parent?.nim
        )?.nama,
        label_periode: periode.find(
          x => x.id_periode === parent?.id_periode
        )?.nama_periode,
        label_mk: subject?.nama_mk,
        label_kelas: selectedClass?.nama_kelas,
        label_sks: subject?.sks ?? 0
      };
    });
  }

  return rows;
}

// Menghitung ringkasan KRS.
async function getSummary(idKrs, client = pool) {
  const result = await client.query(`
    SELECT
      k.id_krs,
      m.nama AS mahasiswa,
      lower(k.status) AS status,
      COUNT(kd.id_kelas)::int AS jumlah_mata_kuliah,
      COALESCE(SUM(mk.sks), 0)::int AS total_sks
    FROM krs k
    JOIN mahasiswa m ON m.nim = k.nim
    LEFT JOIN krs_detail kd ON kd.id_krs = k.id_krs
    LEFT JOIN kelas kl ON kl.id_kelas = kd.id_kelas
    LEFT JOIN mata_kuliah mk ON mk.kode_mk = kl.kode_mk
    WHERE k.id_krs = $1
    GROUP BY k.id_krs, m.nama, k.status
  `, [idKrs]);

  if (!result.rowCount) {
    throw new Error('KRS tidak ditemukan');
  }

  return result.rows[0];
}

// Validasi detail KRS.
async function validateKrsDetail(body, currentKey = null, client = pool) {
  const parentResult = await client.query(
    'SELECT * FROM krs WHERE id_krs = $1',
    [body.id_krs]
  );

  const classResult = await client.query(
    'SELECT * FROM kelas WHERE id_kelas = $1',
    [body.id_kelas]
  );

  const parent = parentResult.rows[0];
  const selectedClass = classResult.rows[0];

  if (!parent || !selectedClass) {
    throw new Error('KRS atau kelas kuliah tidak ditemukan');
  }

  if (String(parent.status).toLowerCase() !== 'draft') {
    throw new Error('Detail hanya bisa diubah saat KRS berstatus draft');
  }

  if (String(parent.id_periode) !== String(selectedClass.id_periode)) {
    throw new Error('Periode kelas tidak sesuai dengan periode KRS');
  }

  const duplicate = await client.query(
    `SELECT 1 FROM krs_detail
     WHERE id_krs = $1 AND id_kelas = $2`,
    [body.id_krs, body.id_kelas]
  );

  if (
    duplicate.rowCount &&
    currentKey !== `${body.id_krs}~${body.id_kelas}`
  ) {
    throw new Error('Kelas ini sudah ada dalam KRS');
  }

  const summary = await client.query(`
    SELECT COALESCE(SUM(mk.sks), 0)::int AS total
    FROM krs_detail kd
    JOIN kelas kl ON kl.id_kelas = kd.id_kelas
    JOIN mata_kuliah mk ON mk.kode_mk = kl.kode_mk
    WHERE kd.id_krs = $1
      AND NOT (kd.id_krs = $1 AND kd.id_kelas = $2)
  `, [body.id_krs, body.id_kelas]);

  const subject = await client.query(
    'SELECT sks FROM mata_kuliah WHERE kode_mk = $1',
    [selectedClass.kode_mk]
  );

  const rule = await client.query(
    "SELECT nilai FROM aturan_akademik WHERE kode_aturan = 'MAX_SKS'"
  );

  const maxSks = Number(rule.rows[0]?.nilai ?? 24);

  if (
    Number(summary.rows[0].total) +
    Number(subject.rows[0]?.sks || 0) > maxSks
  ) {
    throw new Error(`Total SKS melebihi batas ${maxSks} SKS`);
  }
}

// Menyesuaikan data input dengan kolom database.
function normalizeBody(table, input) {
  const definition = tables[table];
  const body = {};

  for (const field of definition.fields) {
    const column = field[0];

    if (Object.prototype.hasOwnProperty.call(input, column)) {
      let value = input[column];

      if (value === '') value = null;

      if (field[2] === 'number' && value != null) {
        value = Number(value);
      }

      if (column === 'status' && value != null) {
        value = dbStatus(value);
      }

      body[column] = value;
    }
  }

  return body;
}

// Validasi relasi antar tabel.
async function validateReferences(table, body, client = pool) {
  const refs = {
    dosen: [
      ['kode_prodi', 'prodi', 'kode_prodi']
    ],

    mahasiswa: [
      ['kode_prodi', 'prodi', 'kode_prodi'],
      ['id_dosen_pa', 'dosen', 'id_dosen', true]
    ],

    mata_kuliah: [
      ['kode_prodi', 'prodi', 'kode_prodi']
    ],

    kelas: [
      ['kode_mk', 'mata_kuliah', 'kode_mk'],
      ['id_periode', 'periode', 'id_periode'],
      ['id_dosen', 'dosen', 'id_dosen']
    ],

    krs: [
      ['nim', 'mahasiswa', 'nim'],
      ['id_periode', 'periode', 'id_periode'],
      ['kode_aturan', 'aturan_akademik', 'kode_aturan']
    ],

    krs_detail: [
      ['id_krs', 'krs', 'id_krs'],
      ['id_kelas', 'kelas', 'id_kelas']
    ]
  };

  for (const [field, target, targetKey, optional] of refs[table] || []) {
    const value = body[field];

    if ((value === '' || value == null) && optional) {
      continue;
    }

    if (value == null || value === '') {
      throw new Error(`${field} wajib diisi`);
    }

    const result = await client.query(
      `SELECT 1 FROM ${target} WHERE ${targetKey} = $1`,
      [value]
    );

    if (!result.rowCount) {
      throw new Error(`Referensi ${field} tidak ditemukan di ${target}`);
    }
  }
}

// Memeriksa koneksi database.
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');

    res.json({
      ok: true,
      database: 'connected',
      storage: 'postgresql'
    });
  } catch (e) {
    res.status(500).json({
      ok: false,
      database: 'disconnected',
      error: e.message
    });
  }
});

// Metadata tabel.
app.get('/api/meta', (req, res) => {
  res.json(tables);
});

// Statistik dashboard.
app.get('/api/stats', async (req, res) => {
  try {
    const stats = {};

    for (const table of Object.keys(tables)) {
      const result = await pool.query(
        `SELECT COUNT(*)::int AS total FROM ${table}`
      );

      stats[table] = result.rows[0].total;
    }

    res.json(stats);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Data untuk dropdown.
app.get('/api/options/:table', async (req, res) => {
  try {
    res.json(await all(req.params.table));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Menampilkan data tabel.
app.get('/api/:table', async (req, res) => {
  try {
    const table = req.params.table;
    const rows = await all(table);

    res.json(await withLabels(table, rows));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Menambahkan data.
app.post('/api/:table', async (req, res) => {
  const client = await pool.connect();

  try {
    const table = req.params.table;

    if (!validTable(table)) {
      throw new Error('Tabel tidak dikenal');
    }

    const body = normalizeBody(table, req.body);

  // Hapus ID otomatis jika belum diisi.
  for (const field of tables[table].fields) {
    const column = field[0];

    if (
      field[2] === 'number' &&
      !field[3] &&
      body[column] == null
    ) {
      delete body[column];
    }
  }

  if (table === 'krs') {
    body.status = 'Draft';
  }

    for (const field of tables[table].fields) {
      if (
        field[3] &&
        (body[field[0]] == null || body[field[0]] === '')
      ) {
        throw new Error(`${field[1]} wajib diisi`);
      }
    }

    await client.query('BEGIN');

    await validateReferences(table, body, client);

    if (table === 'krs_detail') {
      await validateKrsDetail(body, null, client);
    }

    const columns = Object.keys(body);
    const values = columns.map(c => body[c]);

    const sql = columns.length
      ? `INSERT INTO ${table}
         (${columns.join(', ')})
         VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')})
         RETURNING *`
      : `INSERT INTO ${table} DEFAULT VALUES RETURNING *`;

    const result = await client.query(sql, values);

    await client.query('COMMIT');

    const row = {
      ...result.rows[0],
      ...(result.rows[0].status
        ? { status: cleanStatus(result.rows[0].status) }
        : {})
    };

    res.status(201).json(row);

  } catch (e) {
    await client.query('ROLLBACK');

    res.status(400).json({
      error: e.detail || e.message
    });

  } finally {
    client.release();
  }
});

// Mengubah data.
app.put('/api/:table/:key', async (req, res) => {
  const client = await pool.connect();

  try {
    const table = req.params.table;

    if (!validTable(table)) {
      throw new Error('Tabel tidak dikenal');
    }

    const definition = tables[table];

    const keyParts = decodeURIComponent(req.params.key).split('~');

    if (keyParts.length !== definition.pk.length) {
      throw new Error('Format kunci utama tidak valid');
    }

    await client.query('BEGIN');

    const where = definition.pk
      .map((col, i) => `${col} = $${i + 1}`)
      .join(' AND ');

    const existing = await client.query(
      `SELECT * FROM ${table} WHERE ${where} FOR UPDATE`,
      keyParts
    );

    if (!existing.rowCount) {
      await client.query('ROLLBACK');

      return res.status(404).json({
        error: 'Data tidak ditemukan'
      });
    }

    const body = {
      ...existing.rows[0],
      ...normalizeBody(table, req.body)
    };

    if (table === 'krs') {
      if (String(existing.rows[0].status).toLowerCase() !== 'draft') {
        throw new Error('KRS yang sudah diajukan atau diproses tidak bisa diubah');
      }

      if (String(body.status).toLowerCase() !== 'draft') {
        throw new Error('Gunakan proses Ajukan KRS untuk mengubah status');
      }
    }

    for (const field of definition.fields) {
      if (
        field[3] &&
        (body[field[0]] == null || body[field[0]] === '')
      ) {
        throw new Error(`${field[1]} wajib diisi`);
      }
    }

    await validateReferences(table, body, client);

    if (table === 'krs_detail') {
      await validateKrsDetail(body, keyParts.join('~'), client);
    }

    const updateCols = Object.keys(
      normalizeBody(table, req.body)
    ).filter(c => !definition.pk.includes(c));

    let result;

    if (!updateCols.length) {
      result = { rows: [existing.rows[0]] };
    } else {
      const values = updateCols.map(c => body[c]);

      const set = updateCols
        .map((c, i) => `${c} = $${keyParts.length + i + 1}`)
        .join(', ');

      result = await client.query(
        `UPDATE ${table}
         SET ${set}
         WHERE ${where}
         RETURNING *`,
        [...keyParts, ...values]
      );
    }

    await client.query('COMMIT');

    res.json({
      ...result.rows[0],
      ...(result.rows[0].status
        ? { status: cleanStatus(result.rows[0].status) }
        : {})
    });

  } catch (e) {
    await client.query('ROLLBACK');

    res.status(400).json({
      error: e.detail || e.message
    });

  } finally {
    client.release();
  }
});

// Menghapus data.
app.delete('/api/:table/:key', async (req, res) => {
  try {
    const table = req.params.table;

    if (!validTable(table)) {
      throw new Error('Tabel tidak dikenal');
    }

    const definition = tables[table];

    const keyParts = decodeURIComponent(req.params.key).split('~');

    if (keyParts.length !== definition.pk.length) {
      throw new Error('Format kunci utama tidak valid');
    }

    const where = definition.pk
      .map((col, i) => `${col} = $${i + 1}`)
      .join(' AND ');

    const result = await pool.query(
      `DELETE FROM ${table} WHERE ${where} RETURNING *`,
      keyParts
    );

    if (!result.rowCount) {
      return res.status(404).json({
        error: 'Data tidak ditemukan'
      });
    }

    res.json({ ok: true });

  } catch (e) {
    const message = e.code === '23503'
      ? 'Data masih digunakan oleh relasi lain'
      : (e.detail || e.message);

    res.status(400).json({ error: message });
  }
});

// Ringkasan KRS.
app.get('/api/krs/:id/summary', async (req, res) => {
  try {
    res.json(await getSummary(req.params.id));
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
});

// Mengajukan KRS.
app.post('/api/krs/:id/submit', async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const result = await client.query(
      'SELECT * FROM krs WHERE id_krs = $1 FOR UPDATE',
      [req.params.id]
    );

    const krs = result.rows[0];

    if (!krs) {
      throw new Error('KRS tidak ditemukan');
    }

    if (String(krs.status).toLowerCase() !== 'draft') {
      throw new Error('KRS hanya bisa diajukan saat berstatus draft');
    }

    const details = await client.query(`
      SELECT kd.id_kelas, kl.id_periode
      FROM krs_detail kd
      JOIN kelas kl ON kl.id_kelas = kd.id_kelas
      WHERE kd.id_krs = $1
    `, [req.params.id]);

    if (!details.rowCount) {
      throw new Error('Tambahkan minimal satu kelas sebelum mengajukan KRS');
    }

    if (
      details.rows.some(
        row => String(row.id_periode) !== String(krs.id_periode)
      )
    ) {
      throw new Error('Periode kelas tidak sesuai dengan periode KRS');
    }

    const summary = await getSummary(req.params.id, client);

    const rule = await client.query(
      "SELECT nilai FROM aturan_akademik WHERE kode_aturan = 'MAX_SKS'"
    );

    const maxSks = Number(rule.rows[0]?.nilai ?? 24);

    if (summary.total_sks > maxSks) {
      throw new Error(
        `Total SKS ${summary.total_sks} melebihi batas ${maxSks} SKS`
      );
    }

    await client.query(
      "UPDATE krs SET status = 'Diajukan' WHERE id_krs = $1",
      [req.params.id]
    );

    await client.query('COMMIT');

    res.json({
      ok: true,
      message: 'KRS berhasil diajukan',
      ...summary,
      status: 'diajukan'
    });

  } catch (e) {
    await client.query('ROLLBACK');

    res.status(400).json({
      error: e.detail || e.message
    });

  } finally {
    client.release();
  }
});

// Mengarahkan halaman selain API ke index.html.
app.get('*', (req, res) => {
  res.sendFile(
    path.join(__dirname, '..', 'public', 'index.html')
  );
});

// Menjalankan server.
const port = Number(process.env.PORT || 3001);

app.listen(port, async () => {
  console.log(`SIKRS berjalan di http://localhost:${port}`);

  try {
    await pool.query('SELECT 1');
    console.log('Koneksi PostgreSQL berhasil!');
  } catch (error) {
    console.error('Koneksi database gagal:', error.message);
  }
});