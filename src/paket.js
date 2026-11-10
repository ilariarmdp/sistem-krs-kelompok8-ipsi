// =====================================================================
//  Fitur: mahasiswa memilih mata kuliah sendiri -> diajukan -> disetujui dosen
//  Dipasang di server.js:  app.use('/api/paket', require('./paket'));
//  (letakkan SETELAH requireApiLogin dan SEBELUM access.guard)
// =====================================================================
const express = require('express');
const pool = require('./db');

const router = express.Router();

const onlyRole = (...roles) => (req, res, next) =>
  roles.includes(req.session.user?.role)
    ? next()
    : res.status(403).json({ error: 'Anda tidak memiliki akses ke fitur ini' });

// Error aturan bisnis (input salah atau aturan dilanggar); pesannya aman ditampilkan ke pengguna.
class ErrorAturan extends Error {
  constructor(message) {
    super(message);
    this.name = 'ErrorAturan';
  }
}

// Error aturan bisnis dijawab 400 dengan pesan aslinya. Error lain (database, bug)
// dicatat di log dan klien hanya menerima pesan umum, tanpa detail isi data.
const fail = (res, e) => {
  if (e instanceof ErrorAturan) {
    return res.status(400).json({ error: e.message });
  }

  console.error('Paket KRS:', e.code || '-', e.message);

  if (e.code === '23503' || e.code === '23505') {
    return res.status(409).json({ error: 'Data bentrok dengan data lain yang sudah ada atau masih dipakai' });
  }

  return res.status(500).json({ error: 'Terjadi kesalahan server' });
};

// Periode terbaru (berdasarkan tanggal mulai).
async function latestPeriode(client = pool) {
  const r = await client.query(
    'SELECT id_periode, nama_periode FROM periode ORDER BY tgl_mulai DESC LIMIT 1'
  );
  return r.rows[0] || null;
}

// Batas SKS dari tabel aturan_akademik (default 24).
async function maxSks(client = pool) {
  const r = await client.query(`
    SELECT nilai FROM aturan_akademik
    WHERE kode_aturan IN ('MAX_SKS', 'SKS_MAX')
       OR upper(coalesce(keterangan, '')) IN ('MAX_SKS', 'SKS_MAX')
    ORDER BY (kode_aturan IN ('MAX_SKS', 'SKS_MAX')) DESC
    LIMIT 1
  `);
  return Number(r.rows[0]?.nilai ?? 24);
}

// Kode aturan yang dipakai saat KRS dibuat otomatis.
async function aturanKode(client = pool) {
  const r = await client.query(`
    SELECT kode_aturan FROM aturan_akademik
    ORDER BY (kode_aturan IN ('MAX_SKS', 'SKS_MAX')) DESC, kode_aturan
    LIMIT 1
  `);
  return r.rows[0]?.kode_aturan || null;
}

// ---------------------------------------------------------------------
//  GET /api/paket/katalog  (mahasiswa)
//  Daftar kelas/mata kuliah periode terbaru + pilihan yang sudah tersimpan.
// ---------------------------------------------------------------------
router.get('/katalog', onlyRole('mahasiswa'), async (req, res) => {
  try {
    const nim = String(req.session.user.ref);
    const periode = await latestPeriode();

    if (!periode) {
      return res.status(404).json({ error: 'Belum ada periode akademik' });
    }

    const krsResult = await pool.query(
      `SELECT id_krs, status FROM krs
       WHERE nim = $1 AND id_periode = $2
       ORDER BY id_krs LIMIT 1`,
      [nim, periode.id_periode]
    );
    const krs = krsResult.rows[0]
      ? { id_krs: krsResult.rows[0].id_krs, status: String(krsResult.rows[0].status).toLowerCase() }
      : null;

    const kelas = (await pool.query(`
      SELECT k.id_kelas, k.nama_kelas, k.kuota,
             mk.kode_mk, mk.nama_mk, mk.sks, mk.semester_ke,
             d.nama AS dosen,
             (SELECT COUNT(*)::int FROM krs_detail kd WHERE kd.id_kelas = k.id_kelas) AS terisi
      FROM kelas k
      JOIN mata_kuliah mk ON mk.kode_mk = k.kode_mk
      LEFT JOIN dosen d ON d.id_dosen = k.id_dosen
      WHERE k.id_periode = $1
      ORDER BY mk.semester_ke, mk.kode_mk
    `, [periode.id_periode])).rows;

    const selected = krs
      ? (await pool.query('SELECT id_kelas FROM krs_detail WHERE id_krs = $1', [krs.id_krs]))
          .rows.map((r) => r.id_kelas)
      : [];

    res.json({ periode, krs, maxSks: await maxSks(), selected, kelas });
  } catch (e) {
    fail(res, e);
  }
});

