
const express = require('express');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// ==================================================
// DEFINISI 9 ENTITAS SESUAI ERD
// ==================================================

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
      ['nidn', 'NIDN', 'text', true],
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
      ['id_dosen_pa', 'Dosen PA', 'fk', false, 'dosen', 'id_dosen', 'nama'],
      ['created_at', 'Dibuat Pada', 'date', false],
      ['no_hp', 'No. HP', 'text', false]
    ]
  },

  mata_kuliah: {
    label: 'Mata Kuliah',
    pk: ['kode_mk'],
    fields: [
      ['kode_mk', 'Kode MK', 'text', true],
      ['nama_mk', 'Nama Mata Kuliah', 'text', true],
      ['sks', 'SKS', 'number', true],
      ['semester_ke', 'Semester', 'number', true]
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
      ['kuota', 'Kuota', 'number', true]
    ]
  },

  krs: {
    label: 'KRS Mahasiswa',
    pk: ['id_krs'],
    fields: [
      ['id_krs', 'ID KRS', 'number', false],
      ['nim', 'Mahasiswa', 'fk', true, 'mahasiswa', 'nim', 'nama'],
      ['id_periode', 'Periode', 'fk', true, 'periode', 'id_periode', 'nama_periode'],
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
    pk: ['kode'],
    fields: [
      ['kode', 'Kode Aturan', 'text', true],
      ['nilai', 'Nilai', 'number', true],
      ['keterangan', 'Keterangan', 'text', false]
    ]
  }
};


