const $ = (selector) => document.querySelector(selector);

// Jika sesi habis (401), arahkan ke halaman login.
const _origFetch = window.fetch;
window.fetch = async (...args) => {
  const res = await _origFetch(...args);
  if (res.status === 401) location.href = '/login.html';
  return res;
};

let meta = {};
let current = 'dashboard';
let rows = [];
let editing = null;
let currentUser = null;

const icons = {
  prodi: '⌂',
  dosen: '♙',
  mahasiswa: '♧',
  mata_kuliah: '▤',
  periode: '◷',
  kelas: '▦',
  krs: '▣',
  krs_detail: '☷',
  aturan_akademik: '⚙'
};

// ---------------------------------------------------------------
//  Pengaturan per peran
// ---------------------------------------------------------------
const roleLabels = {
  admin: 'Administrator',
  dosen: 'Dosen',
  mahasiswa: 'Mahasiswa'
};

// Menu sidebar untuk dosen dan mahasiswa (admin melihat semua tabel).
const roleMenus = {
  dosen: {
    mahasiswa: 'Mahasiswa Bimbingan',
    kelas: 'Kelas Diampu',
    krs: 'KRS Bimbingan',
    krs_detail: 'Detail KRS Bimbingan'
  },
  mahasiswa: {
    krs_detail: 'Detail KRS Saya',
    kelas: 'Kelas Kuliah',
    mata_kuliah: 'Mata Kuliah'
  }
};

// Tabel yang boleh ditambah/diubah/dihapus. Admin: semua.
// Dosen dan mahasiswa: tidak ada (mahasiswa memilih lewat dashboard).
const writableTables = {
  dosen: [],
  mahasiswa: []
};

const welcomeText = {
  admin: {
    subtitle: 'Ringkasan data dan pengelolaan akademik.',
    text: 'Kelola data akademik secara terstruktur sesuai relasi dan aturan ERD.'
  },
  dosen: {
    subtitle: 'Ringkasan mahasiswa bimbingan dan kelas yang Anda ampu.',
    text: 'Pantau mahasiswa bimbingan, kelas yang diampu, dan KRS yang perlu ditinjau.'
  },
  mahasiswa: {
    subtitle: 'Pilih mata kuliah dan pantau status KRS Anda.',
    text: 'Centang mata kuliah yang ingin diambil, simpan, lalu ajukan ke dosen PA untuk disetujui.'
  }
};

const gradeOptions = ['', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'D', 'E'];

function canWrite(table) {
  const role = currentUser?.role;
  if (role === 'admin') return true;
  return (writableTables[role] || []).includes(table);
}

const canSubmitKrs = () =>
  ['admin', 'mahasiswa'].includes(currentUser?.role);

const canInputGrade = () => currentUser?.role === 'dosen';

function labelOf(table) {
  const role = currentUser?.role;
  return roleMenus[role]?.[table] || meta[table]?.label || table;
}

// ---------------------------------------------------------------
//  Utilitas
// ---------------------------------------------------------------
const nice = (value) =>
  value == null || value === '' ? '—' : String(value);

function toast(message) {
  const element = $('#toast');
  element.textContent = message;
  element.classList.add('show');

  setTimeout(() => element.classList.remove('show'), 2600);
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}

// Tampilan ID KRS: 1 -> KRS-0001 (di database tetap angka).
const fmtKrsId = (id) =>
  id == null || id === '' ? '—' : 'KRS-' + String(id).padStart(4, '0');

// Tanggal dari database (mis. 2026-10-19T17:00:00.000Z) -> 20 Okt 2026.
function fmtDate(value) {
  if (!value) return '—';

  const date = new Date(value);
  if (isNaN(date)) return String(value).slice(0, 10);

  return date.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

// Nilai untuk <input type="date"> (YYYY-MM-DD) sesuai zona waktu lokal.
function toDateInput(value) {
  if (!value) return '';

  const text = String(value);
  if (!text.includes('T')) return text.slice(0, 10);

  return new Date(text).toLocaleDateString('en-CA');
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || 'Permintaan gagal');
  }

  return data;
}

function initials(name) {
  const words = String(name || 'U').trim().split(/\s+/);
  if (words.length > 1) return (words[0][0] + words[1][0]).toUpperCase();
  return words[0].slice(0, 2).toUpperCase();
}

// Muat ulang halaman yang sedang dibuka (dashboard atau tabel).
async function refreshCurrent() {
  if (current === 'dashboard') {
    await dashboard();
  } else {
    await loadRows();
  }
}

// ---------------------------------------------------------------
//  Inisialisasi
// ---------------------------------------------------------------
// Server bisa memakai /api/me atau /api/auth/me.
async function fetchCurrentUser() {
  try {
    return await api('/api/me');
  } catch (error) {
    return await api('/api/auth/me');
  }
}

// Pasang event handler hanya jika elemennya ada di halaman.
function on(selector, prop, handler) {
  const element = $(selector);
  if (element) element[prop] = handler;
}

