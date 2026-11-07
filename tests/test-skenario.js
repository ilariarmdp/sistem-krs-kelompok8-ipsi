const pool = require('../src/db');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:3001';

// ===== SESUAIKAN DENGAN AKUN KAMU =====
const MHS = { username: '321', password: 'mahasiswa123', role: 'mahasiswa', nim: '2025001' };
const DSN = { username: '456', password: 'dosen123', role: 'dosen', id: 1 };
const ADM = { username: 'admin', password: 'admin123', role: 'admin' };
// ======================================

const T1 = 'T00000000099'; // mahasiswa uji (pengisi kuota)
const T2 = 'T00000000098'; // mahasiswa uji (untuk KRS buatan admin)
const hasil = [];

function klien() {
  let cookie = '';
  return async (method, url, body) => {
    const res = await fetch(BASE + url, {
      method,
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      redirect: 'manual'
    });
    const sc = res.headers.getSetCookie();
    if (sc.length) cookie = sc.map((c) => c.split(';')[0]).join('; ');
    let data = null;
    try { data = await res.json(); } catch {}
    return { status: res.status, data };
  };
}

const login = (c, a) => c('POST', '/api/auth/login',
  { username: a.username, password: a.password, role: a.role });
const msg = (r) => `HTTP ${r.status}: ${r.data?.message || r.data?.error || (r.data?.role ? 'role ' + r.data.role : 'ok')}`;

async function skenario(no, nama, harapan, fn) {
  let status, aktual;
  try {
    const r = await fn();
    if (r === null) { status = 'DILEWATI'; aktual = 'Akun admin tidak bisa login'; }
    else { status = r[0] ? 'LULUS' : 'GAGAL'; aktual = r[1]; }
  } catch (e) { status = 'GAGAL'; aktual = 'Error: ' + e.message; }
  hasil.push({ No: no, Skenario: nama, Harapan: harapan, 'Hasil Aktual': aktual, Status: status });
}

const bersih = async (nim, per = null) => {
  await pool.query(
    `DELETE FROM krs_detail WHERE id_krs IN
       (SELECT id_krs FROM krs WHERE nim = $1 AND ($2::text IS NULL OR id_periode = $2::text))`, [nim, per]);
  await pool.query(
    'DELETE FROM krs WHERE nim = $1 AND ($2::text IS NULL OR id_periode = $2::text)', [nim, per]);
};

async function setMaxSks(n) {
  const r = await pool.query(`
    SELECT kode_aturan, nilai FROM aturan_akademik
    WHERE kode_aturan IN ('MAX_SKS','SKS_MAX')
       OR upper(coalesce(keterangan,'')) IN ('MAX_SKS','SKS_MAX')
    ORDER BY (kode_aturan IN ('MAX_SKS','SKS_MAX')) DESC LIMIT 1`);
  if (r.rows[0]) {
    const { kode_aturan, nilai } = r.rows[0];
    await pool.query('UPDATE aturan_akademik SET nilai = $1 WHERE kode_aturan = $2', [n, kode_aturan]);
    return () => pool.query('UPDATE aturan_akademik SET nilai = $1 WHERE kode_aturan = $2', [nilai, kode_aturan]);
  }
  await pool.query("INSERT INTO aturan_akademik (kode_aturan, nilai, keterangan) VALUES ('MAX_SKS', $1, 'uji-skenario')", [n]);
  return () => pool.query("DELETE FROM aturan_akademik WHERE kode_aturan = 'MAX_SKS' AND keterangan = 'uji-skenario'");
}

