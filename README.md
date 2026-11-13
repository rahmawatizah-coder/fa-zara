# Dashboard Quality Control (FTQ · SCAR · Red Tag)

Aplikasi web statis (HTML/CSS/JS) dengan data bersama di **Supabase**.

## Pengaturan awal (sekali saja)

1. Buat project di supabase.com.
2. **SQL Editor** → jalankan berurutan: `supabase/1-setup.sql`.
3. **Authentication → Users → Add user** (centang *Auto Confirm User*):
   `admin@qc-demo.com`, `operator@qc-demo.com`, `supervisor@qc-demo.com`.
4. **SQL Editor** → jalankan `supabase/2-roles.sql`.
5. (Opsional) jalankan `supabase/3-sample-data.sql` untuk data contoh.
6. **Settings → API Keys** → salin *Project URL* dan *Publishable key* ke `css/js/config.js`
   (`SUPABASE_URL`, `SUPABASE_KEY`). Jangan pernah memakai *secret key* di sini.

## Menjalankan di komputer

Di VS Code klik kanan `index.html` → **Open with Live Server**.

## Hak akses

| Role | Data Input | Dashboard | Excel |
|---|---|---|---|
| Admin, Input User | ya | ya | ya |
| Supervisor | tidak | ya | ya |
| Other | tidak | ya | tidak |

Pembatasan *input* dijaga di database (RLS). Pembatasan Excel hanya di tampilan.
