-- ============================================================
-- 13-hapus-engineering.sql — hapus permanen HANYA untuk Engineering (role 'input'); Admin ditolak oleh database
-- Jalankan di Supabase: SQL Editor -> New query -> tempel semua -> Run. Aman diulang.
-- (Aplikasi juga menampilkan peringatan untuk Admin, tetapi aturan sebenarnya dijaga di sini.)
-- ============================================================
do $$
declare t text; p record;
begin
  foreach t in array array['ftq','scar','redtag'] loop
    for p in select policyname from pg_policies where schemaname='public' and tablename=t and cmd='DELETE' loop
      execute format('drop policy if exists %I on public.%I', p.policyname, t);
    end loop;
    execute format('grant delete on public.%I to authenticated', t);
    execute format('create policy "hanya engineering boleh hapus" on public.%I for delete to authenticated using (public.my_role() = ''input'')', t);
  end loop;
end $$;

notify pgrst, 'reload schema';

-- Cek (opsional): select tablename, policyname, cmd from pg_policies where schemaname='public' and cmd='DELETE' order by 1;