(async () => {
  const anon = klien(), mhs = klien(), dsn = klien(), adm = klien();
  let per, m0, A, B, aturan;
  const dibuat = { kuotaB: false, dosenA: false, pa: false };

  try {
    // ---------- PERSIAPAN DATA UJI (dipulihkan di akhir) ----------
    per = (await pool.query('SELECT id_periode FROM periode ORDER BY tgl_mulai DESC LIMIT 1')).rows[0]?.id_periode;
    if (!per) throw new Error('Tabel periode kosong');

    m0 = (await pool.query('SELECT kode_prodi, id_dosen_pa FROM mahasiswa WHERE nim = $1', [MHS.nim])).rows[0];
    if (!m0) throw new Error(`Mahasiswa ${MHS.nim} tidak ada di database`);

    aturan = (await pool.query('SELECT kode_aturan FROM aturan_akademik LIMIT 1')).rows[0]?.kode_aturan;
    if (!aturan) throw new Error('Tabel aturan_akademik kosong');

    const kelas = (await pool.query(`
      SELECT k.id_kelas, k.id_dosen, k.kuota, mk.sks,
             (SELECT COUNT(*)::int FROM krs_detail kd WHERE kd.id_kelas = k.id_kelas) AS terisi
      FROM kelas k JOIN mata_kuliah mk ON mk.kode_mk = k.kode_mk
      WHERE k.id_periode = $1 ORDER BY k.id_kelas`, [per])).rows;

    A = kelas.find((k) => k.sks > 0 && k.terisi < k.kuota);
    B = kelas.find((k) => k.id_kelas !== A?.id_kelas);
    if (!A || !B) throw new Error('Butuh minimal 2 kelas di periode terbaru');

    await bersih(MHS.nim, per);
    await bersih(T1); await bersih(T2);
    for (const t of [T1, T2]) {
      await pool.query(
        `INSERT INTO mahasiswa (nim, nama, tahun_masuk, kode_prodi)
         VALUES ($1, 'Mhs Uji Skenario', 2024, $2) ON CONFLICT DO NOTHING`, [t, m0.kode_prodi]);
    }

    // Kelas A diampu dosen uji, mahasiswa uji dibimbing dosen uji.
    await pool.query('UPDATE kelas SET id_dosen = $1 WHERE id_kelas = $2', [DSN.id, A.id_kelas]); dibuat.dosenA = true;
    await pool.query('UPDATE mahasiswa SET id_dosen_pa = $1 WHERE nim = $2', [DSN.id, MHS.nim]); dibuat.pa = true;

    // Kelas B dibuat penuh (kuota 1, sudah diisi mahasiswa uji T1).
    const k1 = (await pool.query(
      `INSERT INTO krs (nim, id_periode, kode_aturan, status) VALUES ($1, $2, $3, 'Draft') RETURNING id_krs`,
      [T1, per, aturan])).rows[0].id_krs;
    await pool.query('INSERT INTO krs_detail (id_krs, id_kelas) VALUES ($1, $2)', [k1, B.id_kelas]);
    await pool.query('UPDATE kelas SET kuota = 1 WHERE id_kelas = $1', [B.id_kelas]); dibuat.kuotaB = true;

    const rd = await login(dsn, DSN);
    const ra = await login(adm, ADM);
    const adminOk = ra.status === 200;
    let idKrs = null;

    // ---------- SKENARIO ----------
    await skenario(1, 'Login valid', 'HTTP 200, masuk sesuai peran', async () => {
      const r = await login(mhs, MHS);
      return [r.status === 200 && r.data?.role === 'mahasiswa', msg(r)];
    });

    await skenario(2, 'Login password salah', 'HTTP 401', async () => {
      const r = await login(klien(), { ...MHS, password: 'salahsalah' });
      return [r.status === 401, msg(r)];
    });

    await skenario(3, 'Akses API tanpa login', 'HTTP 401', async () => {
      const r = await anon('GET', '/api/mahasiswa');
      return [r.status === 401, msg(r)];
    });

    await skenario(4, 'Mahasiswa buka katalog', 'HTTP 200, daftar kelas periode terbaru', async () => {
      const r = await mhs('GET', '/api/paket/katalog');
      const n = r.data?.kelas?.length ?? 0;
      return [r.status === 200 && n > 0, `HTTP ${r.status}, ${n} kelas`];
    });

    await skenario(5, 'Simpan pilihan mata kuliah', 'HTTP 200, KRS Draft dibuat', async () => {
      const r = await mhs('POST', '/api/paket/simpan', { id_kelas: [A.id_kelas] });
      idKrs = r.data?.id_krs;
      return [r.status === 200 && r.data?.ok === true, msg(r)];
    });

    await skenario(6, 'Simpan tanpa pilih kelas', 'HTTP 400, minimal satu mata kuliah', async () => {
      const r = await mhs('POST', '/api/paket/simpan', { id_kelas: [] });
      return [r.status === 400 && /minimal satu/i.test(r.data?.error || ''), msg(r)];
    });

    await skenario(7, 'Total SKS melebihi batas', 'HTTP 400, melebihi batas SKS', async () => {
      const pulih = await setMaxSks(0);
      try {
        const r = await mhs('POST', '/api/paket/simpan', { id_kelas: [A.id_kelas] });
        return [r.status === 400 && /melebihi batas/i.test(r.data?.error || ''), msg(r)];
      } finally { await pulih(); }
    });

    await skenario(8, 'Kelas kuota penuh', 'HTTP 400, kuota penuh', async () => {
      const r = await mhs('POST', '/api/paket/simpan', { id_kelas: [B.id_kelas] });
      return [r.status === 400 && /kuota/i.test(r.data?.error || ''), msg(r)];
    });

    await skenario(9, 'Ajukan KRS berstatus Draft', 'HTTP 200, status Diajukan', async () => {
      const r = await mhs('POST', `/api/paket/ajukan/${idKrs}`);
      return [r.status === 200 && r.data?.ok === true, msg(r)];
    });

    await skenario(10, 'Ubah KRS setelah diajukan', 'HTTP 400, tidak bisa diubah', async () => {
      const r = await mhs('POST', '/api/paket/simpan', { id_kelas: [A.id_kelas] });
      return [r.status === 400 && /tidak bisa diubah/i.test(r.data?.error || ''), msg(r)];
    });

    await skenario(14, 'Input nilai saat KRS belum disetujui', 'HTTP 403 ditolak', async () => {
      const r = await dsn('PUT', `/api/krs-detail/${idKrs}/${A.id_kelas}/nilai`, { nilai_huruf: 'A' });
      return [r.status === 403, msg(r)];
    });

    await skenario(11, 'Dosen PA menyetujui KRS', 'HTTP 200, status Disetujui', async () => {
      const r = await dsn('PUT', `/api/paket/persetujuan/${idKrs}`, { status: 'disetujui' });
      return [r.status === 200 && r.data?.ok === true, msg(r)];
    });

    await skenario(12, 'Dosen non-PA memproses KRS', 'HTTP 400, bukan mahasiswa bimbingan', async () => {
      await pool.query('UPDATE mahasiswa SET id_dosen_pa = NULL WHERE nim = $1', [MHS.nim]);
      try {
        const r = await dsn('PUT', `/api/paket/persetujuan/${idKrs}`, { status: 'disetujui' });
        return [r.status === 400 && /bimbingan/i.test(r.data?.error || ''), msg(r)];
      } finally {
        await pool.query('UPDATE mahasiswa SET id_dosen_pa = $1 WHERE nim = $2', [DSN.id, MHS.nim]);
      }
    });

    await skenario(13, 'Dosen input nilai (KRS disetujui)', 'HTTP 200, nilai tersimpan', async () => {
      const r = await dsn('PUT', `/api/krs-detail/${idKrs}/${A.id_kelas}/nilai`, { nilai_huruf: 'A' });
      const db = (await pool.query('SELECT nilai_huruf FROM krs_detail WHERE id_krs = $1 AND id_kelas = $2',
        [idKrs, A.id_kelas])).rows[0];
      return [r.status === 200 && db?.nilai_huruf === 'A', `${msg(r)} | nilai di DB: ${db?.nilai_huruf}`];
    });

    await skenario(15, 'Mahasiswa akses CRUD admin', 'HTTP 403 ditolak', async () => {
      const r = await mhs('POST', '/api/prodi', { kode_prodi: 'ZZ', nama_prodi: 'Uji', jenjang: 'S1' });
      return [r.status === 403, msg(r)];
    });

    await skenario(16, 'Admin tambah KRS', 'HTTP 201, KRS dibuat', async () => {
      if (!adminOk) return null;
      const r = await adm('POST', '/api/paket/admin/krs', { nim: T2, id_periode: per, id_kelas: [A.id_kelas] });
      return [r.status === 201 && r.data?.ok === true, msg(r)];
    });

    await skenario(17, 'KRS ganda satu periode', 'HTTP 400, sudah punya KRS', async () => {
      if (!adminOk) return null;
      const r = await adm('POST', '/api/paket/admin/krs', { nim: T2, id_periode: per, id_kelas: [A.id_kelas] });
      return [r.status === 400 && /sudah punya KRS/i.test(r.data?.error || ''), msg(r)];
    });

    await skenario(18, 'Hapus prodi yang masih dipakai', 'HTTP 409 (konflik)', async () => {
      if (!adminOk) return null;
      const r = await adm('DELETE', `/api/prodi/${m0.kode_prodi}`);
      return [r.status === 409, msg(r)];
    });
  } catch (e) {
    console.error('Persiapan gagal:', e.message);
  } finally {
    // ---------- PEMULIHAN DATA ----------
    const coba = async (f) => { try { await f(); } catch (e) { console.error('Pemulihan:', e.message); } };
    await coba(() => bersih(MHS.nim, per));
    await coba(() => bersih(T1));
    await coba(() => bersih(T2));
    await coba(() => pool.query('DELETE FROM mahasiswa WHERE nim = ANY($1)', [[T1, T2]]));
    if (dibuat.kuotaB) await coba(() => pool.query('UPDATE kelas SET kuota = $1 WHERE id_kelas = $2', [B.kuota, B.id_kelas]));
    if (dibuat.dosenA) await coba(() => pool.query('UPDATE kelas SET id_dosen = $1 WHERE id_kelas = $2', [A.id_dosen, A.id_kelas]));
    if (dibuat.pa) await coba(() => pool.query('UPDATE mahasiswa SET id_dosen_pa = $1 WHERE nim = $2', [m0.id_dosen_pa, MHS.nim]));

    hasil.sort((a, b) => a.No - b.No);
    console.table(hasil.map((h) => ({ No: h.No, Skenario: h.Skenario, 'Hasil Aktual': h['Hasil Aktual'], Status: h.Status })));
    const lulus = hasil.filter((h) => h.Status === 'LULUS').length;
    console.log(`\nRingkasan: ${lulus} LULUS dari ${hasil.length} skenario`);
    fs.writeFileSync(path.join(__dirname, 'hasil-skenario.json'), JSON.stringify(hasil, null, 2));
    await pool.end();
  }
})();