const data = {
  prodi: [
    { kode_prodi: 'SI', nama_prodi: 'Sistem Informasi', jenjang: 'S1' },
    { kode_prodi: 'IF', nama_prodi: 'Informatika', jenjang: 'S1' },
    { kode_prodi: 'TI', nama_prodi: 'Teknik Industri', jenjang: 'S1' },
    { kode_prodi: 'MI', nama_prodi: 'Manajemen Informatika', jenjang: 'D3' },
    { kode_prodi: 'KA', nama_prodi: 'Komputerisasi Akuntansi', jenjang: 'D3' }
  ],

  dosen: [
    { id_dosen: 1, nidn: '0012345678', nama: 'Budi Santoso', email: 'budi@example.com', kode_prodi: 'SI' },
    { id_dosen: 2, nidn: '0012345679', nama: 'Siti Rahmawati', email: 'siti@example.com', kode_prodi: 'SI' },
    { id_dosen: 3, nidn: '0012345680', nama: 'Agus Setiawan', email: 'agus@example.com', kode_prodi: 'IF' },
    { id_dosen: 4, nidn: '0012345681', nama: 'Dewi Lestari', email: 'dewi@example.com', kode_prodi: 'TI' },
    { id_dosen: 5, nidn: '0012345682', nama: 'Rina Kurnia', email: 'rina@example.com', kode_prodi: 'MI' }
  ],

  mahasiswa: [
    { nim: '2301001', nama: 'Andi Saputra', email: 'andi@example.com', tahun_masuk: 2023, status: 'aktif', kode_prodi: 'SI', id_dosen_pa: 1, created_at: '2026-10-27', no_hp: '081234567890' },
    { nim: '2301002', nama: 'Rina Putri', email: 'rina.putri@example.com', tahun_masuk: 2023, status: 'aktif', kode_prodi: 'SI', id_dosen_pa: 2, created_at: '2026-10-27', no_hp: '081234567891' },
    { nim: '2301003', nama: 'Dimas Pratama', email: 'dimas@example.com', tahun_masuk: 2023, status: 'aktif', kode_prodi: 'IF', id_dosen_pa: 3, created_at: '2026-10-27', no_hp: '081234567892' },
    { nim: '2401001', nama: 'Nadia Safitri', email: 'nadia@example.com', tahun_masuk: 2024, status: 'aktif', kode_prodi: 'TI', id_dosen_pa: 4, created_at: '2026-10-27', no_hp: '081234567893' },
    { nim: '2401002', nama: 'Fajar Ramadhan', email: 'fajar@example.com', tahun_masuk: 2024, status: 'aktif', kode_prodi: 'MI', id_dosen_pa: 5, created_at: '2026-10-27', no_hp: '081234567894' }
  ],

  mata_kuliah: [
    { kode_mk: 'SI301', nama_mk: 'Analisis Sistem Informasi', sks: 3, semester_ke: 5 },
    { kode_mk: 'SI302', nama_mk: 'Manajemen Basis Data', sks: 3, semester_ke: 5 },
    { kode_mk: 'SI303', nama_mk: 'Rekayasa Perangkat Lunak', sks: 3, semester_ke: 5 },
    { kode_mk: 'SI304', nama_mk: 'Manajemen Proyek TI', sks: 2, semester_ke: 5 },
    { kode_mk: 'SI305', nama_mk: 'Keamanan Sistem Informasi', sks: 3, semester_ke: 5 }
  ],

  periode: [
    { id_periode: '2025G', nama_periode: 'Ganjil 2025/2026', tgl_mulai: '2025-08-01', tgl_selesai: '2026-01-31' },
    { id_periode: '2025E', nama_periode: 'Genap 2025/2026', tgl_mulai: '2026-02-01', tgl_selesai: '2026-07-31' },
    { id_periode: '2026G', nama_periode: 'Ganjil 2026/2027', tgl_mulai: '2026-08-01', tgl_selesai: '2027-01-31' },
    { id_periode: '2026E', nama_periode: 'Genap 2026/2027', tgl_mulai: '2027-02-01', tgl_selesai: '2027-07-31' },
    { id_periode: '2027G', nama_periode: 'Ganjil 2027/2028', tgl_mulai: '2027-08-01', tgl_selesai: '2028-01-31' }
  ],

  kelas: [
    { id_kelas: 1, kode_mk: 'SI301', id_periode: '2026G', id_dosen: 1, nama_kelas: 'A', kuota: 30 },
    { id_kelas: 2, kode_mk: 'SI302', id_periode: '2026G', id_dosen: 2, nama_kelas: 'A', kuota: 30 },
    { id_kelas: 3, kode_mk: 'SI303', id_periode: '2026G', id_dosen: 3, nama_kelas: 'A', kuota: 30 },
    { id_kelas: 4, kode_mk: 'SI304', id_periode: '2026G', id_dosen: 4, nama_kelas: 'A', kuota: 25 },
    { id_kelas: 5, kode_mk: 'SI305', id_periode: '2026G', id_dosen: 5, nama_kelas: 'A', kuota: 25 }
  ],

  krs: [
  ],

  krs_detail: [
  ],

  aturan_akademik: [
    { kode: 'MAX_SKS', nilai: 24, keterangan: 'Batas maksimal SKS per semester' },
    { kode: 'MIN_SKS', nilai: 12, keterangan: 'Batas minimal SKS per semester' },
    { kode: 'MAX_MK', nilai: 8, keterangan: 'Maksimal mata kuliah per semester' },
    { kode: 'MAX_KELAS', nilai: 1, keterangan: 'Satu kelas untuk setiap mata kuliah dalam KRS' },
    { kode: 'MIN_IPK', nilai: 2, keterangan: 'IPK minimum untuk ketentuan akademik' }
  ]
};

const counters = {
  dosen: 5,
  kelas: 5,
  krs: 5
};

const getKey = (table, row) =>
  tables[table].pk.map(key => String(row[key])).join('~');

// ==================================================
// DATA DENGAN LABEL RELASI UNTUK TAMPILAN
// ==================================================

