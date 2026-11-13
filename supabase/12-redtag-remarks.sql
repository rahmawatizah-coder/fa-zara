-- ============================================================
-- 12-redtag-remarks-terbaru.sql — urutan "Red Tag Terbaru" berdasarkan perubahan REMARKS
-- Jalankan di Supabase: SQL Editor -> New query -> tempel semua -> Run. Aman diulang.
-- Kolom remarks_updated_at terisi saat data baru masuk dan setiap kali isi REMARKS atau QTY berubah
-- (perubahan kolom lain, termasuk tanggal, tidak mengubahnya).
-- ============================================================
alter table public.redtag add column if not exists remarks_updated_at timestamptz;

-- Data lama: pakai waktu input awal (created_at) bila ada
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='redtag' and column_name='created_at') then
    execute 'update public.redtag set remarks_updated_at = coalesce(created_at, now()) where remarks_updated_at is null';
  else
    update public.redtag set remarks_updated_at = now() where remarks_updated_at is null;
  end if;
end $$;

alter table public.redtag alter column remarks_updated_at set default now();

create or replace function public.redtag_touch_remarks() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.remarks_updated_at := now();
  elsif new.remarks is distinct from old.remarks or new.qty is distinct from old.qty then
    new.remarks_updated_at := now();
  else
    new.remarks_updated_at := old.remarks_updated_at;   -- edit kolom lain tidak mengubah urutan
  end if;
  return new;
end $$;

drop trigger if exists redtag_touch_remarks on public.redtag;
create trigger redtag_touch_remarks before insert or update on public.redtag
  for each row execute function public.redtag_touch_remarks();

notify pgrst, 'reload schema';