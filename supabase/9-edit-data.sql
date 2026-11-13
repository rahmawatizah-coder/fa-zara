-- ============================================================
-- 9-edit-data.sql — izinkan Admin & Engineering (role "input") MENGEDIT data yang sudah terinput
-- Jalankan di Supabase: SQL Editor -> New query -> tempel semua -> Run. Aman diulang.
-- Supervisor, Other, dan pengunjung tanpa login tetap tidak bisa mengubah data.
-- ============================================================

grant update on public.ftq, public.scar, public.redtag to authenticated;

do $$
declare t text;
begin
  foreach t in array array['ftq','scar','redtag'] loop
    execute format('drop policy if exists "admin dan input boleh ubah" on public.%I', t);
    execute format('create policy "admin dan input boleh ubah" on public.%I for update to authenticated using (public.my_role() in (''admin'',''input'')) with check (public.my_role() in (''admin'',''input''))', t);
  end loop;
end $$;

notify pgrst, 'reload schema';

-- Pemeriksaan (opsional):
--   select tablename, policyname, cmd from pg_policies where schemaname='public' and cmd='UPDATE' order by 1;