async function init() {
  try {
    meta = await api('/api/meta');
    currentUser = await fetchCurrentUser();
    await api('/api/health');

    $('#conn').textContent = 'Terhubung';
    $('#conn').style.color = '#8de4c6';
  } catch (error) {
    $('#conn').textContent = 'Belum terhubung';
    $('#conn').style.color = '#ffb1b1';
    toast('Gagal menghubungkan aplikasi ke server.');
    return;
  }

  // Identitas pengguna di pojok kanan atas.
  const nama = currentUser.nama || currentUser.username || 'User';
  $('.avatar').textContent = initials(nama);
  $('#user-info').innerHTML = `
    <strong>${esc(nama)}</strong>
    <small>${esc(roleLabels[currentUser.role] || currentUser.role)}</small>
  `;

  $('#today').textContent = new Intl.DateTimeFormat('id-ID', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  }).format(new Date());

  buildMenu();

  $('#add').onclick = () => openForm();
  $('#close').onclick = closeForm;
  $('#cancel').onclick = closeForm;
  $('#search').oninput = renderRows;
  $('#record-form').onsubmit = saveForm;
  $('#logout').onclick = logout;

  // Ganti password
  on('#change-password', 'onclick', openPasswordForm);
  on('#password-close', 'onclick', closePasswordForm);
  on('#password-cancel', 'onclick', closePasswordForm);
  on('#password-form', 'onsubmit', changePassword);

  document.addEventListener('click', handleClick);

  await dashboard();
}

// Satu penangan klik untuk semua tombol dinamis.
function handleClick(event) {
  const moduleButton = event.target.closest('[data-module]');
  if (moduleButton) {
    openTable(moduleButton.dataset.module);
    return;
  }

  const submitButton = event.target.closest('[data-submit-krs]');
  if (submitButton) {
    submitKrs(submitButton.dataset.submitKrs);
    return;
  }

  const decisionButton = event.target.closest('[data-krs-decision]');
  if (decisionButton) {
    decideKrs(
      decisionButton.dataset.krsDecision,
      decisionButton.dataset.status
    );
    return;
  }

  const gradeButton = event.target.closest('[data-save-grade]');
  if (gradeButton) {
    saveGrade(
      gradeButton.dataset.saveGrade,
      gradeButton.dataset.gradeClass
    );
    return;
  }

  const editButton = event.target.closest('[data-edit]');
  if (editButton) {
    openForm(editButton.dataset.edit);
    return;
  }

  const deleteButton = event.target.closest('[data-delete]');
  if (deleteButton) {
    deleteRow(deleteButton.dataset.delete);
  }
}

// Sidebar menyesuaikan peran.
function buildMenu() {
  const role = currentUser.role;

  const menu = role === 'admin'
    ? Object.entries(meta).map(([table, def]) => [table, def.label])
    : Object.entries(roleMenus[role] || {}).filter(([table]) => meta[table]);

  $('#nav-data-label').textContent =
    role === 'admin' ? 'DATA AKADEMIK' : 'DATA SAYA';

  $('#nav-data').innerHTML = menu.map(([table, label]) => `
    <button class="nav" data-table="${esc(table)}">
      ${icons[table] || '◦'}
      <span>${esc(label)}</span>
    </button>
  `).join('');

  document.querySelectorAll('[data-page="dashboard"]').forEach((button) => {
    button.onclick = dashboard;
  });

  document.querySelectorAll('[data-table]').forEach((button) => {
    button.onclick = () => openTable(button.dataset.table);
  });
}

async function logout() {
  try {
    const res = await _origFetch('/api/auth/logout', { method: 'POST' });
    if (!res.ok) await _origFetch('/api/auth/logout');
  } catch (error) {
    // Tetap lanjut ke halaman login.
  }

  location.replace('/login.html');
}

// ---------------------------------------------------------------
//  Dashboard per peran
// ---------------------------------------------------------------
function statCard(label, value, table) {
  const tag = table ? 'button' : 'div';
  const attrs = table ? ` type="button" data-module="${esc(table)}"` : '';

  return `
    <${tag} class="stat-card"${attrs}>
      <span class="stat-icon">${icons[table] || '◦'}</span>
      <span class="stat-value">${esc(value ?? 0)}</span>
      <span class="stat-label">${esc(label)}</span>
    </${tag}>
  `;
}

function buildCards(s) {
  if (s.role === 'admin') {
    return [
      statCard('Total Mahasiswa', s.totalMahasiswa, 'mahasiswa'),
      statCard('Total Dosen', s.totalDosen, 'dosen'),
      statCard('Total Mata Kuliah', s.totalMataKuliah, 'mata_kuliah'),
      statCard('Total KRS', s.totalKRS, 'krs')
    ];
  }

  if (s.role === 'dosen') {
    return [
      statCard('Mahasiswa Bimbingan', s.totalMahasiswa, 'mahasiswa'),
      statCard('Kelas Diampu', s.totalKelas, 'kelas'),
      statCard('KRS Menunggu Persetujuan', s.krsMenunggu, 'krs'),
      statCard('KRS Disetujui', s.krsDisetujui, 'krs')
    ];
  }

  return [
    statCard('Total KRS', s.totalKRS),
    statCard('Mata Kuliah Diambil', s.totalMatkul, 'krs_detail'),
    statCard('Total SKS', s.totalSKS),
    statCard('KRS Diajukan', s.krsDiajukan),
    statCard('KRS Disetujui', s.krsDisetujui),
    statCard('KRS Ditolak', s.krsDitolak)
  ];
}

