const $ = (selector) => document.querySelector(selector);

let meta = {};
let current = 'dashboard';
let rows = [];
let editing = null;

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

async function init() {
  try {
    meta = await api('/api/meta');
    $('#conn').textContent = 'Terhubung';
    $('#conn').style.color = '#8de4c6';
  } catch (error) {
    $('#conn').textContent = 'Belum terhubung';
    $('#conn').style.color = '#ffb1b1';
    toast('Gagal menghubungkan aplikasi ke server.');
    return;
  }

  $('#today').textContent = new Intl.DateTimeFormat('id-ID', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  }).format(new Date());

  $('#nav-data').innerHTML = Object.entries(meta)
    .map(([table, definition]) => `
      <button class="nav" data-table="${esc(table)}">
        ${icons[table] || '◦'}
        <span>${esc(definition.label)}</span>
      </button>
    `)
    .join('');

  document.querySelectorAll('[data-page="dashboard"]')
    .forEach((button) => {
      button.onclick = dashboard;
    });

  document.querySelectorAll('[data-table]').forEach((button) => {
    button.onclick = () => openTable(button.dataset.table);
  });

  $('#add').onclick = () => openForm();
  $('#close').onclick = closeForm;
  $('#cancel').onclick = closeForm;
  $('#search').oninput = renderRows;
  $('#record-form').onsubmit = saveForm;

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

async function dashboard() {
  current = 'dashboard';

  $('#dashboard').classList.remove('hidden');
  $('#table-page').classList.add('hidden');

  document.querySelectorAll('.nav').forEach((button) => {
    button.classList.toggle(
      'active',
      button.dataset.page === 'dashboard'
    );
  });

  $('#page-title').textContent = 'Dashboard';
  $('#page-subtitle').textContent =
    'Ringkasan data dan pengelolaan akademik.';

  try {
    const stats = await api('/api/stats');

    $('#stats').innerHTML = Object.entries(meta)
      .slice(0, 4)
      .map(([table, definition]) => `
        <div class="stat">
          <div class="stat-top">
            <span>${esc(definition.label)}</span>
            <span class="stat-icon">${icons[table] || '◦'}</span>
          </div>
          <strong>${stats[table] ?? 0}</strong>
          <small>Total data tersimpan</small>
        </div>
      `)
      .join('');

    $('#module-cards').innerHTML = Object.entries(meta)
      .map(([table, definition]) => `
        <button class="module-card" data-module="${esc(table)}">
          <span class="mi">${icons[table] || '◦'}</span>
          <b>${esc(definition.label)}</b>
          <small>${stats[table] ?? 0} record · Kelola data →</small>
        </button>
      `)
      .join('');
  } catch (error) {
    $('#stats').innerHTML = `
      <div class="notice">
        Tidak dapat membaca data: ${esc(error.message)}
      </div>
    `;
  }
}

async function openTable(table) {
  if (!meta[table]) return;

  current = table;

  $('#dashboard').classList.add('hidden');
  $('#table-page').classList.remove('hidden');

  document.querySelectorAll('.nav').forEach((button) => {
    button.classList.toggle(
      'active',
      button.dataset.table === table
    );
  });

  $('#page-title').textContent = meta[table].label;
  $('#page-subtitle').textContent =
    'Kelola data akademik sesuai struktur ERD.';
  $('#table-heading').textContent = meta[table].label;
  $('#table-desc').textContent =
    'Tambah, ubah, cari, dan hapus data sesuai relasi ERD.';

  $('#search').value = '';

  // Tombol Ajukan tidak dibuat di toolbar lagi.
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

  $('#thead').innerHTML = `
    <tr>
      ${visibleFields.map((field) =>
        `<th>${esc(field[1])}</th>`
      ).join('')}
      <th>Aksi</th>
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

    // Tombol Ajukan hanya tampil untuk KRS berstatus draft.
    const submitButton =
      current === 'krs' && row.status === 'draft'
        ? `
          <button
            class="mini"
            data-submit-krs="${esc(row.id_krs)}"
          >
            Ajukan
          </button>
        `
        : '';

    return `
      <tr>
        ${cells}
        <td>
          <div class="row-actions">
            <button class="mini" data-edit="${esc(key)}">
              Ubah
            </button>
            <button class="mini danger" data-delete="${esc(key)}">
              Hapus
            </button>
            ${submitButton}
          </div>
        </td>
      </tr>
    `;
  }).join('') || `
    <tr>
      <td colspan="${visibleFields.length + 1}"
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
    await loadRows();
  } catch (error) {
    toast('Gagal mengajukan KRS: ' + error.message);
  }
}

async function openForm(key = null) {
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

    const isPrimaryKey = definition.pk.includes(column);

    if (type === 'fk') {
      let list = [];

      try {
        list = await api('/api/options/' + options);
      } catch (error) {
        console.error('Gagal memuat pilihan:', error.message);
      }

      inputs.push(`
        <div class="field">
          <label>${esc(label)}${required ? ' *' : ''}</label>
          <select name="${esc(column)}" ${required ? 'required' : ''}>
            <option value="">Pilih ${esc(label.toLowerCase())}</option>
            ${list.map((item) => `
              <option
                value="${esc(item[valueColumn])}"
                ${
                  String(row?.[column] ?? '') ===
                  String(item[valueColumn]) ? 'selected' : ''
                }
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