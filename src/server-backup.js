require('dotenv').config();
const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const app = express();
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || 'krs_dev',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
});
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

const tables = {
  prodi: {label:'Program Studi', pk:['kode_prodi'], fields:[
    ['kode_prodi','Kode Prodi','text',true],['nama_prodi','Nama Program Studi','text',true],['jenjang','Jenjang','select',true,['D3','D4','S1','S2','S3']]
  ]},
  dosen: {label:'Dosen', pk:['id_dosen'], fields:[
    ['id_dosen','ID Dosen','number',false],['nidn','NIDN','text',true],['nama','Nama Dosen','text',true],['email','Email','email',false],['kode_prodi','Program Studi','fk',true,'prodi','kode_prodi','nama_prodi']
  ]},
  mahasiswa: {label:'Mahasiswa', pk:['nim'], fields:[
    ['nim','NIM','text',true],['nama','Nama Mahasiswa','text',true],['email','Email','email',false],['tahun_masuk','Tahun Masuk','number',true],['status','Status','select',true,['aktif','cuti','lulus','keluar']],['kode_prodi','Program Studi','fk',true,'prodi','kode_prodi','nama_prodi'],['id_dosen_pa','Dosen PA','fk',false,'dosen','id_dosen','nama'],['created_at','Dibuat Pada','date',false],['no_hp','No. HP','text',false]
  ]},
  mata_kuliah: {label:'Mata Kuliah', pk:['kode_mk'], fields:[
    ['kode_mk','Kode MK','text',true],['nama_mk','Nama Mata Kuliah','text',true],['sks','SKS','number',true],['semester_ke','Semester','number',true]
  ]},
  periode: {label:'Periode Akademik', pk:['id_periode'], fields:[
    ['id_periode','ID Periode','text',true],['nama_periode','Nama Periode','text',true],['tgl_mulai','Tanggal Mulai','date',true],['tgl_selesai','Tanggal Selesai','date',true]
  ]},
  kelas: {label:'Kelas Kuliah', pk:['id_kelas'], fields:[
    ['id_kelas','ID Kelas','number',false],['kode_mk','Mata Kuliah','fk',true,'mata_kuliah','kode_mk','nama_mk'],['id_periode','Periode','fk',true,'periode','id_periode','nama_periode'],['id_dosen','Dosen Pengampu','fk',true,'dosen','id_dosen','nama'],['nama_kelas','Nama Kelas','text',true],['kuota','Kuota','number',true]
  ]},
  krs: {label:'KRS Mahasiswa', pk:['id_krs'], fields:[
    ['id_krs','ID KRS','number',false],['nim','Mahasiswa','fk',true,'mahasiswa','nim','nama'],['id_periode','Periode','fk',true,'periode','id_periode','nama_periode'],['tgl_isi','Tanggal Isi','date',true],['status','Status KRS','select',true,['draft','diajukan','disetujui','ditolak']]
  ]},
  krs_detail: {label:'Detail KRS', pk:['id_krs','id_kelas'], fields:[
    ['id_krs','KRS','fk',true,'krs','id_krs','id_krs'],['id_kelas','Kelas','fk',true,'kelas','id_kelas','id_kelas'],['nilai_huruf','Nilai Huruf','select',false,['','A','A-','B+','B','B-','C+','C','D','E']]
  ]},
  aturan_akademik: {label:'Aturan Akademik', pk:['kode'], fields:[
    ['kode','Kode Aturan','text',true],['nilai','Nilai','number',true],['keterangan','Keterangan','text',false]
  ]}
};
const ident = s => '"' + String(s).replace(/"/g,'""') + '"';
const safeTable = t => { if(!tables[t]) throw new Error('Tabel tidak dikenal'); return t; };
async function listRows(t) {
  safeTable(t);
  const joins = {
    dosen: `SELECT d.*, p.nama_prodi AS label_prodi FROM dosen d LEFT JOIN prodi p ON p.kode_prodi=d.kode_prodi ORDER BY d.id_dosen`,
    mahasiswa: `SELECT m.*, p.nama_prodi AS label_prodi, d.nama AS label_dosen_pa FROM mahasiswa m LEFT JOIN prodi p ON p.kode_prodi=m.kode_prodi LEFT JOIN dosen d ON d.id_dosen=m.id_dosen_pa ORDER BY m.nim`,
    kelas: `SELECT k.*, mk.nama_mk AS label_mk, p.nama_periode AS label_periode, d.nama AS label_dosen FROM kelas k LEFT JOIN mata_kuliah mk ON mk.kode_mk=k.kode_mk LEFT JOIN periode p ON p.id_periode=k.id_periode LEFT JOIN dosen d ON d.id_dosen=k.id_dosen ORDER BY k.id_kelas`,
    krs: `SELECT k.*, m.nama AS label_mahasiswa, p.nama_periode AS label_periode FROM krs k LEFT JOIN mahasiswa m ON m.nim=k.nim LEFT JOIN periode p ON p.id_periode=k.id_periode ORDER BY k.id_krs DESC`,
    krs_detail: `SELECT kd.*, m.nama AS label_mahasiswa, mk.nama_mk AS label_mk FROM krs_detail kd LEFT JOIN krs k ON k.id_krs=kd.id_krs LEFT JOIN mahasiswa m ON m.nim=k.nim LEFT JOIN kelas kl ON kl.id_kelas=kd.id_kelas LEFT JOIN mata_kuliah mk ON mk.kode_mk=kl.kode_mk ORDER BY kd.id_krs`,
  };
  return (await pool.query(joins[t] || `SELECT * FROM ${ident(t)} ORDER BY ${tables[t].pk.map(ident).join(', ')}`)).rows;
}
app.get('/api/health', async (req,res) => { try { await pool.query('SELECT 1'); res.json({ok:true,database:process.env.DB_NAME||'krs_dev'}); } catch(e){res.status(500).json({ok:false,error:e.message});} });
app.get('/api/meta', (req,res)=>res.json(tables));
app.get('/api/stats', async(req,res)=>{try { const out={}; for(const t of Object.keys(tables)){const r=await pool.query(`SELECT COUNT(*)::int AS n FROM ${ident(t)}`);out[t]=r.rows[0].n;} res.json(out);}catch(e){res.status(500).json({error:e.message});}});
app.get('/api/options/:table', async(req,res)=>{try{const t=safeTable(req.params.table);const rows=await pool.query(`SELECT * FROM ${ident(t)} ORDER BY 1 LIMIT 1000`);res.json(rows.rows);}catch(e){res.status(400).json({error:e.message});}});
app.get('/api/:table', async(req,res)=>{try{res.json(await listRows(req.params.table));}catch(e){res.status(400).json({error:e.message});}});
app.post('/api/:table', async(req,res)=>{const client=await pool.connect();try{
 const t=safeTable(req.params.table), def=tables[t], body=req.body||{};
 const cols=def.fields.map(f=>f[0]).filter(c=>Object.prototype.hasOwnProperty.call(body,c) && !(def.pk.includes(c) && body[c]===''));
 if(!cols.length) return res.status(400).json({error:'Tidak ada data untuk disimpan'});
 const vals=cols.map(c=>body[c]===''?null:body[c]);
 const q=`INSERT INTO ${ident(t)} (${cols.map(ident).join(',')}) VALUES (${cols.map((_,i)=>'$'+(i+1)).join(',')}) RETURNING *`;
 const r=await client.query(q,vals);res.status(201).json(r.rows[0]);
 }catch(e){res.status(400).json({error:e.detail||e.message});}finally{client.release();}});
app.put('/api/:table/:key', async(req,res)=>{const client=await pool.connect();try{
 const t=safeTable(req.params.table), def=tables[t], keys=decodeURIComponent(req.params.key).split('~');
 if(keys.length!==def.pk.length) return res.status(400).json({error:'Kunci data tidak valid'});
 const body=req.body||{}, cols=def.fields.map(f=>f[0]).filter(c=>Object.prototype.hasOwnProperty.call(body,c)&&!def.pk.includes(c));
 const vals=cols.map(c=>body[c]===''?null:body[c]);
 const where=def.pk.map((c,i)=>`${ident(c)}=$${cols.length+i+1}`).join(' AND ');
 const r=await client.query(`UPDATE ${ident(t)} SET ${cols.map((c,i)=>`${ident(c)}=$${i+1}`).join(',')} WHERE ${where} RETURNING *`,[...vals,...keys]);
 if(!r.rowCount)return res.status(404).json({error:'Data tidak ditemukan'});res.json(r.rows[0]);
 }catch(e){res.status(400).json({error:e.detail||e.message});}finally{client.release();}});
app.delete('/api/:table/:key', async(req,res)=>{try{
 const t=safeTable(req.params.table), def=tables[t], keys=decodeURIComponent(req.params.key).split('~');
 if(keys.length!==def.pk.length)return res.status(400).json({error:'Kunci data tidak valid'});
 const where=def.pk.map((c,i)=>`${ident(c)}=$${i+1}`).join(' AND ');
 const r=await pool.query(`DELETE FROM ${ident(t)} WHERE ${where} RETURNING *`,keys);
 if(!r.rowCount)return res.status(404).json({error:'Data tidak ditemukan'});res.json({ok:true});
 }catch(e){res.status(400).json({error:e.detail||e.message});}});
app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'..','public','index.html')));
const port=Number(process.env.PORT||3001);
app.listen(port,()=>console.log(`SIKRS Profesional berjalan di http://localhost:${port}`));

