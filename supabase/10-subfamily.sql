-- ============================================================
-- 10-subfamily.sql — jalankan di Supabase: SQL Editor -> New query -> Run
-- Menambah kolom Sub Family (Harness Type (Sub-Fam)) di tabel FTQ. Aman diulang.
-- ============================================================
alter table public.ftq add column if not exists subfamily text default '';
notify pgrst, 'reload schema';
