const $ = (selector) => document.querySelector(selector);

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

// Tabel yang boleh ditambah/diubah/dihapus. Admin: semua. Dosen: tidak ada.
const writableTables = {
  dosen: [],
  mahasiswa: ['krs_detail']
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
    subtitle: 'Ringkasan KRS dan beban studi Anda.',
    text: 'Susun KRS, pantau total SKS, dan lihat status pengajuan Anda.'
  }
};

function canWrite(table) {
  const role = currentUser?.role;
  if (role === 'admin') return true;
  return (writableTables[role] || []).includes(table);
}

const canSubmitKrs = () =>
  ['admin', 'mahasiswa'].includes(currentUser?.role);

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

async function api(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw Error(data.error || 'Permintaan gagal');
  }

  return data;
}

function initials(name) {
  const words = String(name || 'U').trim().split(/\s+/);
  if (words.length > 1) return (words[0][0] + words[1][0]).toUpperCase();
  return words[0].slice(0, 2).toUpperCase();
}

// ---------------------------------------------------------------
//  Inisialisasi
// ---------------------------------------------------------------
async function init() {
  try {
    meta = await api('/api/meta');
    currentUser = await api('/api/me');
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

  document.addEventListener('click', (event) => {
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

    const editButton = event.target.closest('[data-edit]');
    if (editButton) {
      openForm(editButton.dataset.edit);
      return;
    }

    const deleteButton = event.target.closest('[data-delete]');
    if (deleteButton) {
      deleteRow(deleteButton.dataset.delete);
    }
  });

  await dashboard();
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

  document.querySelectorAll('[data-page="dashboard"]')
    .forEach((button) => { button.onclick = dashboard; });

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
  const attrs = table
    ? ` type="button" data-module="${esc(table)}"`
    : '';

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

  // Panel status KRS (hanya mahasiswa).
  let panel = $('#my-krs');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'my-krs';
    $('#stats').after(panel);
  }
  panel.innerHTML = '';

  if (role === 'mahasiswa') await renderMyKrs(panel);
}

