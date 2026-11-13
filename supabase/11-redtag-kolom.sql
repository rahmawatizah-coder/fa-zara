-- ============================================================
-- 11-redtag-kolom.sql — jalankan di Supabase: SQL Editor -> New query -> Run
-- Menyesuaikan tabel Red Tag dengan form/dashboard terbaru (config.js).
-- Aman diulang. Data yang sudah ada tidak berubah.
-- ============================================================
alter table public.redtag
  add column if not exists aptivpn    text default '',
  add column if not exists project    text default '',
  add column if not exists family     text default '',
  add column if not exists reworkplan text default '',
  add column if not exists qtyrework  integer default 0;

-- Kolom lama yang tidak dipakai form baru: tidak wajib lagi
alter table public.redtag alter column area drop not null;
alter table public.redtag alter column disposition drop not null;
alter table public.redtag alter column status drop not null;

notify pgrst, 'reload schema';
