-- ============================================================
-- 4-kolom-baru.sql — jalankan di Supabase: SQL Editor -> New query -> Run
-- Menambah kolom yang dipakai form terbaru (config.js) tapi belum ada di tabel:
--   FTQ : No.Serial (serial), Position (posisi)
--   SCAR: SCAR Level, Harness Name, Model, Family, Event, 4M Analysis
-- Aman dijalankan berulang kali. Data yang sudah ada tidak berubah.
-- ============================================================

alter table public.ftq
  add column if not exists serial text default '',
  add column if not exists posisi text default '';

alter table public.scar
  add column if not exists level    text default '',
  add column if not exists harness  text default '',
  add column if not exists model    text default '',
  add column if not exists family   text default '',
  add column if not exists event    text default '',
  add column if not exists analysis text default '';

-- Form SCAR yang baru memakai "SCAR Level", bukan "severity"; kolom lama tidak wajib lagi
alter table public.scar alter column severity drop not null;

-- Muat ulang skema agar API Supabase langsung mengenali kolom baru
notify pgrst, 'reload schema';