function getRows(table) {
  if (!tables[table]) throw new Error('Tabel tidak dikenal');

  const rows = data[table].map(row => ({ ...row }));

  if (table === 'dosen') {
    return rows.map(row => ({
      ...row,
      label_prodi: data.prodi.find(p => p.kode_prodi === row.kode_prodi)?.nama_prodi
    }));
  }

  if (table === 'mahasiswa') {
    return rows.map(row => ({
      ...row,
      label_prodi: data.prodi.find(p => p.kode_prodi === row.kode_prodi)?.nama_prodi,
      label_dosen_pa: data.dosen.find(d => d.id_dosen === row.id_dosen_pa)?.nama
    }));
  }

  if (table === 'kelas') {
    return rows.map(row => ({
      ...row,
      label_mk: data.mata_kuliah.find(m => m.kode_mk === row.kode_mk)?.nama_mk,
      label_periode: data.periode.find(p => p.id_periode === row.id_periode)?.nama_periode,
      label_dosen: data.dosen.find(d => d.id_dosen === row.id_dosen)?.nama
    }));
  }

  if (table === 'krs') {
    return rows.map(row => ({
      ...row,
      label_mahasiswa: data.mahasiswa.find(m => m.nim === row.nim)?.nama,
      label_periode: data.periode.find(p => p.id_periode === row.id_periode)?.nama_periode
    }));
  }

  if (table === 'krs_detail') {
    return rows.map(row => {
      const krs = data.krs.find(k => Number(k.id_krs) === Number(row.id_krs));
      const kelas = data.kelas.find(k => Number(k.id_kelas) === Number(row.id_kelas));
      const mk = data.mata_kuliah.find(m => m.kode_mk === kelas?.kode_mk);

      return {
        ...row,
        label_mahasiswa: data.mahasiswa.find(m => m.nim === krs?.nim)?.nama,
        label_periode: data.periode.find(p => p.id_periode === krs?.id_periode)?.nama_periode,
        label_mk: mk?.nama_mk,
        label_kelas: kelas?.nama_kelas,
        label_sks: mk?.sks ?? 0
      };
    });
  }

  return rows;
}

// ==================================================
// VALIDASI RELASI
// ==================================================

function validateReferences(table, body) {
  const refs = {
    dosen: [['kode_prodi', 'prodi', 'kode_prodi']],

    mahasiswa: [
      ['kode_prodi', 'prodi', 'kode_prodi'],
      ['id_dosen_pa', 'dosen', 'id_dosen', true]
    ],

    kelas: [
      ['kode_mk', 'mata_kuliah', 'kode_mk'],
      ['id_periode', 'periode', 'id_periode'],
      ['id_dosen', 'dosen', 'id_dosen']
    ],

    krs: [
      ['nim', 'mahasiswa', 'nim'],
      ['id_periode', 'periode', 'id_periode']
    ],

    krs_detail: [
      ['id_krs', 'krs', 'id_krs'],
      ['id_kelas', 'kelas', 'id_kelas']
    ]
  };

  for (const [field, target, targetKey, optional] of refs[table] || []) {
    const value = body[field];

    if ((value === '' || value == null) && optional) continue;

    if (!data[target].some(row => String(row[targetKey]) === String(value))) {
      throw new Error(`Referensi ${field} tidak ditemukan di ${target}`);
    }
  }
}

// ==================================================
// HITUNG TOTAL SKS
// Total SKS dihitung, bukan disimpan sebagai atribut baru.
// ==================================================

function getKrsSummary(idKrs) {
  const krs = data.krs.find(row => Number(row.id_krs) === Number(idKrs));

  if (!krs) throw new Error('KRS tidak ditemukan');

  const details = data.krs_detail.filter(
    row => Number(row.id_krs) === Number(idKrs)
  );

  const totalSks = details.reduce((total, detail) => {
    const kelas = data.kelas.find(
      row => Number(row.id_kelas) === Number(detail.id_kelas)
    );

    const mk = data.mata_kuliah.find(
      row => row.kode_mk === kelas?.kode_mk
    );

    return total + Number(mk?.sks || 0);
  }, 0);

  return {
    id_krs: Number(idKrs),
    mahasiswa: data.mahasiswa.find(row => row.nim === krs.nim)?.nama || krs.nim,
    status: krs.status,
    jumlah_mata_kuliah: details.length,
    total_sks: totalSks
  };
}

// ==================================================
// VALIDASI DETAIL KRS
// ==================================================

