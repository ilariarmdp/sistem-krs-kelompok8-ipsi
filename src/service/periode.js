// Periode: pencarian periode akademik terbaru.
const pool = require('../db');

// Periode terbaru (berdasarkan tanggal mulai).
async function latestPeriode(client = pool) {
  const r = await client.query(
    'SELECT id_periode, nama_periode FROM periode ORDER BY tgl_mulai DESC LIMIT 1'
  );
  return r.rows[0] || null;
}

module.exports = { latestPeriode };