async function dashboard() {
  const role = currentUser.role;
  const text = welcomeText[role] || welcomeText.admin;
  const nama = currentUser.nama || currentUser.username;

  current = 'dashboard';

  $('#table-page').classList.add('hidden');
  $('#dashboard').classList.remove('hidden');

  document.querySelectorAll('.nav').forEach((button) => {
    button.classList.toggle('active', button.dataset.page === 'dashboard');
  });

  $('#page-title').textContent = 'Dashboard';
  $('#page-subtitle').textContent = text.subtitle;

  $('#welcome-tag').textContent = (roleLabels[role] || role).toUpperCase();
  $('#welcome-title').textContent =
    role === 'admin' ? 'Selamat datang di SI-KRS' : `Selamat datang, ${nama}`;
  $('#welcome-text').textContent = text.text;

  $('#stats').innerHTML = '<p class="stats-note">Memuat statistik…</p>';

  try {
    const stats = await api('/api/stats');
    $('#stats').innerHTML = buildCards(stats).join('');
  } catch (error) {
    $('#stats').innerHTML =
      `<p class="stats-note error">Gagal memuat statistik: ${esc(error.message)}</p>`;
  }

  // Panel pemilihan mata kuliah (hanya mahasiswa).
  let panel = $('#my-krs');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'my-krs';
    $('#stats').after(panel);
  }
  panel.innerHTML = '';

  if (role === 'mahasiswa') await renderPilihMk(panel);
}

// ---------------------------------------------------------------
//  Mahasiswa: memilih mata kuliah sendiri
// ---------------------------------------------------------------
async function renderPilihMk(panel) {
  try {
    const data = await api('/api/paket/katalog');

    const status = String(data.krs?.status || '').toLowerCase();
    const locked = ['diajukan', 'disetujui'].includes(status);
    const selected = new Set((data.selected || []).map(Number));

    if (!data.kelas.length) {
      panel.innerHTML = `
        <div class="panel">
          <div class="toolbar">
            <div>
              <h3>Pilih Mata Kuliah</h3>
              <p>Belum ada kelas untuk ${esc(data.periode.nama_periode)}. Hubungi admin.</p>
            </div>
          </div>
        </div>`;
      return;
    }

    const notes = {
      '': 'Centang mata kuliah yang ingin diambil, simpan, lalu ajukan ke dosen PA.',
      draft: 'KRS masih draft. Pilih mata kuliah, simpan, lalu ajukan ke dosen PA.',
      diajukan: 'KRS sudah diajukan dan menunggu persetujuan dosen PA.',
      disetujui: 'KRS sudah disetujui dosen PA.',
      ditolak: 'KRS ditolak dosen PA. Perbaiki pilihan Anda, lalu ajukan ulang.'
    };

    // Kelompokkan per semester.
    const bySemester = {};
    data.kelas.forEach((k) => {
      (bySemester[k.semester_ke] = bySemester[k.semester_ke] || []).push(k);
    });

    const semesterBlocks = Object.keys(bySemester)
      .sort((a, b) => Number(a) - Number(b))
      .map((sem) => {
        const list = bySemester[sem];
        const sks = list.reduce((sum, k) => sum + Number(k.sks), 0);

        return `
          <section class="pick-sem">
            <header>
              <h4>Semester ${esc(sem)}
                <small>${list.length} mata kuliah · ${sks} SKS</small>
              </h4>
              ${locked ? '' : `<button type="button" class="mini" data-pick-semester="${esc(sem)}">Pilih paket semester</button>`}
            </header>
            <div class="pick-list">
              ${list.map((k) => `
                <label class="pick-item ${locked ? 'disabled' : ''}">
                  <input type="checkbox"
                    data-pick-kelas="${esc(k.id_kelas)}"
                    data-sks="${esc(k.sks)}"
                    data-sem="${esc(sem)}"
                    ${selected.has(Number(k.id_kelas)) ? 'checked' : ''}
                    ${locked ? 'disabled' : ''}>
                  <span>
                    <span class="pick-name">${esc(k.nama_mk)}</span>
                    <span class="pick-meta">${esc(k.kode_mk)} · Kelas ${esc(k.nama_kelas)} · ${esc(k.sks)} SKS · ${esc(nice(k.dosen))}</span>
                  </span>
                </label>
              `).join('')}
            </div>
          </section>`;
      }).join('');

    panel.innerHTML = `
      <div class="panel">
        <div class="toolbar">
          <div>
            <h3>Pilih Mata Kuliah</h3>
            <p>${esc(data.periode.nama_periode)} · ${esc(notes[status] || notes[''])}</p>
          </div>
          ${data.krs ? `
            <div>
              <span class="badge" data-status="${esc(status)}">${esc(status === 'diajukan' ? 'pending' : status)}</span>
              <span class="sub">${esc(fmtKrsId(data.krs.id_krs))}</span>
            </div>` : ''}
        </div>

        <div class="pick-bar" id="pick-bar">
          <span>Total SKS terpilih: <b id="pick-sks">0</b> / ${esc(data.maxSks)} SKS</span>
          <span class="sub">Batas SKS ditentukan di Aturan Akademik</span>
        </div>

        ${semesterBlocks}

        ${locked ? '' : `
          <div class="pick-actions">
            <button type="button" class="pick-btn" id="pick-save">Simpan Pilihan</button>
            <button type="button" class="pick-btn primary" id="pick-submit">Simpan &amp; Ajukan ke Dosen</button>
          </div>`}
      </div>
    `;

    // Interaksi: hitung SKS dan pilih paket semester.
    const boxes = [...panel.querySelectorAll('[data-pick-kelas]')];

    const update = () => {
      const total = boxes
        .filter((box) => box.checked)
        .reduce((sum, box) => sum + Number(box.dataset.sks), 0);

      $('#pick-sks').textContent = total;
      $('#pick-bar').classList.toggle('over', total > data.maxSks);

      boxes.forEach((box) => {
        box.closest('.pick-item').classList.toggle('checked', box.checked);
      });
    };

    boxes.forEach((box) => box.addEventListener('change', update));

    panel.querySelectorAll('[data-pick-semester]').forEach((button) => {
      button.addEventListener('click', () => {
        const group = boxes.filter((box) => box.dataset.sem === button.dataset.pickSemester);
        const allChecked = group.every((box) => box.checked);

        group.forEach((box) => { box.checked = !allChecked; });
        update();
      });
    });

    const chosen = () => boxes
      .filter((box) => box.checked)
      .map((box) => Number(box.dataset.pickKelas));

    const save = () => api('/api/paket/simpan', {
      method: 'POST',
      body: JSON.stringify({ id_kelas: chosen() })
    });

    $('#pick-save')?.addEventListener('click', async () => {
      try {
        const result = await save();
        toast(result.message || 'Pilihan disimpan');
        await dashboard();
      } catch (error) {
        toast('Gagal menyimpan: ' + error.message);
      }
    });

    $('#pick-submit')?.addEventListener('click', async () => {
      if (!confirm('Simpan pilihan dan ajukan KRS ke dosen PA? KRS tidak bisa diubah setelah diajukan.')) return;

      try {
        const result = await save();

        await api(`/api/paket/ajukan/${encodeURIComponent(result.id_krs)}`, {
          method: 'POST'
        });

        toast('KRS berhasil diajukan ke dosen PA');
        await dashboard();
      } catch (error) {
        toast('Gagal mengajukan: ' + error.message);
      }
    });

    update();
  } catch (error) {
    panel.innerHTML =
      `<p class="stats-note error">Gagal memuat mata kuliah: ${esc(error.message)}</p>`;
  }
}

