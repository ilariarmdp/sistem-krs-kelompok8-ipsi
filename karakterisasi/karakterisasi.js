// Tes karakterisasi withLabels: simpan respons GET /api/<tabel>,
// lalu bandingkan hasil sebelum dan sesudah refactoring.
// Pakai: node karakterisasi/karakterisasi.js sebelum|sesudah
const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';
const DAFTAR_TABEL = [
  'prodi', 'dosen', 'mahasiswa', 'mata_kuliah', 'periode',
  'kelas', 'krs', 'krs_detail', 'aturan_akademik'
];
const mode = process.argv[2];

function lokasiFile(nama) {
  return path.join(__dirname, `snapshot-${nama}.json`);
}

async function loginSebagaiAdmin() {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: process.env.KARAK_USER,
      password: process.env.KARAK_PASS,
      role: 'admin'
    })
  });

  if (!res.ok) {
    throw new Error(`Login gagal (HTTP ${res.status})`);
  }

  return res.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
}

async function ambilSemuaTabel(cookie) {
  const hasil = {};

  for (const tabel of DAFTAR_TABEL) {
    const res = await fetch(`${BASE_URL}/api/${tabel}`, {
      headers: { Cookie: cookie }
    });

    if (!res.ok) {
      throw new Error(`GET /api/${tabel} gagal (HTTP ${res.status})`);
    }

    hasil[tabel] = await res.json();
  }

  return hasil;
}

function bandingkan(sebelum, sesudah) {
  let adaBeda = false;

  for (const tabel of DAFTAR_TABEL) {
    const sama = JSON.stringify(sebelum[tabel]) === JSON.stringify(sesudah[tabel]);
    const jumlah = `${sebelum[tabel].length} vs ${sesudah[tabel].length} baris`;
    console.log(`${sama ? 'SAMA' : 'BEDA'}  ${tabel} (${jumlah})`);
    if (!sama) adaBeda = true;
  }

  return !adaBeda;
}

async function main() {
  if (mode !== 'sebelum' && mode !== 'sesudah') {
    console.log('Pakai: node karakterisasi/karakterisasi.js sebelum|sesudah');
    process.exit(2);
  }

  const cookie = await loginSebagaiAdmin();
  const data = await ambilSemuaTabel(cookie);
  fs.writeFileSync(lokasiFile(mode), JSON.stringify(data, null, 2));
  console.log(`Snapshot "${mode}" tersimpan.`);

  if (mode === 'sesudah') {
    const sebelum = JSON.parse(fs.readFileSync(lokasiFile('sebelum'), 'utf8'));
    process.exit(bandingkan(sebelum, data) ? 0 : 1);
  }
}

main().catch(error => {
  console.error('Karakterisasi gagal:', error.message);
  process.exit(1);
});
