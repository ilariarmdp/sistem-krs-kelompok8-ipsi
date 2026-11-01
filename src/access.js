const pool = require('./db');

// Data referensi yang boleh dilihat semua peran (hanya baca)
const REF_TABLES = ['prodi', 'dosen', 'mata_kuliah', 'periode', 'aturan_akademik'];

const deny = (res, msg = 'Anda tidak memiliki akses ke data ini') =>
  res.status(403).json({ error: msg });

// Saring isi respons JSON (untuk endpoint yang mengembalikan array)
function filterRows(res, predicate) {
  const send = res.json.bind(res);
  res.json = (data) => send(Array.isArray(data) ? data.filter(predicate) : data);
}

async function guard(req, res, next) {
  try {
    const u = req.session.user;
    if (!u) return res.status(401).json({ error: 'Silakan login terlebih dahulu' });

    // Admin: akses penuh
    if (u.role === 'admin') return next();

    // Mendukung nama field sesi "ref" atau "ref_id"
    const ref = u.ref ?? u.ref_id;

    const [table, key, action] = req.path.split('/').filter(Boolean);
    const method = req.method;

    // Endpoint umum (hanya baca)
    if (['health', 'meta', 'stats', 'me'].includes(table)) {
      return method === 'GET' ? next() : deny(res);
    }

    // /api/options/:table dan /api/:table sama-sama dipetakan ke nama tabel
    const target = table === 'options' ? key : table;

    // =========================
    //  MAHASISWA
    // =========================
    if (u.role === 'mahasiswa') {
      const nim = String(ref);
      const ids = (await pool.query('SELECT id_krs FROM krs WHERE nim = $1', [nim]))
        .rows.map(r => Number(r.id_krs));
      const owns = (id) => ids.includes(Number(id));

      if (method === 'GET') {
        if (action === 'summary') return owns(key) ? next() : deny(res);

        if (REF_TABLES.includes(target) || target === 'kelas') return next();

        if (target === 'mahasiswa') {
          filterRows(res, r => String(r.nim) === nim);
          return next();
        }
        if (target === 'krs' || target === 'krs_detail') {
          filterRows(res, r => owns(r.id_krs));
          return next();
        }
        return deny(res);
      }

      // Tulis data: hanya KRS dan detail KRS milik sendiri
      if (table === 'krs' && key && action === 'submit' && method === 'POST') {
        return owns(key) ? next() : deny(res);
      }

      // KRS dibuat dan diubah oleh admin; mahasiswa hanya boleh mengajukan.
      if (table === 'krs') {
        return deny(res, 'KRS dibuat dan dikelola oleh admin');
      }

      if (table === 'krs_detail') {
        delete req.body.nilai_huruf; // nilai hanya boleh diisi dosen

        if (method === 'POST') return owns(req.body.id_krs) ? next() : deny(res);

        if (method === 'PUT' || method === 'DELETE') {
          const idKrs = decodeURIComponent(key || '').split('~')[0];
          if (!owns(idKrs)) return deny(res);
          if (method === 'PUT' && req.body.id_krs && !owns(req.body.id_krs)) return deny(res);
          return next();
        }
      }

      return deny(res);
    }

    // =========================
    //  DOSEN (hanya baca)
    // =========================
    if (u.role === 'dosen') {
      if (method !== 'GET') return deny(res, 'Akun dosen hanya dapat melihat data');

      const idDosen = Number(ref);

      // mahasiswa bimbingan (PA) dan KRS mereka
      const nims = (await pool.query(
        'SELECT nim FROM mahasiswa WHERE id_dosen_pa = $1', [idDosen]
      )).rows.map(r => r.nim);

      const krsIds = nims.length
        ? (await pool.query('SELECT id_krs FROM krs WHERE nim = ANY($1)', [nims]))
            .rows.map(r => Number(r.id_krs))
        : [];

      if (action === 'summary') return krsIds.includes(Number(key)) ? next() : deny(res);

      if (REF_TABLES.includes(target)) return next();

      if (target === 'kelas') {
        filterRows(res, r => Number(r.id_dosen) === idDosen);
        return next();
      }
      if (target === 'mahasiswa') {
        filterRows(res, r => Number(r.id_dosen_pa) === idDosen);
        return next();
      }
      if (target === 'krs' || target === 'krs_detail') {
        filterRows(res, r => krsIds.includes(Number(r.id_krs)));
        return next();
      }
      return deny(res);
    }

    return deny(res);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
}

module.exports = { guard };