// ---------------------------------------------------------------
//  Halaman tabel
// ---------------------------------------------------------------
async function openTable(table) {
  if (!meta[table]) return;

  // Dosen dan mahasiswa hanya boleh membuka menu miliknya.
  if (currentUser.role !== 'admin' && !roleMenus[currentUser.role]?.[table]) {
    return;
  }

  current = table;

  $('#dashboard').classList.add('hidden');
  $('#table-page').classList.remove('hidden');

  document.querySelectorAll('.nav').forEach((button) => {
    button.classList.toggle('active', button.dataset.table === table);
  });

  const writable = canWrite(table);

  $('#page-title').textContent = labelOf(table);
  $('#page-subtitle').textContent = writable
    ? 'Kelola data akademik sesuai struktur ERD.'
    : 'Data ditampilkan sesuai hak akses Anda.';
  $('#table-heading').textContent = labelOf(table);
  $('#table-desc').textContent = writable
    ? 'Tambah, ubah, cari, dan hapus data sesuai relasi ERD.'
    : 'Anda hanya dapat melihat data pada halaman ini.';

  // Tombol Tambah hanya untuk peran yang boleh menulis.
  $('#add').style.display = writable ? '' : 'none';

  $('#search').value = '';

  await loadRows();
}

// Tambahkan daftar mata kuliah ke setiap baris KRS.
async function attachRingkasan() {
  try {
    const list = await api('/api/paket/ringkasan');
    const map = new Map(list.map((item) => [Number(item.id_krs), item]));

    rows = rows.map((row) => {
      const info = map.get(Number(row.id_krs));
      const items = info?.items || [];

      return {
        ...row,
        mk_items: items,
        mk_list: items.map((item) => item.nama).join(', '),
        mk_sks: info?.total_sks ?? 0
      };
    });
  } catch (error) {
    // Ringkasan gagal dimuat: tabel tetap tampil tanpa daftar mata kuliah.
  }
}

async function loadRows() {
  try {
    rows = await api('/api/' + current);

    if (current === 'krs') await attachRingkasan();

    $('#notice').classList.add('hidden');
    renderRows();
  } catch (error) {
    $('#notice').textContent = error.message;
    $('#notice').classList.remove('hidden');
    $('#thead').innerHTML = '';
    $('#tbody').innerHTML = '';
  }
}

// Kolom foreign key ditampilkan dengan label yang mudah dibaca.
const displayLabels = {
  dosen: { kode_prodi: 'label_prodi' },
  mahasiswa: { kode_prodi: 'label_prodi', id_dosen_pa: 'label_dosen_pa' },
  kelas: {
    kode_mk: 'label_mk',
    id_periode: 'label_periode',
    id_dosen: 'label_dosen'
  },
  krs: { nim: 'label_mahasiswa', id_periode: 'label_periode' },
  krs_detail: { id_krs: 'label_mahasiswa', id_kelas: 'label_mk' }
};

