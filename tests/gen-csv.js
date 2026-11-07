const fs = require('fs');
const path = require('path');

const depan = ['Ahmad','Budi','Citra','Dewi','Eka','Fajar','Gita','Hana','Indra','Joko','Kartika','Lukman','Maya','Nadia','Oka','Putri','Rizki','Sari','Tono','Wulan'];
const belakang = ['Pratama','Santoso','Lestari','Wijaya','Saputra','Hidayat','Kusuma','Permata','Nugroho','Ramadhan','Susanti','Firmansyah'];
const status = ['Aktif','Aktif','Aktif','Cuti','Lulus','Keluar'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

const baris = ['nim,nama,email,tahun_masuk,status,kode_prodi'];
for (let i = 1; i <= 1000; i++) {
  const nim = 'T' + String(i).padStart(11, '0');          // 12 karakter, aman untuk VARCHAR(12)
  const nama = `${pick(depan)} ${pick(belakang)}`;
  const email = `mhs${i}@uji.ac.id`;
  baris.push([nim, nama, email, 2020 + (i % 6), pick(status), 'TST'].join(','));
}

fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'data', 'mahasiswa_1000.csv'), baris.join('\n'));
console.log('CSV 1000 data dibuat: tests/data/mahasiswa_1000.csv');