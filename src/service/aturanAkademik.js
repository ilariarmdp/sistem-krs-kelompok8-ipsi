// Aturan akademik: batas SKS dan kode aturan yang dipakai.
const pool = require('../db');

const BATAS_SKS_DEFAULT = 24;
const KODE_ATURAN_BATAS_SKS = ['MAX_SKS', 'SKS_MAX'];
const DAFTAR_KODE_BATAS_SKS_SQL = KODE_ATURAN_BATAS_SKS.map(kode => `'${kode}'`).join(', ');

// Batas SKS dari tabel aturan_akademik (default BATAS_SKS_DEFAULT).
async function maxSks(client = pool) {
  const r = await client.query(`
    SELECT nilai FROM aturan_akademik
    WHERE kode_aturan IN (${DAFTAR_KODE_BATAS_SKS_SQL})
       OR upper(coalesce(keterangan, '')) IN (${DAFTAR_KODE_BATAS_SKS_SQL})
    ORDER BY (kode_aturan IN (${DAFTAR_KODE_BATAS_SKS_SQL})) DESC
    LIMIT 1
  `);
  return Number(r.rows[0]?.nilai ?? BATAS_SKS_DEFAULT);
}

// Kode aturan yang dipakai saat KRS dibuat otomatis.
async function aturanKode(client = pool) {
  const r = await client.query(`
    SELECT kode_aturan FROM aturan_akademik
    ORDER BY (kode_aturan IN (${DAFTAR_KODE_BATAS_SKS_SQL})) DESC, kode_aturan
    LIMIT 1
  `);
  return r.rows[0]?.kode_aturan || null;
}

module.exports = { maxSks, aturanKode };
