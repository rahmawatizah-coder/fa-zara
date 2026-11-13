-- ============================================================
-- 12-redtag-remarks-terbaru.sql — "Red Tag Terbaru" = data lama yang DIEDIT (REMARKS / QTY), tampil 2 hari
-- Jalankan di Supabase: SQL Editor -> New query -> tempel semua -> Run. Aman diulang.
--
-- Kolom remarks_updated_at:
--   * Upload Excel / data lama  -> KOSONG (tidak masuk Red Tag Terbaru)
--   * Edit data: REMARKS atau QTY berubah -> diisi waktu sekarang (oleh trigger di bawah)
--   * Edit kolom lain (tanggal dst) -> tidak berubah
-- ============================================================
alter table public.redtag add column if not exists remarks_updated_at timestamptz;
alter table public.redtag alter column remarks_updated_at drop default;

create or replace function public.redtag_touch_remarks() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    if new.remarks is distinct from old.remarks or new.qty is distinct from old.qty then
      new.remarks_updated_at := now();
    else
      new.remarks_updated_at := old.remarks_updated_at;   -- edit kolom lain tidak mengubah apa pun
    end if;
  end if;                                                 -- INSERT: pakai nilai kiriman aplikasi (Excel = kosong)
  return new;
end $$;

drop trigger if exists redtag_touch_remarks on public.redtag;
create trigger redtag_touch_remarks before insert or update on public.redtag
  for each row execute function public.redtag_touch_remarks();

notify pgrst, 'reload schema';

-- ------------------------------------------------------------
-- SEKALI SAJA (opsional, JANGAN dijalankan ulang): kosongkan Red Tag Terbaru untuk semua data yang sudah ada,
-- supaya tabel mulai kosong dan terisi hanya oleh update berikutnya. Hapus tanda -- di 3 baris berikut lalu Run.
-- ------------------------------------------------------------
-- alter table public.redtag disable trigger redtag_touch_remarks;
-- update public.redtag set remarks_updated_at = null;
-- alter table public.redtag enable trigger redtag_touch_remarks;