async function renderMyKrs(panel) {
  try {
    const list = await api('/api/krs');

    const items = await Promise.all(list.map(async (k) => {
      let sks = '—';
      try {
        const summary = await api(
          `/api/krs/${encodeURIComponent(k.id_krs)}/summary`
        );
        sks = summary.total_sks;
      } catch (error) {
        // Ringkasan gagal dimuat: tampilkan tanda strip.
      }
      return { ...k, sks };
    }));

    const body = items.map((k) => `
      <tr>
        <td>${esc(k.id_krs)}</td>
        <td>${esc(nice(k.label_periode || k.id_periode))}</td>
        <td>${esc(nice(String(k.tgl_isi ?? '').slice(0, 10)))}</td>
        <td>${esc(k.sks)}</td>
        <td><span class="badge">${esc(nice(k.status))}</span></td>
        <td>
          ${
            k.status === 'draft'
              ? `<button class="mini" data-submit-krs="${esc(k.id_krs)}">Ajukan</button>`
              : '—'
          }
        </td>
      </tr>
    `).join('') || `
      <tr>
        <td colspan="6" style="text-align:center;padding:24px;color:#8b98aa">
          Belum ada KRS. KRS dibuat oleh admin.
        </td>
      </tr>
    `;

    panel.innerHTML = `
      <div class="panel">
        <div class="toolbar">
          <div>
            <h3>Status KRS</h3>
            <p>KRS dibuat oleh admin. Tambahkan mata kuliah di menu Detail KRS Saya, lalu ajukan di sini.</p>
          </div>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID KRS</th><th>Periode</th><th>Tanggal Isi</th>
                <th>Total SKS</th><th>Status</th><th>Aksi</th>
              </tr>
            </thead>
            <tbody>${body}</tbody>
          </table>
        </div>
      </div>
    `;
  } catch (error) {
    panel.innerHTML =
      `<p class="stats-note error">Gagal memuat KRS: ${esc(error.message)}</p>`;
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

async function loadRows() {
  try {
    rows = await api('/api/' + current);
    $('#notice').classList.add('hidden');
    renderRows();
  } catch (error) {
    $('#notice').textContent = error.message;
    $('#notice').classList.remove('hidden');
    $('#thead').innerHTML = '';
    $('#tbody').innerHTML = '';
  }
}

function displayValue(table, field, row) {
  const [column] = field;

  if (table === 'dosen' && column === 'kode_prodi') {
    return row.label_prodi || row[column];
  }

  if (table === 'mahasiswa' && column === 'kode_prodi') {
    return row.label_prodi || row[column];
  }

  if (table === 'mahasiswa' && column === 'id_dosen_pa') {
    return row.label_dosen_pa || row[column];
  }

  if (table === 'kelas' && column === 'kode_mk') {
    return row.label_mk || row[column];
  }

  if (table === 'kelas' && column === 'id_periode') {
    return row.label_periode || row[column];
  }

  if (table === 'kelas' && column === 'id_dosen') {
    return row.label_dosen || row[column];
  }

  if (table === 'krs' && column === 'nim') {
    return row.label_mahasiswa || row[column];
  }

  if (table === 'krs' && column === 'id_periode') {
    return row.label_periode || row[column];
  }

  if (table === 'krs_detail' && column === 'id_krs') {
    return row.label_mahasiswa || row[column];
  }

  if (table === 'krs_detail' && column === 'id_kelas') {
    return row.label_mk || row[column];
  }

  return row[column];
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

  const visibleFields = isKrsDetail
    ? [
        ['id_krs', 'Mahasiswa'],
        ['id_kelas', 'Mata Kuliah'],
        ['label_kelas', 'Kelas'],
        ['label_sks', 'SKS'],
        ['nilai_huruf', 'Nilai Huruf']
      ]
    : definition.fields.filter(
        (field) => field[0] !== 'created_at'
      );

  const writable = canWrite(current);
  const canSubmit = current === 'krs' && canSubmitKrs();
  const showActions = writable || canSubmit;

  $('#thead').innerHTML = `
    <tr>
      ${visibleFields.map((field) =>
        `<th>${esc(field[1])}</th>`
      ).join('')}
      ${showActions ? '<th>Aksi</th>' : ''}
    </tr>
  `;

  $('#tbody').innerHTML = filteredRows.map((row) => {
    const key = definition.pk
      .map((column) => row[column])
      .join('~');

    const cells = visibleFields.map((field) => {
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

      return `
        <td>
          ${
            field[0] === 'status'
              ? `<span class="badge">${esc(nice(value))}</span>`
              : esc(nice(value))
          }
        </td>
      `;
    }).join('');

    const submitButton =
      canSubmit && row.status === 'draft'
        ? `
          <button class="mini" data-submit-krs="${esc(row.id_krs)}">
            Ajukan
          </button>
        `
        : '';

    const editDelete = writable
      ? `
        <button class="mini" data-edit="${esc(key)}">Ubah</button>
        <button class="mini danger" data-delete="${esc(key)}">Hapus</button>
      `
      : '';

    const actionCell = showActions
      ? `
        <td>
          <div class="row-actions">
            ${editDelete}
            ${submitButton}
          </div>
        </td>
      `
      : '';

    return `<tr>${cells}${actionCell}</tr>`;
  }).join('') || `
    <tr>
      <td colspan="${visibleFields.length + (showActions ? 1 : 0)}"
          style="text-align:center;padding:30px;color:#8b98aa">
        Tidak ada data yang cocok.
      </td>
    </tr>
  `;

  $('#row-count').textContent =
    `${filteredRows.length} dari ${rows.length} data`;
}

async function submitKrs(krsId) {
  if (!confirm(`Yakin ingin mengajukan KRS ID ${krsId}?`)) {
    return;
  }

  try {
    await api(`/api/krs/${encodeURIComponent(krsId)}/submit`, {
      method: 'POST'
    });

    toast('KRS berhasil diajukan!');
    if (current === 'dashboard') await dashboard();
    else await loadRows();
  } catch (error) {
    toast('Gagal mengajukan KRS: ' + error.message);
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

    // Nilai huruf hanya boleh diisi oleh peran selain mahasiswa.
    if (column === 'nilai_huruf' && currentUser.role === 'mahasiswa') {
      continue;
    }

    const isPrimaryKey = definition.pk.includes(column);

    if (type === 'fk') {
      let list = [];

      try {
        list = await api('/api/options/' + options);
      } catch (error) {
        console.error('Gagal memuat pilihan:', error.message);
      }

      // Mahasiswa: NIM otomatis terisi dengan NIM sendiri.
      const defaultValue =
        currentUser.role === 'mahasiswa' && column === 'nim'
          ? currentUser.ref
          : '';

      const selectedValue = String(row?.[column] ?? defaultValue ?? '');

      inputs.push(`
        <div class="field">
          <label>${esc(label)}${required ? ' *' : ''}</label>
          <select name="${esc(column)}" ${required ? 'required' : ''}>
            <option value="">Pilih ${esc(label.toLowerCase())}</option>
            ${list.map((item) => `
              <option
                value="${esc(item[valueColumn])}"
                ${selectedValue === String(item[valueColumn]) ? 'selected' : ''}
              >
                ${esc(item[valueColumn])} —
                ${esc(item[labelColumn] ?? item[valueColumn])}
              </option>
            `).join('')}
          </select>
        </div>
      `);

      continue;
    }

    if (column === 'created_at' && !key) continue;

    if (type === 'select') {
      inputs.push(`
        <div class="field">
          <label>${esc(label)}${required ? ' *' : ''}</label>
          <select name="${esc(column)}" ${required ? 'required' : ''}>
            ${options.map((option) => `
              <option
                value="${esc(option)}"
                ${
                  String(
                    row?.[column] ??
                    (column === 'status' ? 'aktif' : '')
                  ) === String(option) ? 'selected' : ''
                }
              >
                ${esc(option || '(kosong)')}
              </option>
            `).join('')}
          </select>
        </div>
      `);

      continue;
    }

    let value = row?.[column] ??
      (column === 'tgl_isi'
        ? new Date().toISOString().slice(0, 10)
        : '');

    if (type === 'date' && value) {
      value = String(value).slice(0, 10);
    }

    const readOnly = isPrimaryKey && key;
    const disabled = isPrimaryKey && !key && type === 'number';

    const hint = readOnly
      ? 'Kunci utama tidak diubah'
      : disabled
        ? 'ID dibuat otomatis oleh sistem'
        : required
          ? 'Wajib diisi'
          : 'Opsional';

    inputs.push(`
      <div class="field">
        <label>${esc(label)}${required ? ' *' : ''}</label>
        <input
          name="${esc(column)}"
          type="${esc(type)}"
          value="${esc(value)}"
          ${required ? 'required' : ''}
          ${readOnly || disabled ? 'readonly' : ''}
          ${type === 'number' ? 'step="1"' : ''}
          placeholder="${esc(hint)}"
        >
        <span class="hint">${esc(hint)}</span>
      </div>
    `);
  }

  $('#form-fields').innerHTML = inputs.join('');
  $('#modal').classList.remove('hidden');
}

function closeForm() {
  $('#modal').classList.add('hidden');
  editing = null;
}

async function saveForm(event) {
  event.preventDefault();

  const definition = meta[current];
  const formData = new FormData(event.target);
  const body = {};

  for (const [key, value] of formData.entries()) {
    body[key] = value === '' ? '' : value;
  }

  for (const field of definition.fields) {
    const [column, , type] = field;

    if (!(column in body)) continue;

    if (type === 'number' && body[column] !== '') {
      body[column] = Number(body[column]);
    }

    if (body[column] === '') {
      body[column] = null;
    }
  }

  try {
    if (editing) {
      await api(`/api/${current}/${encodeURIComponent(editing)}`, {
        method: 'PUT',
        body: JSON.stringify(body)
      });

      toast('Perubahan berhasil disimpan');
    } else {
      await api(`/api/${current}`, {
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

  if (!confirm(
    'Yakin ingin menghapus data ini? ' +
    'Penghapusan dapat ditolak jika data masih dipakai oleh relasi lain.'
  )) {
    return;
  }

  try {
    await api(`/api/${current}/${encodeURIComponent(key)}`, {
      method: 'DELETE'
    });

    toast('Data berhasil dihapus');
    await loadRows();
  } catch (error) {
    toast('Tidak dapat menghapus: ' + error.message);
  }
}

init();