function displayValue(table, field, row) {
  const [column, , type] = field;

  if (type === 'date') return fmtDate(row[column]);

  const labelColumn = displayLabels[table]?.[column];

  return labelColumn ? (row[labelColumn] || row[column]) : row[column];
}

// Isi sel untuk tabel KRS (ID, mata kuliah, periode, SKS, tanggal, status).
function krsCell(column, row) {
  switch (column) {
    case 'id_krs':
      return `<strong>${esc(fmtKrsId(row.id_krs))}</strong>`;

    case 'mk_list': {
      const items = row.mk_items || [];

      if (!items.length) {
        return '<span class="sub">Belum ada mata kuliah</span>';
      }

      const shown = items.slice(0, 3)
        .map((item) => `<span class="mk-chip">${esc(item.nama)}</span>`)
        .join('');

      const more = items.length > 3
        ? `<span class="mk-chip more" title="${esc(row.mk_list)}">+${items.length - 3} lainnya</span>`
        : '';

      return `<div class="mk-chips">${shown}${more}</div>`;
    }

    case 'label_periode':
      return esc(nice(row.label_periode || row.id_periode));

    case 'mk_sks':
      return esc(row.mk_sks ?? 0);

    case 'tgl_isi':
      return esc(fmtDate(row.tgl_isi));

    case 'status': {
      const s = String(row.status).toLowerCase();
      // Admin dan mahasiswa melihat "pending" selama menunggu keputusan dosen.
      const label = s === 'diajukan' && currentUser?.role !== 'dosen' ? 'pending' : s;

      return `<span class="badge" data-status="${esc(s)}">${esc(label)}</span>`;
    }

    default:
      return esc(nice(row[column]));
  }
}

// Tombol aksi untuk satu baris, sesuai peran dan status data.
function buildActions(row, key) {
  const role = currentUser?.role;
  const status = String(row.status ?? '').toLowerCase();
  const parts = [];

  if (current === 'krs_detail' && canInputGrade()) {
    const selectedGrade = row.nilai_huruf || '';
    const gradeKey = `${row.id_krs}~${row.id_kelas}`;

    parts.push(`
      <select data-grade-input="${esc(gradeKey)}">
        ${gradeOptions.map((grade) => `
          <option value="${esc(grade)}" ${grade === selectedGrade ? 'selected' : ''}>${grade || 'Pilih nilai'}</option>
        `).join('')}
      </select>
      <button class="mini" data-save-grade="${esc(row.id_krs)}"
        data-grade-class="${esc(row.id_kelas)}">Simpan Nilai</button>
    `);
  }

  if (current === 'krs') {
    if (role === 'dosen' && status === 'diajukan') {
      parts.push(`
        <button class="mini" data-krs-decision="${esc(row.id_krs)}"
          data-status="disetujui">Setujui</button>
        <button class="mini danger" data-krs-decision="${esc(row.id_krs)}"
          data-status="ditolak">Tolak</button>
      `);
    }

    if (canSubmitKrs() && status === 'draft') {
      parts.push(
        `<button class="mini" data-submit-krs="${esc(row.id_krs)}">Ajukan</button>`
      );
    }
  }

  if (canWrite(current)) {
    parts.push(`
      <button class="mini" data-edit="${esc(key)}">Ubah</button>
      <button class="mini danger" data-delete="${esc(key)}">Hapus</button>
    `);
  }

  if (!parts.length) return '<td>—</td>';

  return `<td><div class="action-group">${parts.join('')}</div></td>`;
}

function renderRows() {
  const definition = meta[current];
  if (!definition) return;

  const query = $('#search').value.toLowerCase();

  const filteredRows = rows.filter((row) =>
    Object.values(row).some((value) =>
      String(value ?? '').toLowerCase().includes(query)
    )
  );

  const isKrsDetail = current === 'krs_detail';
  const isKrs = current === 'krs';

  let visibleFields;

  if (isKrsDetail) {
    visibleFields = [
      ['id_krs', 'Mahasiswa'],
      ['id_kelas', 'Mata Kuliah'],
      ['label_kelas', 'Kelas'],
      ['label_sks', 'SKS'],
      ['nilai_huruf', 'Nilai Huruf']
    ];
  } else if (isKrs) {
    visibleFields = [
      ['id_krs', 'ID KRS'],
      ['mk_list', 'Mata Kuliah'],
      ['label_periode', 'Periode'],
      ['mk_sks', 'Total SKS'],
      ['tgl_isi', 'Tanggal Isi'],
      ['status', 'Status KRS']
    ];
  } else {
    visibleFields = definition.fields.filter((field) => field[0] !== 'created_at');
  }

  const showActions =
    canWrite(current) ||
    (current === 'krs' &&
      (canSubmitKrs() || currentUser?.role === 'dosen')) ||
    (isKrsDetail && canInputGrade());

  $('#thead').innerHTML = `
    <tr>
      ${visibleFields.map((field) => `<th>${esc(field[1])}</th>`).join('')}
      ${showActions ? '<th>Aksi</th>' : ''}
    </tr>
  `;

  $('#tbody').innerHTML = filteredRows.map((row) => {
    const key = definition.pk.map((column) => row[column]).join('~');

    const cells = visibleFields.map((field) => {
      if (isKrs) return `<td>${krsCell(field[0], row)}</td>`;

      let value;

      if (isKrsDetail) {
        const detailValues = {
          id_krs: row.label_mahasiswa || row.id_krs,
          id_kelas: row.label_mk || row.id_kelas,
          label_kelas: row.label_kelas || '—',
          label_sks: row.label_sks ?? 0,
          nilai_huruf: row.nilai_huruf
        };

        value = detailValues[field[0]];
      } else {
        value = displayValue(current, field, row);
      }

      return `<td>${esc(nice(value))}</td>`;
    }).join('');

    return `<tr>${cells}${showActions ? buildActions(row, key) : ''}</tr>`;
  }).join('');
}

