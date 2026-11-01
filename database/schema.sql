
-- =========================================
-- DATABASE SISTEM KRS
-- Struktur disesuaikan dengan database modul_krs
-- =========================================

CREATE TABLE IF NOT EXISTS prodi (
    kode_prodi VARCHAR(10) PRIMARY KEY,
    nama_prodi VARCHAR(100) NOT NULL,
    jenjang VARCHAR(3) NOT NULL
);

CREATE TABLE IF NOT EXISTS dosen (
    id_dosen SERIAL PRIMARY KEY,
    nidn VARCHAR(10) UNIQUE,
    nama VARCHAR(100) NOT NULL,
    email VARCHAR(100),
    kode_prodi VARCHAR(10) NOT NULL,
    CONSTRAINT dosen_kode_prodi_fkey
        FOREIGN KEY (kode_prodi) REFERENCES prodi(kode_prodi)
);

CREATE TABLE IF NOT EXISTS mahasiswa (
    nim VARCHAR(12) PRIMARY KEY,
    nama VARCHAR(100) NOT NULL,
    email VARCHAR(100),
    tahun_masuk SMALLINT NOT NULL,
    status VARCHAR(10) NOT NULL DEFAULT 'Aktif',
    kode_prodi VARCHAR(10) NOT NULL,
    id_dosen_pa INTEGER,
    CONSTRAINT mahasiswa_kode_prodi_fkey
        FOREIGN KEY (kode_prodi) REFERENCES prodi(kode_prodi),
    CONSTRAINT mahasiswa_id_dosen_pa_fkey
        FOREIGN KEY (id_dosen_pa) REFERENCES dosen(id_dosen)
);

CREATE TABLE IF NOT EXISTS mata_kuliah (
    kode_mk VARCHAR(10) PRIMARY KEY,
    nama_mk VARCHAR(100) NOT NULL,
    sks SMALLINT NOT NULL,
    semester_ke SMALLINT NOT NULL,
    kode_prodi VARCHAR(10) NOT NULL,
    CONSTRAINT mata_kuliah_kode_prodi_fkey
        FOREIGN KEY (kode_prodi) REFERENCES prodi(kode_prodi)
);

CREATE TABLE IF NOT EXISTS periode (
    id_periode VARCHAR(5) PRIMARY KEY,
    nama_periode VARCHAR(30) NOT NULL,
    tgl_mulai DATE NOT NULL,
    tgl_selesai DATE NOT NULL
);

CREATE TABLE IF NOT EXISTS kelas (
    id_kelas SERIAL PRIMARY KEY,
    kode_mk VARCHAR(10) NOT NULL,
    id_periode VARCHAR(5) NOT NULL,
    id_dosen INTEGER NOT NULL,
    nama_kelas VARCHAR(5) NOT NULL,
    kuota SMALLINT NOT NULL,
    ruangan VARCHAR(20),
    CONSTRAINT kelas_kode_mk_fkey
        FOREIGN KEY (kode_mk) REFERENCES mata_kuliah(kode_mk),
    CONSTRAINT kelas_id_periode_fkey
        FOREIGN KEY (id_periode) REFERENCES periode(id_periode),
    CONSTRAINT kelas_id_dosen_fkey
        FOREIGN KEY (id_dosen) REFERENCES dosen(id_dosen),
    CONSTRAINT kelas_kuota_check CHECK (kuota > 0),
    CONSTRAINT kelas_kode_mk_id_periode_nama_kelas_key
        UNIQUE (kode_mk, id_periode, nama_kelas)
);

CREATE TABLE IF NOT EXISTS aturan_akademik (
    kode_aturan VARCHAR(30) PRIMARY KEY,
    nilai INTEGER NOT NULL,
    keterangan VARCHAR(200)
);

CREATE TABLE IF NOT EXISTS krs (
    id_krs SERIAL PRIMARY KEY,
    nim VARCHAR(12) NOT NULL,
    id_periode VARCHAR(5) NOT NULL,
    kode_aturan VARCHAR(30) NOT NULL,
    tgl_isi DATE NOT NULL DEFAULT CURRENT_DATE,
    status VARCHAR(10) NOT NULL DEFAULT 'Draft',
    CONSTRAINT krs_nim_fkey
        FOREIGN KEY (nim) REFERENCES mahasiswa(nim),
    CONSTRAINT krs_id_periode_fkey
        FOREIGN KEY (id_periode) REFERENCES periode(id_periode),
    CONSTRAINT krs_kode_aturan_fkey
        FOREIGN KEY (kode_aturan) REFERENCES aturan_akademik(kode_aturan),
    CONSTRAINT krs_nim_id_periode_key
        UNIQUE (nim, id_periode)
);

CREATE TABLE IF NOT EXISTS krs_detail (
    id_krs INTEGER NOT NULL,
    id_kelas INTEGER NOT NULL,
    nilai_huruf VARCHAR(2),
    CONSTRAINT krs_detail_pkey PRIMARY KEY (id_krs, id_kelas),
    CONSTRAINT krs_detail_id_krs_fkey
        FOREIGN KEY (id_krs) REFERENCES krs(id_krs),
    CONSTRAINT krs_detail_id_kelas_fkey
        FOREIGN KEY (id_kelas) REFERENCES kelas(id_kelas)
);

-- =========================================
-- INDEX
-- =========================================

CREATE INDEX IF NOT EXISTS idx_mahasiswa_prodi
    ON mahasiswa(kode_prodi);

CREATE INDEX IF NOT EXISTS idx_kelas_periode
    ON kelas(id_periode);

CREATE INDEX IF NOT EXISTS idx_krs_periode
    ON krs(id_periode);