function validateKrsDetail(body, currentKey = null) {
  const krs = data.krs.find(
    row => Number(row.id_krs) === Number(body.id_krs)
  );

  const kelas = data.kelas.find(
    row => Number(row.id_kelas) === Number(body.id_kelas)
  );

  if (!krs || !kelas) {
    throw new Error('KRS atau kelas kuliah tidak ditemukan');
  }

  if (krs.status !== 'draft') {
    throw new Error('Detail hanya bisa diubah saat KRS berstatus draft');
  }

  if (String(krs.id_periode) !== String(kelas.id_periode)) {
    throw new Error('Periode kelas tidak sesuai dengan periode KRS');
  }

  const duplicate = data.krs_detail.some(row =>
    Number(row.id_krs) === Number(body.id_krs) &&
    Number(row.id_kelas) === Number(body.id_kelas) &&
    getKey('krs_detail', row) !== currentKey
  );

  if (duplicate) {
    throw new Error('Kelas ini sudah ada dalam KRS');
  }

  const currentDetails = data.krs_detail.filter(row =>
    Number(row.id_krs) === Number(body.id_krs) &&
    getKey('krs_detail', row) !== currentKey
  );

  const currentTotal = currentDetails.reduce((total, detail) => {
    const selectedClass = data.kelas.find(
      row => Number(row.id_kelas) === Number(detail.id_kelas)
    );

    const mk = data.mata_kuliah.find(
      row => row.kode_mk === selectedClass?.kode_mk
    );

    return total + Number(mk?.sks || 0);
  }, 0);

  const selectedMk = data.mata_kuliah.find(
    row => row.kode_mk === kelas.kode_mk
  );

  const rule = data.aturan_akademik.find(row => row.kode === 'MAX_SKS');
  const maxSks = Number(rule?.nilai ?? 24);

  if (currentTotal + Number(selectedMk?.sks || 0) > maxSks) {
    throw new Error(`Total SKS melebihi batas ${maxSks} SKS`);
  }
}

// ==================================================
// ENDPOINT DASAR
// ==================================================

app.get('/api/health', (req, res) => {
  res.json({ ok: true, database: null, storage: 'memory' });
});

app.get('/api/meta', (req, res) => {
  res.json(tables);
});

app.get('/api/stats', (req, res) => {
  const stats = {};

  for (const table of Object.keys(tables)) {
    stats[table] = data[table].length;
  }

  res.json(stats);
});

app.get('/api/options/:table', (req, res) => {
  const table = req.params.table;

  if (!tables[table]) {
    return res.status(400).json({ error: 'Tabel tidak dikenal' });
  }

  res.json(data[table]);
});

