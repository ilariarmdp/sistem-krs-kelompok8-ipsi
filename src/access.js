const pool = require('./db');

// Data referensi yang boleh dilihat semua peran (hanya baca).
const REF_TABLES = [
  'prodi',
  'dosen',
  'mata_kuliah',
  'periode',
  'aturan_akademik'
];

const deny = (res, msg = 'Anda tidak memiliki akses ke data ini') =>
  res.status(403).json({ error: msg });

// Saring isi respons JSON untuk endpoint yang mengembalikan array.
function filterRows(res, predicate) {
  const send = res.json.bind(res);

  res.json = (data) =>
    send(Array.isArray(data) ? data.filter(predicate) : data);
}

async function guard(req, res, next) {
  try {
    const u = req.session.user;

    if (!u) {
      return res.status(401).json({
        error: 'Silakan login terlebih dahulu'
      });
    }

    // Admin memiliki akses penuh.
    if (u.role === 'admin') {
      return next();
    }

    // Mendukung nama field sesi "ref" atau "ref_id".
    const ref = u.ref ?? u.ref_id;

    const [table, key, action] = req.path.split('/').filter(Boolean);
    const method = req.method;

    // Endpoint umum yang hanya boleh dibaca.
    if (['health', 'meta', 'stats', 'me'].includes(table)) {
      return method === 'GET' ? next() : deny(res);
    }

    // /options/:table dan /:table sama-sama dipetakan ke nama tabel.
    const target = table === 'options' ? key : table;

    // =========================
    // MAHASISWA
    // =========================
    if (u.role === 'mahasiswa') {
      const nim = String(ref);

      const ids = (
        await pool.query(
          'SELECT id_krs FROM krs WHERE nim = $1',
          [nim]
        )
      ).rows.map(row => Number(row.id_krs));

      const owns = id => ids.includes(Number(id));

      if (method === 'GET') {
        if (action === 'summary') {
          return owns(key) ? next() : deny(res);
        }

        if (REF_TABLES.includes(target) || target === 'kelas') {
          return next();
        }

        if (target === 'mahasiswa') {
          filterRows(res, row => String(row.nim) === nim);
          return next();
        }

        if (target === 'krs' || target === 'krs_detail') {
          filterRows(res, row => owns(row.id_krs));
          return next();
        }

        return deny(res);
      }

      // Pengajuan KRS dan pemilihan mata kuliah hanya lewat /api/paket/*
      // (di sana ada validasi SKS, kuota, periode, dan status).
      // Rute umum di bawah sengaja ditutup agar validasi tidak bisa dilewati.
      if (table === 'krs') {
        return deny(res, 'KRS dibuat dan dikelola oleh admin');
      }

      if (table === 'krs_detail') {
        return deny(res, 'Pilihan mata kuliah diubah lewat dashboard');
      }

      return deny(res);
    }

    // =========================
    // DOSEN
    // =========================
    if (u.role === 'dosen') {
      const idDosen = Number(ref);

      // Dosen PA boleh menyetujui atau menolak KRS mahasiswa bimbingannya.
      if (
        table === 'krs' &&
        key &&
        action === 'persetujuan' &&
        method === 'PUT'
      ) {
        const result = await pool.query(
          `SELECT 1
           FROM krs k
           JOIN mahasiswa m ON m.nim = k.nim
           WHERE k.id_krs = $1
             AND m.id_dosen_pa = $2
             AND LOWER(k.status) = 'diajukan'`,
          [Number(key), idDosen]
        );

        if (!result.rowCount) {
          return deny(
            res,
            'KRS bukan milik mahasiswa bimbingan Anda atau belum diajukan'
          );
        }

        return next();
      }

      // Dosen pengampu boleh menginput nilai pada kelas yang dia ampu.
      // Path: /krs-detail/:idKrs/:idKelas/nilai
      if (
        table === 'krs-detail' &&
        key &&
        action &&
        method === 'PUT'
      ) {
        const pathParts = req.path.split('/').filter(Boolean);
        const idKrs = Number(pathParts[1]);
        const idKelas = Number(pathParts[2]);
        const nilaiAction = pathParts[3];

        if (
          nilaiAction !== 'nilai' ||
          !Number.isInteger(idKrs) ||
          idKrs <= 0 ||
          !Number.isInteger(idKelas) ||
          idKelas <= 0
        ) {
          return deny(res, 'Endpoint input nilai tidak valid');
        }

        const result = await pool.query(
          `SELECT 1
           FROM krs_detail kd
           JOIN krs k ON k.id_krs = kd.id_krs
           JOIN kelas kl ON kl.id_kelas = kd.id_kelas
           WHERE kd.id_krs = $1
             AND kd.id_kelas = $2
             AND kl.id_dosen = $3
             AND LOWER(k.status) = 'disetujui'`,
          [idKrs, idKelas, idDosen]
        );

        if (!result.rowCount) {
          return deny(
            res,
            'Anda bukan dosen pengampu kelas ini atau KRS belum disetujui'
          );
        }

        return next();
      }

      // Endpoint dosen selain di atas hanya boleh dibaca.
      if (method !== 'GET') {
        return deny(
          res,
          'Akun dosen hanya dapat melihat data atau menginput nilai kelasnya'
        );
      }

      // Mahasiswa bimbingan dosen PA.
      const nims = (
        await pool.query(
          'SELECT nim FROM mahasiswa WHERE id_dosen_pa = $1',
          [idDosen]
        )
      ).rows.map(row => row.nim);

      const krsIds = nims.length
        ? (
            await pool.query(
              'SELECT id_krs FROM krs WHERE nim = ANY($1)',
              [nims]
            )
          ).rows.map(row => Number(row.id_krs))
        : [];

      // Kelas yang diampu dan KRS (disetujui) yang memuat kelas tersebut,
      // agar dosen pengampu bisa menginput nilai.
      const kelasIds = (
        await pool.query(
          'SELECT id_kelas FROM kelas WHERE id_dosen = $1',
          [idDosen]
        )
      ).rows.map(row => Number(row.id_kelas));

      const krsKelas = kelasIds.length
        ? (
            await pool.query(
              `SELECT DISTINCT kd.id_krs
               FROM krs_detail kd
               JOIN krs k ON k.id_krs = kd.id_krs
               WHERE kd.id_kelas = ANY($1)
                 AND LOWER(k.status) = 'disetujui'`,
              [kelasIds]
            )
          ).rows.map(row => Number(row.id_krs))
        : [];

      const visibleKrs = [...new Set([...krsIds, ...krsKelas])];

      if (action === 'summary') {
        return krsIds.includes(Number(key)) ? next() : deny(res);
      }

      if (REF_TABLES.includes(target)) {
        return next();
      }

      if (target === 'kelas') {
        filterRows(res, row => Number(row.id_dosen) === idDosen);
        return next();
      }

      if (target === 'mahasiswa') {
        filterRows(res, row => Number(row.id_dosen_pa) === idDosen);
        return next();
      }

      if (target === 'krs') {
        filterRows(res, row => visibleKrs.includes(Number(row.id_krs)));
        return next();
      }

      // Dosen pengampu hanya melihat baris kelasnya pada KRS yang sudah
      // disetujui (KRS draft/diajukan milik non-bimbingan tidak ikut terlihat).
      if (target === 'krs_detail') {
        filterRows(res, row =>
          krsIds.includes(Number(row.id_krs)) ||
          (
            kelasIds.includes(Number(row.id_kelas)) &&
            krsKelas.includes(Number(row.id_krs))
          )
        );
        return next();
      }

      return deny(res);
    }

    return deny(res);
  } catch (error) {
    console.error('Access guard:', error);

    return res.status(500).json({
      error: 'Terjadi kesalahan server'
    });
  }
}

module.exports = { guard };