// ---------------------------------------------------------------
//  Aksi KRS dan nilai
// ---------------------------------------------------------------
async function submitKrs(krsId) {
  if (!confirm(`Yakin ingin mengajukan ${fmtKrsId(krsId)}?`)) return;

  try {
    await api(`/api/paket/ajukan/${encodeURIComponent(krsId)}`, {
      method: 'POST'
    });

    toast('KRS berhasil diajukan!');
    await refreshCurrent();
  } catch (error) {
    toast('Gagal mengajukan KRS: ' + error.message);
  }
}

// Keputusan persetujuan KRS oleh dosen.
async function decideKrs(krsId, status) {
  const action = status === 'disetujui' ? 'menyetujui' : 'menolak';

  if (!confirm(`Yakin ingin ${action} ${fmtKrsId(krsId)}?`)) return;

  try {
    const result = await api(
      `/api/paket/persetujuan/${encodeURIComponent(krsId)}`,
      {
        method: 'PUT',
        body: JSON.stringify({ status })
      }
    );

    toast(result.message || `KRS berhasil ${status}`);
    await refreshCurrent();
  } catch (error) {
    toast('Gagal memproses keputusan KRS: ' + error.message);
  }
}

async function saveGrade(idKrs, idKelas) {
  const gradeKey = `${idKrs}~${idKelas}`;

  const input = [...document.querySelectorAll('[data-grade-input]')]
    .find((element) => element.dataset.gradeInput === gradeKey);

  if (!input) {
    toast('Pilihan nilai tidak ditemukan.');
    return;
  }

  try {
    const result = await api(
      `/api/krs-detail/${encodeURIComponent(idKrs)}/${encodeURIComponent(idKelas)}/nilai`,
      {
        method: 'PUT',
        body: JSON.stringify({ nilai_huruf: input.value })
      }
    );

    toast(result.message || 'Nilai berhasil disimpan.');
    await loadRows();
  } catch (error) {
    toast('Gagal menyimpan nilai: ' + error.message);
  }
}

// ---------------------------------------------------------------
//  Formulir tambah / ubah
// ---------------------------------------------------------------
async function openForm(key = null) {
  if (!canWrite(current)) return;

  editing = key;

  const definition = meta[current];

  const row = key
    ? rows.find((item) =>
        definition.pk.map((column) => item[column]).join('~') === key
      )
    : {};

  if (key && !row) {
    toast('Data yang akan diubah tidak ditemukan.');
    return;
  }

  $('#modal-title').textContent = key
    ? 'Ubah ' + definition.label
    : 'Tambah ' + definition.label;

  const inputs = [];

  for (const field of definition.fields) {
    const [
      column,
      label,
      type,
      required,
      options,
      valueColumn,
      labelColumn
    ] = field;

    // Mahasiswa tidak boleh mengisi nilai.
    if (column === 'nilai_huruf' && currentUser.role === 'mahasiswa') {
      continue;
    }

    // created_at hanya relevan saat mengubah data.
    if (column === 'created_at' && !key) continue;

    // KRS: status tidak diisi admin (diputuskan oleh dosen).
    if (current === 'krs' && column === 'status') continue;

    const isPrimaryKey = definition.pk.includes(column);
    const requiredMark = required ? ' *' : '';

    // Pilihan dari tabel lain (foreign key).
    if (type === 'fk') {
      let list = [];

      try {
        list = await api('/api/options/' + options);
      } catch (error) {
        console.error('Gagal memuat pilihan:', error.message);
      }

      const defaultValue =
        currentUser.role === 'mahasiswa' && column === 'nim'
          ? currentUser.ref
          : '';

      const selectedValue = String(row?.[column] ?? defaultValue ?? '');

      inputs.push(`
        <div class="field">
          <label>${esc(label)}${requiredMark}</label>
          <select name="${esc(column)}" ${required ? 'required' : ''}>
            <option value="">Pilih ${esc(label.toLowerCase())}</option>
            ${list.map((item) => `
              <option value="${esc(item[valueColumn])}" ${selectedValue === String(item[valueColumn]) ? 'selected' : ''}>${esc(options === 'krs' ? fmtKrsId(item[valueColumn]) : `${item[valueColumn]} — ${item[labelColumn] ?? item[valueColumn]}`)}</option>
            `).join('')}
          </select>
        </div>
      `);

      continue;
    }

    // Pilihan tetap.
    if (type === 'select') {
      const selectedValue = String(
        row?.[column] ?? (column === 'status' ? 'aktif' : '')
      );

      inputs.push(`
        <div class="field">
          <label>${esc(label)}${requiredMark}</label>
          <select name="${esc(column)}" ${required ? 'required' : ''}>
            ${options.map((option) => `
              <option value="${esc(option)}" ${selectedValue === String(option) ? 'selected' : ''}>${esc(option || '(kosong)')}</option>
            `).join('')}
          </select>
        </div>
      `);

      continue;
    }

    // Input biasa.
    let value = row?.[column] ??
      (column === 'tgl_isi' ? new Date().toLocaleDateString('en-CA') : '');

    if (type === 'date' && value) {
      value = toDateInput(value);
    }

    const readOnly = isPrimaryKey && Boolean(key);

    // ID KRS boleh diisi manual oleh admin saat menambah data.
    const idManual = current === 'krs' && column === 'id_krs' && !key;
    const autoId = isPrimaryKey && !key && type === 'number' && !idManual;

    const hint = readOnly
      ? 'Kunci utama tidak diubah'
      : idManual
        ? 'Isi angka ID, atau kosongkan agar dibuat otomatis'
        : autoId
          ? 'ID dibuat otomatis oleh sistem'
          : required
            ? 'Wajib diisi'
            : 'Opsional';

    inputs.push(`
      <div class="field">
        <label>${esc(label)}${requiredMark}</label>
        <input
          name="${esc(column)}"
          type="${esc(type)}"
          value="${esc(value)}"
          ${required ? 'required' : ''}
          ${readOnly || autoId ? 'readonly' : ''}
          ${type === 'number' ? 'step="1"' : ''}
          placeholder="${esc(hint)}"
        >
        <span class="hint">${esc(hint)}</span>
      </div>
    `);
  }

  $('#form-fields').innerHTML = inputs.join('');
  if (current === 'krs') await setupKrsKelasPicker(key);
  $('#modal').classList.remove('hidden');
}

