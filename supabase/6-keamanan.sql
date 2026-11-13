-- ============================================================
-- 6-keamanan.sql — PENGETATAN KEAMANAN (data perusahaan)
-- Jalankan di Supabase: SQL Editor -> New query -> tempel semua -> Run.
-- Aman dijalankan berulang kali.
--
-- SEBELUM menjalankan ini:
--   a) Buat akun baru di Authentication -> Users -> Add user (centang Auto Confirm User):
--        other@qc-demo.com   dengan password bersama untuk role Other (buat sendiri, panjang & unik)
--   b) Pastikan kode terbaru (common.js yang meminta password untuk Other) sudah terpasang & di-push.
--
-- Hasilnya:
--   * Pengunjung TANPA login tidak bisa membaca data sama sekali (hak "anon" dicabut).
--   * Hanya akun yang punya role di tabel qc_roles (admin/input/supervisor/other) yang bisa membaca.
--   * Hanya admin & input yang bisa menambah data. Tidak seorang pun bisa mengubah/menghapus
--     data lewat website atau API (hak update/delete dicabut).
-- ============================================================

-- 1) Role "other" diizinkan di tabel role
alter table public.qc_roles drop constraint if exists qc_roles_role_check;
alter table public.qc_roles add constraint qc_roles_role_check
  check (role in ('admin','input','supervisor','other'));

insert into public.qc_roles (id, role)
select id, 'other' from auth.users where email = 'other@qc-demo.com'
on conflict (id) do update set role = excluded.role;

-- 2) Cabut semua hak pengunjung tanpa login (anon)
revoke all on public.ftq, public.scar, public.redtag, public.qc_roles from anon;

-- 3) Akun login: hanya boleh baca dan tambah (tidak ada update/delete/truncate)
revoke all on public.ftq, public.scar, public.redtag from authenticated;
grant select, insert on public.ftq, public.scar, public.redtag to authenticated;
revoke all on public.qc_roles from authenticated;
grant select on public.qc_roles to authenticated;

-- 4) Aturan baris (RLS): baca hanya untuk akun yang punya role; tambah hanya admin & input
do $$
declare t text;
begin
  foreach t in array array['ftq','scar','redtag'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('drop policy if exists "semua boleh baca" on public.%I', t);
    execute format('drop policy if exists "akun terdaftar boleh baca" on public.%I', t);
    execute format('create policy "akun terdaftar boleh baca" on public.%I for select to authenticated using (public.my_role() is not null)', t);
    execute format('drop policy if exists "admin dan input boleh tambah" on public.%I', t);
    execute format('create policy "admin dan input boleh tambah" on public.%I for insert to authenticated with check (public.my_role() in (''admin'',''input''))', t);
  end loop;
end $$;

-- 5) Fungsi pengecek role hanya untuk akun yang login
revoke execute on function public.my_role() from public, anon;
grant execute on function public.my_role() to authenticated;

notify pgrst, 'reload schema';

-- ------------------------------------------------------------
-- PEMERIKSAAN (jalankan terpisah bila mau melihat hasilnya):
--   select tablename, policyname, cmd, roles from pg_policies where schemaname='public' order by 1,3;
--   select grantee, table_name, privilege_type from information_schema.role_table_grants
--     where table_schema='public' and table_name in ('ftq','scar','redtag','qc_roles') order by 2,1;
-- Yang diharapkan: tidak ada baris untuk grantee "anon"; authenticated hanya SELECT (+INSERT di 3 tabel data).
-- ------------------------------------------------------------
