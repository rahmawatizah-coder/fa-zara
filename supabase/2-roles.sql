-- ============================================================
-- 2-roles.sql — jalankan KEDUA, SETELAH akun dibuat di
-- Authentication -> Users -> Add user -> Create new user (centang "Auto Confirm User"):
--   admin@qc-demo.com
--   maintenance@qc-demo.com   <- akun "Engineering Maintenance"
--   supervisor@qc-demo.com
--   other@qc-demo.com         <- password bersama untuk role Other
-- Password diatur di Supabase (jangan ditulis di file ini / GitHub).
-- ============================================================

insert into public.qc_roles (id, role)
select id, case email
  when 'admin@qc-demo.com'       then 'admin'
  when 'maintenance@qc-demo.com' then 'input'
  when 'supervisor@qc-demo.com'  then 'supervisor'
  when 'other@qc-demo.com'       then 'other' end
from auth.users
where email in ('admin@qc-demo.com','maintenance@qc-demo.com','supervisor@qc-demo.com','other@qc-demo.com')
on conflict (id) do update set role = excluded.role;