// Daftar centang mata kuliah (kelas) di form KRS admin.
async function setupKrsKelasPicker(key) {
  const box = document.createElement('div');
  box.className = 'field';
  box.style.gridColumn = '1 / -1';
  box.innerHTML = `
    <label>Mata Kuliah (Kelas)</label>
    <div id="krs-kelas-list" class="pick-list"></div>
    <span class="hint" id="krs-kelas-total"></span>
  `;
  $('#form-fields').appendChild(box);

  const periodeSelect = document.querySelector('#form-fields [name="id_periode"]');
  let selected = new Set();

  // Tambah baru: isi otomatis periode terbaru + aturan akademik.
  if (!key) {
    try {
      const def = await api('/api/paket/admin/default');
      const aturanSelect = document.querySelector('#form-fields [name="kode_aturan"]');

      if (periodeSelect && def.id_periode) periodeSelect.value = def.id_periode;
      if (aturanSelect && def.kode_aturan) aturanSelect.value = def.kode_aturan;
    } catch (error) {
      // Dibiarkan kosong, admin bisa memilih sendiri.
    }
  }

  if (key) {
    try {
      const ids = await api(`/api/paket/admin/krs/${encodeURIComponent(key)}`);
      selected = new Set(ids.map(Number));
    } catch (error) {
      toast('Gagal memuat mata kuliah KRS: ' + error.message);
    }
  }

  const list = $('#krs-kelas-list');
  let kelasList = [];

  const updateTotal = () => {
    const total = kelasList
      .filter((k) => selected.has(Number(k.id_kelas)))
      .reduce((sum, k) => sum + Number(k.sks), 0);

    $('#krs-kelas-total').textContent = `Total SKS terpilih: ${total}`;
  };

  const render = async () => {
    const periode = periodeSelect?.value;

    if (!periode) {
      kelasList = [];
      list.innerHTML = '<span class="sub">Pilih periode dulu.</span>';
      updateTotal();
      return;
    }

    try {
      kelasList = await api(`/api/paket/admin/kelas/${encodeURIComponent(periode)}`);
    } catch (error) {
      kelasList = [];
    }

    if (!kelasList.length) {
      list.innerHTML = '<span class="sub">Belum ada kelas di periode ini.</span>';
      updateTotal();
      return;
    }

    list.innerHTML = kelasList.map((k) => `
      <label class="pick-item">
        <input type="checkbox" data-kelas="${esc(k.id_kelas)}"
          ${selected.has(Number(k.id_kelas)) ? 'checked' : ''}>
        <span>
          <span class="pick-name">${esc(k.nama_mk)}</span>
          <span class="pick-meta">Sem ${esc(k.semester_ke)} · ${esc(k.kode_mk)} · Kelas ${esc(k.nama_kelas)} · ${esc(k.sks)} SKS</span>
        </span>
      </label>
    `).join('');

    list.querySelectorAll('[data-kelas]').forEach((checkbox) => {
      checkbox.addEventListener('change', () => {
        const id = Number(checkbox.dataset.kelas);

        if (checkbox.checked) selected.add(id);
        else selected.delete(id);

        updateTotal();
      });
    });

    updateTotal();
  };

  periodeSelect?.addEventListener('change', render);
  await render();
}