app.get('/api/:table', (req, res) => {
  try {
    res.json(getRows(req.params.table));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ==================================================
// TAMBAH DATA
// ==================================================

app.post('/api/:table', (req, res) => {
  try {
    const table = req.params.table;

    if (!tables[table]) throw new Error('Tabel tidak dikenal');

    const body = { ...req.body };
    const definition = tables[table];

    for (const field of definition.fields) {
      const column = field[0];

      if (field[2] === 'number' && body[column] !== '' && body[column] != null) {
        body[column] = Number(body[column]);
      }
    }

    if (['dosen', 'kelas', 'krs'].includes(table)) {
      const pk = definition.pk[0];

      if (body[pk] == null || body[pk] === '') {
        body[pk] = ++counters[table];
      }
    }

    if (table === 'mahasiswa' && !body.created_at) {
      body.created_at = new Date().toISOString().slice(0, 10);
    }

    // KRS baru selalu dimulai dengan draft.
    if (table === 'krs') {
      body.status = 'draft';
    }

    for (const field of definition.fields) {
      if (field[3] && (body[field[0]] == null || body[field[0]] === '')) {
        throw new Error(`${field[1]} wajib diisi`);
      }
    }

    const key = getKey(table, body);

    if (data[table].some(row => getKey(table, row) === key)) {
      throw new Error('Data dengan kunci tersebut sudah ada');
    }

    validateReferences(table, body);

    if (table === 'krs_detail') {
      validateKrsDetail(body);
    }

    data[table].push(body);

    res.status(201).json(body);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ==================================================
// UBAH DATA
// ==================================================

app.put('/api/:table/:key', (req, res) => {
  try {
    const table = req.params.table;

    if (!tables[table]) throw new Error('Tabel tidak dikenal');

    const definition = tables[table];
    const key = decodeURIComponent(req.params.key);
    const index = data[table].findIndex(row => getKey(table, row) === key);

    if (index < 0) {
      return res.status(404).json({ error: 'Data tidak ditemukan' });
    }

    const body = { ...data[table][index], ...req.body };

    for (const field of definition.fields) {
      const column = field[0];

      if (field[2] === 'number' && body[column] !== '' && body[column] != null) {
        body[column] = Number(body[column]);
      }

      if (field[3] && (body[column] == null || body[column] === '')) {
        throw new Error(`${field[1]} wajib diisi`);
      }
    }

    validateReferences(table, body);

    if (table === 'krs_detail') {
      validateKrsDetail(body, getKey(table, data[table][index]));
    }

    if (table === 'krs') {
      const oldStatus = data.krs[index].status;

      if (oldStatus !== 'draft') {
        throw new Error('KRS yang sudah diajukan atau diproses tidak bisa diubah');
      }

      if (body.status !== 'draft') {
        throw new Error('Gunakan proses Ajukan KRS untuk mengubah status');
      }
    }

    const newKey = getKey(table, body);

    if (data[table].some((row, i) => i !== index && getKey(table, row) === newKey)) {
      throw new Error('Kunci utama sudah digunakan');
    }

    data[table][index] = body;

    res.json(body);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ==================================================
// HAPUS DATA
// ==================================================

app.delete('/api/:table/:key', (req, res) => {
  try {
    const table = req.params.table;

    if (!tables[table]) throw new Error('Tabel tidak dikenal');

    const key = decodeURIComponent(req.params.key);
    const index = data[table].findIndex(row => getKey(table, row) === key);

    if (index < 0) {
      return res.status(404).json({ error: 'Data tidak ditemukan' });
    }

    const row = data[table][index];

    if (table === 'krs_detail') {
      const krs = data.krs.find(item => Number(item.id_krs) === Number(row.id_krs));

      if (krs && krs.status !== 'draft') {
        throw new Error('Detail hanya bisa dihapus saat KRS berstatus draft');
      }
    }

    const references = {
      mahasiswa: data.krs.some(item => item.nim === row.nim),

      prodi:
        data.dosen.some(item => item.kode_prodi === row.kode_prodi) ||
        data.mahasiswa.some(item => item.kode_prodi === row.kode_prodi),

      dosen:
        data.kelas.some(item => Number(item.id_dosen) === Number(row.id_dosen)) ||
        data.mahasiswa.some(item => Number(item.id_dosen_pa) === Number(row.id_dosen)),

      periode:
        data.krs.some(item => item.id_periode === row.id_periode) ||
        data.kelas.some(item => item.id_periode === row.id_periode),

      mata_kuliah: data.kelas.some(item => item.kode_mk === row.kode_mk),

      kelas: data.krs_detail.some(item => Number(item.id_kelas) === Number(row.id_kelas)),

      krs: data.krs_detail.some(item => Number(item.id_krs) === Number(row.id_krs))
    };

    if (references[table]) {
      throw new Error('Data masih digunakan oleh relasi lain');
    }

    data[table].splice(index, 1);

    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ==================================================
// RINGKASAN SKS KRS
// ==================================================

app.get('/api/krs/:id/summary', (req, res) => {
  try {
    res.json(getKrsSummary(req.params.id));
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

// ==================================================
// AJUKAN KRS
// ==================================================

app.post('/api/krs/:id/submit', (req, res) => {
  try {
    const idKrs = Number(req.params.id);
    const krs = data.krs.find(row => Number(row.id_krs) === idKrs);

    if (!krs) throw new Error('KRS tidak ditemukan');

    if (krs.status !== 'draft') {
      throw new Error('KRS hanya bisa diajukan saat berstatus draft');
    }

    const details = data.krs_detail.filter(
      row => Number(row.id_krs) === idKrs
    );

    if (details.length === 0) {
      throw new Error('Tambahkan minimal satu kelas sebelum mengajukan KRS');
    }

    for (const detail of details) {
      const kelas = data.kelas.find(
        row => Number(row.id_kelas) === Number(detail.id_kelas)
      );

      if (!kelas) throw new Error('Kelas dalam Detail KRS tidak ditemukan');

      if (String(kelas.id_periode) !== String(krs.id_periode)) {
        throw new Error('Periode kelas tidak sesuai dengan periode KRS');
      }
    }

    const summary = getKrsSummary(idKrs);
    const rule = data.aturan_akademik.find(row => row.kode === 'MAX_SKS');
    const maxSks = Number(rule?.nilai ?? 24);

    if (summary.total_sks > maxSks) {
      throw new Error(`Total SKS ${summary.total_sks} melebihi batas ${maxSks} SKS`);
    }

    krs.status = 'diajukan';

    res.json({
      ok: true,
      message: 'KRS berhasil diajukan',
      ...getKrsSummary(idKrs)
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ==================================================
// HALAMAN UTAMA
// ==================================================

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

const port = Number(process.env.PORT || 3001);

app.listen(port, () => {
  console.log(`SIKRS berjalan di http://localhost:${port} (tanpa database)`);
});
