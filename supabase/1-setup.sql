-- ============================================================
-- 1-setup.sql  — jalankan PERTAMA di Supabase: SQL Editor -> New query -> Run
-- Membuat tabel + aturan akses (RLS)
-- ============================================================

-- Profil role (admin / input / supervisor)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','input','supervisor'))
);
alter table public.profiles enable row level security;
drop policy if exists "baca profil sendiri" on public.profiles;
create policy "baca profil sendiri" on public.profiles
  for select to authenticated using (auth.uid() = id);

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as
$$ select role from public.profiles where id = auth.uid() $$;

-- Tabel FTQ
create table if not exists public.ftq (
  id bigint generated always as identity primary key,
  date date not null,
  model text not null, family text not null, pn text not null, shift text not null,
  problem text not null, description text not null, area text not null,
  qty integer not null default 1,
  root text default '', action text default '', owner text default '',
  created_at timestamptz default now()
);

-- Tabel SCAR
create table if not exists public.scar (
  id bigint generated always as identity primary key,
  "no" text not null unique,
  date date not null,
  supplier text not null, pn text not null, description text not null,
  qty integer not null default 1,
  severity text not null, root text default '', action text default '', pic text default '',
  due date not null, status text not null,
  created_at timestamptz default now()
);

-- Tabel Red Tag
create table if not exists public.redtag (
  id bigint generated always as identity primary key,
  "no" text not null unique,
  date date not null,
  pn text not null, area text not null, reason text not null,
  qty integer not null default 1,
  disposition text not null, "by" text default '', status text not null, remarks text default '',
  created_at timestamptz default now()
);

-- Hak akses: semua boleh baca, hanya admin & input yang boleh tambah
grant select on public.ftq, public.scar, public.redtag to anon, authenticated;
grant insert on public.ftq, public.scar, public.redtag to authenticated;
grant select on public.profiles to authenticated;

do $$
declare t text;
begin
  foreach t in array array['ftq','scar','redtag'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "semua boleh baca" on public.%I', t);
    execute format('create policy "semua boleh baca" on public.%I for select to anon, authenticated using (true)', t);
    execute format('drop policy if exists "admin dan input boleh tambah" on public.%I', t);
    execute format('create policy "admin dan input boleh tambah" on public.%I for insert to authenticated with check (public.my_role() in (''admin'',''input''))', t);
  end loop;
end $$;