function closeForm() {
  $('#modal').classList.add('hidden');
  editing = null;
}

function validateForm(definition, body, table) {
  for (const [column, label, type, required, options] of definition.fields) {
    // STATUS KRS tidak diedit melalui form CRUD
    if (table === 'krs' && column === 'status') continue;

    const value = body[column];

    // 1. EXISTENCE CHECK
    if (required && (value == null || String(value).trim() === '')) {
      return `${label} wajib diisi`;
    }

    // Kolom opsional yang kosong tidak perlu diperiksa lebih lanjut
    if (value == null || value === '') continue;

    // Validasi khusus NIM
    if (table === 'mahasiswa' && column === 'nim') {
      if (!/^\d+$/.test(value)) {
        return 'NIM hanya boleh berisi angka';
      }
    }
    // 2. DATA-TYPE CHECK
    if (type === 'number' && !Number.isFinite(value)) {
      return `${label} harus berupa angka`;
    }

    if (type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return `Format ${label} tidak valid`;
    }

    // 3. DOMAIN CHECK
    if (type === 'select' && !options.includes(value)) {
      return `Pilihan ${label} tidak valid`;
    }

    if (type === 'number' && value < 0) {
      return `${label} tidak boleh bernilai negatif`;
    }

    // 4. FORMAT CHECK
    if (type === 'email') {
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (!emailPattern.test(value)) {
        return `Format ${label} tidak valid`;
      }
    }
  }

  return null;
}

async function saveForm(event) {
  event.preventDefault();

  const definition = meta[current];
  const formData = new FormData(event.target);
  const body = Object.fromEntries(formData.entries());
  

  for (const [column, , type] of definition.fields) {
    if (!(column in body)) continue;

    if (body[column] === '') {
      body[column] = null;
    } else if (type === 'number') {
      body[column] = Number(body[column]);
    }
  }

const validationError = validateForm(definition, body, current);

if (validationError) {
  $('#notice').textContent = validationError;
  $('#notice').classList.remove('hidden');
  toast(validationError);
  return;
}

// Validasi khusus KRS: minimal memilih satu kelas
if (current === 'krs' && body.id_kelas.length === 0) {
  const message = 'Pilih minimal satu kelas untuk KRS';

  $('#notice').textContent = message;
  $('#notice').classList.remove('hidden');
  toast(message);
  return;
}

  // KRS: kirim juga kelas (mata kuliah) yang dicentang.
  if (current === 'krs') {
    body.id_kelas = [...document.querySelectorAll('#krs-kelas-list [data-kelas]:checked')]
      .map((checkbox) => Number(checkbox.dataset.kelas));

    if (editing) delete body.id_krs;
    delete body.status;
  }

  const baseUrl = current === 'krs' ? '/api/paket/admin/krs' : `/api/${current}`;

  try {
    if (editing) {
      await api(`${baseUrl}/${encodeURIComponent(editing)}`, {
        method: 'PUT',
        body: JSON.stringify(body)
      });

      toast('Perubahan berhasil disimpan');
    } else {
      await api(baseUrl, {
        method: 'POST',
        body: JSON.stringify(body)
      });

      toast('Data baru berhasil ditambahkan');
    }

    closeForm();
    await loadRows();
  } catch (error) {
    $('#notice').textContent = error.message;
    $('#notice').classList.remove('hidden');
    toast('Gagal menyimpan data: ' + error.message);
  }
}

async function deleteRow(key) {
  if (!canWrite(current)) return;

  const message =
    'Yakin ingin menghapus data ini? ' +
    'Penghapusan dapat ditolak jika data masih dipakai oleh relasi lain.';

  if (!confirm(message)) return;

  try {
    const baseUrl = current === 'krs' ? '/api/paket/admin/krs' : `/api/${current}`;

    await api(`${baseUrl}/${encodeURIComponent(key)}`, {
      method: 'DELETE'
    });

    toast('Data berhasil dihapus');
    await loadRows();
  } catch (error) {
    toast('Tidak dapat menghapus: ' + error.message);
  }
}

// ---------------------------------------------------------------
//  Ganti password
// ---------------------------------------------------------------
function openPasswordForm() {
  $('#password-form').reset();
  $('#password-modal').classList.remove('hidden');
  $('#current-password').focus();
}

function closePasswordForm() {
  $('#password-modal').classList.add('hidden');
  $('#password-form').reset();
}

async function changePassword(event) {
  event.preventDefault();

  const currentPassword = $('#current-password').value;
  const newPassword = $('#new-password').value;
  const confirmPassword = $('#confirm-password').value;

  if (newPassword !== confirmPassword) {
    toast('Konfirmasi password baru tidak cocok.');
    return;
  }

  if (newPassword.length < 8) {
    toast('Password baru minimal 8 karakter.');
    return;
  }

  try {
    const result = await api('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword })
    });

    toast(result.message || 'Password berhasil diubah.');
    closePasswordForm();
  } catch (error) {
    toast('Gagal mengganti password: ' + error.message);
  }
}

init();