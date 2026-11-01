const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('./db');

const router = express.Router();

const ROLE_LABEL = { admin: 'Admin', dosen: 'Dosen', mahasiswa: 'Mahasiswa' };

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { username, password, role } = req.body;
  try {
    const r = await pool.query(`
      SELECT u.*, COALESCE(m.nama, d.nama, 'Administrator') AS nama
      FROM users u
      LEFT JOIN mahasiswa m ON u.role = 'mahasiswa' AND m.nim = u.ref_id
      LEFT JOIN dosen d ON u.role = 'dosen' AND d.id_dosen::text = u.ref_id
      WHERE u.username = $1
    `, [String(username || '').trim()]);

    const u = r.rows[0];
    if (!u || !(await bcrypt.compare(password || '', u.password_hash))) {
      return res.status(401).json({ error: 'Username atau password salah' });
    }

    // pastikan tab peran yang dipilih sesuai dengan peran akun
    if (role && role !== u.role) {
      return res.status(403).json({
        error: `Akun ini terdaftar sebagai ${ROLE_LABEL[u.role]}. Pilih tab ${ROLE_LABEL[u.role]}.`
      });
    }

    req.session.user = {
      id: u.id,
      username: u.username,
      role: u.role,
      ref: u.ref_id,
      nama: u.nama
    };
    res.json(req.session.user);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// GET /api/auth/me
router.get('/me', (req, res) => {
  if (req.session.user) return res.json(req.session.user);
  res.status(401).json({ error: 'Belum login' });
});

// Tolak semua API (selain /api/auth) kalau belum login
function requireApiLogin(req, res, next) {
  if (req.session.user) return next();
  res.status(401).json({ error: 'Silakan login terlebih dahulu' });
}

// Halaman: kalau belum login, semua selain login.html dan style.css dialihkan
function requirePage(req, res, next) {
  if (req.session.user) return next();
  if (req.path.startsWith('/api')) return next(); // ditangani requireApiLogin
  if (req.path === '/login.html' || req.path === '/style.css') return next();
  res.redirect('/login.html');
}

module.exports = { router, requireApiLogin, requirePage };