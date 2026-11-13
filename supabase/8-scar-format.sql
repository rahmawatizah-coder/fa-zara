-- ============================================================
-- 8-scar-format.sql — jalankan di Supabase: SQL Editor -> New query -> Run. Aman diulang.
-- Menyesuaikan tabel SCAR dengan format Excel baru:
-- No. | Month | Issue Date | SCAR No. | SCAR Level | Model | Family | Production Date | Harness | P/N | Event |
-- Problem Description | 4M Analysis | Detail Root Cause | Qty Case | Action Plan | Years | Status
--   * menambah kolom Production Date (proddate)
--   * Supplier & Due Date tidak ada di format baru -> tidak wajib lagi
--   * aturan CHECK lama pada status/severity/level dilepas (status & level baru memakai nilai berbeda)
-- Data yang sudah ada TIDAK berubah.
-- ============================================================

alter table public.scar add column if not exists proddate date;

do $$
declare c record; col text;
begin
  foreach col in array array['supplier','due','severity','pn','description'] loop
    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='scar' and column_name=col and is_nullable='NO') then
      execute format('alter table public.scar alter column %I drop not null', col);
    end if;
  end loop;
  for c in select conname from pg_constraint
           where conrelid='public.scar'::regclass and contype='c'
             and (pg_get_constraintdef(oid) ilike '%status%' or pg_get_constraintdef(oid) ilike '%severity%' or pg_get_constraintdef(oid) ilike '%level%')
  loop
    execute format('alter table public.scar drop constraint %I', c.conname);
  end loop;
end $$;

notify pgrst, 'reload schema';
