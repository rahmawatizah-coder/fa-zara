-- ============================================================
-- 14-master-part.sql — Master Part Number Red Tag + kolom Harness Name
-- Jalankan di Supabase: SQL Editor -> New query -> tempel semua -> Run. Aman diulang.
-- Form Input Red Tag: ketik Part Number (EEP / CPN) -> Versigent Part Number (APN), Model (Project),
-- Family, dan Harness Name (Description) terisi otomatis dari master.
-- Isi master lewat tombol "Import Master" di halaman Input Red Tag (Engineering / Admin).
-- ============================================================

-- 1) Kolom baru di tabel Red Tag
alter table public.redtag add column if not exists harness text default '';

-- 2) Tabel master
create table if not exists public.master_part (
  id          bigint generated always as identity primary key,
  pn_key      text not null unique,           -- CPN / EEP dinormalkan (huruf kecil, spasi rapi) untuk pencocokan
  pn          text not null,                  -- CPN / EEP
  apn         text default '',                -- Versigent Part Number
  model       text default '',                -- PROJECT
  family      text default '',                -- dari VSM (BD=Body, IP=IP, ENG=Engine, SML=Small, HV=HV, BAT PACK=Baterai PDU)
  description text default '',                -- Harness Name
  status      text default '',                -- ACTIVE / INACTIVE
  updated_at  timestamptz default now()
);
alter table public.master_part add column if not exists apn text default '';
alter table public.master_part add column if not exists description text default '';
alter table public.master_part add column if not exists status text default '';

alter table public.master_part enable row level security;
alter table public.master_part force row level security;
revoke all on public.master_part from anon;
revoke all on public.master_part from authenticated;
grant select, insert, update, delete on public.master_part to authenticated;

drop policy if exists "akun terdaftar boleh baca master" on public.master_part;
create policy "akun terdaftar boleh baca master" on public.master_part for select to authenticated using (public.my_role() is not null);
drop policy if exists "admin dan input boleh tambah master" on public.master_part;
create policy "admin dan input boleh tambah master" on public.master_part for insert to authenticated with check (public.my_role() in ('admin','input'));
drop policy if exists "admin dan input boleh ubah master" on public.master_part;
create policy "admin dan input boleh ubah master" on public.master_part for update to authenticated using (public.my_role() in ('admin','input')) with check (public.my_role() in ('admin','input'));
drop policy if exists "hanya engineering boleh hapus master" on public.master_part;
create policy "hanya engineering boleh hapus master" on public.master_part for delete to authenticated using (public.my_role() = 'input');

notify pgrst, 'reload schema';