// ---------------------------------------------------------------------
//  POST /api/paket/simpan  (mahasiswa)  body: { id_kelas: [1, 2, 3] }
//  Membuat KRS (draft) kalau belum ada, lalu mengganti isinya.
// ---------------------------------------------------------------------
router.post('/simpan', onlyRole('mahasiswa'), async (req, res) => {
  const client = await pool.connect();

  try {
    const nim = String(req.session.user.ref);
    const ids = [...new Set(
      (Array.isArray(req.body.id_kelas) ? req.body.id_kelas : [])
        .map(Number).filter(Number.isInteger)
    )];

    if (!ids.length) throw new ErrorAturan('Pilih minimal satu mata kuliah');

    await client.query('BEGIN');

    const periode = await latestPeriode(client);
    if (!periode) throw new ErrorAturan('Belum ada periode akademik');

    let krs = (await client.query(
      `SELECT * FROM krs WHERE nim = $1 AND id_periode = $2
       ORDER BY id_krs LIMIT 1 FOR UPDATE`,
      [nim, periode.id_periode]
    )).rows[0];

    if (krs && !['draft', 'ditolak'].includes(String(krs.status).toLowerCase())) {
      throw new ErrorAturan('KRS sudah diajukan atau disetujui, tidak bisa diubah');
    }

    // Validasi kelas: harus ada dan berada di periode yang sama.
    const kelas = (await client.query(`
      SELECT k.id_kelas, mk.sks
      FROM kelas k JOIN mata_kuliah mk ON mk.kode_mk = k.kode_mk
      WHERE k.id_kelas = ANY($1::int[]) AND k.id_periode = $2
    `, [ids, periode.id_periode])).rows;

    if (kelas.length !== ids.length) {
      throw new ErrorAturan('Ada kelas yang tidak valid untuk periode ini');
    }

    const total = kelas.reduce((sum, r) => sum + Number(r.sks), 0);
    const max = await maxSks(client);

    if (total > max) {
      throw new ErrorAturan(`Total SKS ${total} melebihi batas ${max} SKS`);
    }

    // Buat KRS baru kalau belum ada.
    if (!krs) {
      const kode = await aturanKode(client);
      if (!kode) throw new ErrorAturan('Aturan akademik belum diisi oleh admin');

      krs = (await client.query(
        `INSERT INTO krs (nim, id_periode, kode_aturan, tgl_isi, status)
         VALUES ($1, $2, $3, CURRENT_DATE, 'Draft') RETURNING *`,
        [nim, periode.id_periode, kode]
      )).rows[0];
    } else if (String(krs.status).toLowerCase() === 'ditolak') {
      await client.query("UPDATE krs SET status = 'Draft' WHERE id_krs = $1", [krs.id_krs]);
    }

    // Cek kuota kelas (tidak menghitung KRS milik sendiri).
    const penuh = await client.query(`
      SELECT k.id_kelas FROM kelas k
      WHERE k.id_kelas = ANY($1::int[])
        AND (SELECT COUNT(*) FROM krs_detail kd
             WHERE kd.id_kelas = k.id_kelas AND kd.id_krs <> $2) >= k.kuota
    `, [ids, krs.id_krs]);

    if (penuh.rowCount) throw new ErrorAturan('Ada kelas yang kuotanya sudah penuh');

    // Ganti isi detail KRS.
    await client.query('DELETE FROM krs_detail WHERE id_krs = $1', [krs.id_krs]);
    await client.query(
      'INSERT INTO krs_detail (id_krs, id_kelas) SELECT $1, unnest($2::int[])',
      [krs.id_krs, ids]
    );

    await client.query('COMMIT');

    res.json({
      ok: true,
      message: `Pilihan disimpan (${total} SKS)`,
      id_krs: krs.id_krs,
      total_sks: total
    });
  } catch (e) {
    await client.query('ROLLBACK');
    fail(res, e);
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------
//  POST /api/paket/ajukan/:id  (mahasiswa pemilik KRS, atau admin)
// ---------------------------------------------------------------------
router.post('/ajukan/:id', onlyRole('mahasiswa', 'admin'), async (req, res) => {
  const client = await pool.connect();

  try {
    const u = req.session.user;
    await client.query('BEGIN');

    const krs = (await client.query(
      'SELECT * FROM krs WHERE id_krs = $1 FOR UPDATE', [req.params.id]
    )).rows[0];

    if (!krs) throw new ErrorAturan('KRS tidak ditemukan');
    if (u.role === 'mahasiswa' && String(krs.nim) !== String(u.ref)) {
      throw new ErrorAturan('KRS ini bukan milik Anda');
    }
    if (String(krs.status).toLowerCase() !== 'draft') {
      throw new ErrorAturan('KRS hanya bisa diajukan saat berstatus draft');
    }

    const sum = (await client.query(`
      SELECT COUNT(kd.id_kelas)::int AS jumlah, COALESCE(SUM(mk.sks), 0)::int AS total
      FROM krs_detail kd
      JOIN kelas kl ON kl.id_kelas = kd.id_kelas
      JOIN mata_kuliah mk ON mk.kode_mk = kl.kode_mk
      WHERE kd.id_krs = $1
    `, [krs.id_krs])).rows[0];

    if (!sum.jumlah) throw new ErrorAturan('Pilih minimal satu mata kuliah sebelum mengajukan');

    const max = await maxSks(client);
    if (sum.total > max) throw new ErrorAturan(`Total SKS ${sum.total} melebihi batas ${max} SKS`);

    await client.query("UPDATE krs SET status = 'Diajukan' WHERE id_krs = $1", [krs.id_krs]);
    await client.query('COMMIT');

    res.json({ ok: true, message: 'KRS berhasil diajukan', total_sks: sum.total });
  } catch (e) {
    await client.query('ROLLBACK');
    fail(res, e);
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------
//  PUT /api/paket/persetujuan/:id  (dosen PA)  body: { status: 'disetujui' | 'ditolak' }
// ---------------------------------------------------------------------
router.put('/persetujuan/:id', onlyRole('dosen'), async (req, res) => {
  const client = await pool.connect();

  try {
    const status = String(req.body.status || '').toLowerCase();
    if (!['disetujui', 'ditolak'].includes(status)) {
      throw new ErrorAturan('Status harus disetujui atau ditolak');
    }

    await client.query('BEGIN');

    const krs = (await client.query(`
      SELECT k.* FROM krs k
      JOIN mahasiswa m ON m.nim = k.nim
      WHERE k.id_krs = $1 AND m.id_dosen_pa = $2
      FOR UPDATE OF k
    `, [req.params.id, Number(req.session.user.ref)])).rows[0];

    if (!krs) throw new ErrorAturan('KRS tidak ditemukan atau bukan mahasiswa bimbingan Anda');
    if (String(krs.status).toLowerCase() !== 'diajukan') {
      throw new ErrorAturan('Hanya KRS berstatus diajukan yang dapat diproses');
    }

    await client.query(
      'UPDATE krs SET status = $1 WHERE id_krs = $2',
      [status === 'disetujui' ? 'Disetujui' : 'Ditolak', krs.id_krs]
    );
    await client.query('COMMIT');

    res.json({ ok: true, message: `KRS berhasil ${status}` });
  } catch (e) {
    await client.query('ROLLBACK');
    fail(res, e);
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------
//  GET /api/paket/ringkasan
//  Daftar mata kuliah tiap KRS (untuk kolom "Mata Kuliah" di tabel KRS).
//  Admin: semua | Dosen: mahasiswa bimbingan | Mahasiswa: miliknya.
// ---------------------------------------------------------------------
router.get('/ringkasan', async (req, res) => {
  try {
    const u = req.session.user;
    let where = '';
    let params = [];

    if (u.role === 'mahasiswa') {
      where = 'WHERE k.nim = $1';
      params = [String(u.ref)];
    } else if (u.role === 'dosen') {
      where = 'WHERE m.id_dosen_pa = $1';
      params = [Number(u.ref)];
    }

    const r = await pool.query(`
      SELECT k.id_krs,
             COUNT(mk.kode_mk)::int AS jumlah,
             COALESCE(SUM(mk.sks), 0)::int AS total_sks,
             COALESCE(
               json_agg(json_build_object('kode', mk.kode_mk, 'nama', mk.nama_mk, 'sks', mk.sks)
                        ORDER BY mk.semester_ke, mk.kode_mk)
               FILTER (WHERE mk.kode_mk IS NOT NULL), '[]'
             ) AS items
      FROM krs k
      JOIN mahasiswa m ON m.nim = k.nim
      LEFT JOIN krs_detail kd ON kd.id_krs = k.id_krs
      LEFT JOIN kelas kl ON kl.id_kelas = kd.id_kelas
      LEFT JOIN mata_kuliah mk ON mk.kode_mk = kl.kode_mk
      ${where}
      GROUP BY k.id_krs
    `, params);

    res.json(r.rows);
  } catch (e) {
    fail(res, e);
  }
});

// =====================================================================
//  ADMIN: CRUD KRS + isi mata kuliahnya (krs_detail) sekaligus
//  Status KRS buatan admin selalu 'Diajukan' (tampil "pending"),
//  keputusan setuju/tolak hanya dari dosen.
// =====================================================================

// Nilai awal form (periode terbaru + aturan akademik).
router.get('/admin/default', onlyRole('admin'), async (req, res) => {
  try {
    const p = await latestPeriode();
    res.json({
      id_periode: p?.id_periode || '',
      kode_aturan: (await aturanKode()) || ''
    });
  } catch (e) { fail(res, e); }
});

// Daftar kelas pada satu periode (untuk daftar centang di form admin).
router.get('/admin/kelas/:periode', onlyRole('admin'), async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT k.id_kelas, k.nama_kelas, mk.kode_mk, mk.nama_mk,
             mk.sks, mk.semester_ke, d.nama AS dosen
      FROM kelas k
      JOIN mata_kuliah mk ON mk.kode_mk = k.kode_mk
      LEFT JOIN dosen d ON d.id_dosen = k.id_dosen
      WHERE k.id_periode = $1
      ORDER BY mk.semester_ke, mk.kode_mk
    `, [req.params.periode]);
    res.json(r.rows);
  } catch (e) { fail(res, e); }
});

// Kelas yang sudah dipilih pada satu KRS.
router.get('/admin/krs/:id', onlyRole('admin'), async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT id_kelas FROM krs_detail WHERE id_krs = $1', [req.params.id]
    );
    res.json(r.rows.map((x) => x.id_kelas));
  } catch (e) { fail(res, e); }
});

// Simpan header KRS + ganti isi detail (dipakai tambah dan ubah).
async function simpanKrsAdmin(client, id, b) {
  if (!b.nim || !b.id_periode) {
    throw new ErrorAturan('Mahasiswa dan periode wajib diisi');
  }

  const kode = b.kode_aturan || await aturanKode(client);
  if (!kode) throw new ErrorAturan('Aturan akademik belum diisi');

  const ids = [...new Set(
    (Array.isArray(b.id_kelas) ? b.id_kelas : [])
      .map(Number).filter(Number.isInteger)
  )];

  // Satu mahasiswa hanya boleh punya satu KRS per periode.
  const dup = await client.query(
    `SELECT 1 FROM krs
     WHERE nim = $1 AND id_periode = $2
       AND ($3::int IS NULL OR id_krs <> $3::int)`,
    [b.nim, b.id_periode, id]
  );
  if (dup.rowCount) throw new ErrorAturan('Mahasiswa ini sudah punya KRS di periode tersebut');

  // Kelas harus ada di periode yang sama + cek batas SKS.
  if (ids.length) {
    const kelas = (await client.query(`
      SELECT k.id_kelas, mk.sks
      FROM kelas k JOIN mata_kuliah mk ON mk.kode_mk = k.kode_mk
      WHERE k.id_kelas = ANY($1::int[]) AND k.id_periode = $2
    `, [ids, b.id_periode])).rows;

    if (kelas.length !== ids.length) {
      throw new ErrorAturan('Ada kelas yang bukan dari periode yang dipilih');
    }

    const total = kelas.reduce((s, r) => s + Number(r.sks), 0);
    const max = await maxSks(client);
    if (total > max) throw new ErrorAturan(`Total SKS ${total} melebihi batas ${max} SKS`);
  }

  let idKrs = id;

  if (id) {
    // Ubah: status tidak disentuh admin.
    const u = await client.query(
      `UPDATE krs SET nim = $1, id_periode = $2, kode_aturan = $3,
              tgl_isi = COALESCE($4::date, tgl_isi)
       WHERE id_krs = $5 RETURNING id_krs`,
      [b.nim, b.id_periode, kode, b.tgl_isi || null, id]
    );
    if (!u.rowCount) throw new ErrorAturan('KRS tidak ditemukan');
  } else {
    // Tambah: ID boleh diisi manual, kalau kosong dibuat otomatis.
    let newId = null;

    if (b.id_krs !== undefined && b.id_krs !== null && b.id_krs !== '') {
      newId = Number(b.id_krs);
      if (!Number.isInteger(newId) || newId <= 0) {
        throw new ErrorAturan('ID KRS harus berupa angka positif');
      }
      const ada = await client.query('SELECT 1 FROM krs WHERE id_krs = $1', [newId]);
      if (ada.rowCount) throw new ErrorAturan(`ID KRS ${newId} sudah dipakai`);
    }

    const i = await client.query(
      `INSERT INTO krs (id_krs, nim, id_periode, kode_aturan, tgl_isi, status)
       VALUES (COALESCE($1::int, nextval(pg_get_serial_sequence('krs', 'id_krs'))),
               $2, $3, $4, COALESCE($5::date, CURRENT_DATE), 'Diajukan')
       RETURNING id_krs`,
      [newId, b.nim, b.id_periode, kode, b.tgl_isi || null]
    );
    idKrs = i.rows[0].id_krs;

    // Samakan urutan otomatis supaya tidak bentrok dengan ID manual.
    await client.query(
      `SELECT setval(pg_get_serial_sequence('krs', 'id_krs'),
                     (SELECT MAX(id_krs) FROM krs))`
    );
  }

  await client.query('DELETE FROM krs_detail WHERE id_krs = $1', [idKrs]);
  if (ids.length) {
    await client.query(
      'INSERT INTO krs_detail (id_krs, id_kelas) SELECT $1, unnest($2::int[])',
      [idKrs, ids]
    );
  }

  return idKrs;
}

router.post('/admin/krs', onlyRole('admin'), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const id = await simpanKrsAdmin(client, null, req.body);
    await client.query('COMMIT');
    res.status(201).json({ ok: true, id_krs: id });
  } catch (e) {
    await client.query('ROLLBACK');
    fail(res, e);
  } finally { client.release(); }
});

router.put('/admin/krs/:id', onlyRole('admin'), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await simpanKrsAdmin(client, Number(req.params.id), req.body);
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    await client.query('ROLLBACK');
    fail(res, e);
  } finally { client.release(); }
});

// Hapus KRS beserta detailnya.
router.delete('/admin/krs/:id', onlyRole('admin'), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM krs_detail WHERE id_krs = $1', [req.params.id]);
    const d = await client.query('DELETE FROM krs WHERE id_krs = $1', [req.params.id]);
    await client.query('COMMIT');
    if (!d.rowCount) return res.status(404).json({ error: 'Data tidak ditemukan' });
    res.json({ ok: true });
  } catch (e) {
    await client.query('ROLLBACK');
    fail(res, e);
  } finally { client.release(); }
});

module.exports = router;