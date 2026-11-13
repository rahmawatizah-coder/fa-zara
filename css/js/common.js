/* common.js — sesi login, data (Supabase), komponen UI, export Excel, halaman Login & Menu
   Wajib dimuat SETELAH config.js */

/* ---------- HELPER ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};
const sortRows = rows => rows.map((r, i) => [r, i])
  .sort((a, b) => (b[0].date || '').localeCompare(a[0].date || '') || b[1] - a[1])
  .map(x => x[0]);

/* ---------- REFRESH BROWSER = KEMBALI KE LOGIN ----------
   Bila halaman dimuat ulang (F5 / Ctrl+R / tombol reload), sesi login dihapus
   sehingga pengguna kembali ke menu login. Pindah halaman lewat tombol/tautan tidak terpengaruh. */
(function () {
  try {
    const nav = performance.getEntriesByType('navigation')[0];
    if (nav && nav.type === 'reload' && sessionStorage.getItem('ftq_user')) {
      sessionStorage.removeItem('ftq_user');
      Object.keys(localStorage).filter(k => k.indexOf('sb-') === 0).forEach(k => localStorage.removeItem(k));
    }
  } catch (e) { /* abaikan */ }
})();

/* ---------- SUPABASE ---------- */
const sb = (window.supabase && !SUPABASE_URL.includes('ISI_'))
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;

/* ---------- SESI LOGIN (info tampilan; autentikasi asli di Supabase) ---------- */
const getUser   = () => { try { return JSON.parse(sessionStorage.getItem('ftq_user')); } catch (e) { return null; } };
const setUser   = u  => sessionStorage.setItem('ftq_user', JSON.stringify(u));
const clearUser = () => sessionStorage.removeItem('ftq_user');

function requireLogin() {
  const u = getUser();
  if (!u) { location.replace(PAGE_LOGIN); return null; }
  return u;
}
async function logout() {
  clearUser();
  try { if (sb) await sb.auth.signOut(); } catch (e) {}
  location.href = PAGE_LOGIN;
}

/* Ambil modul dari <body data-module="..."> (boleh isi key: ftq/scar/rt atau slug: redtag) */
function resolveModule() {
  const key = document.body.dataset.module;
  const mod = MODULES[key] ? key : Object.keys(MODULES).find(k => MODULES[k].slug === key);
  if (!mod) {
    $('#app').innerHTML = '<div style="padding:40px"><h2>Modul tidak ditemukan</h2>' +
      '<p style="color:var(--muted);margin-top:8px">Atribut data-module di &lt;body&gt; berisi "' + esc(key) +
      '". Isi yang benar: ftq, scar, atau rt.</p></div>';
    return null;
  }
  return mod;
}

/* ---------- TOAST ---------- */
function toast(msg, bad) {
  const t = $('#toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'toast show' + (bad ? ' bad' : '');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.className = 'toast', 3200);
}

/* ---------- DATA (Supabase) ---------- */
// Kolom "desc" di aplikasi = kolom "description" di database
const toDb = r => { const o = { ...r }; Object.keys(o).forEach(k => { if (k[0] === '_') delete o[k]; });
  ['due', 'proddate'].forEach(k => { if (k in o && (o[k] === '' || o[k] == null)) o[k] = null; });   // kolom tanggal opsional: kosong = NULL
  if ('desc' in o) { o.description = o.desc; delete o.desc; } return o; };
const fromDb = r => {
  const o = { ...r };
  if ('description' in o) { o.desc = o.description; delete o.description; }
  o._id = r.id;                       // id baris, hanya untuk fitur Hapus (tidak ditampilkan / tidak diexport)
  o._ru = r.remarks_updated_at || null;   // waktu REMARKS terakhir diubah (khusus Red Tag)
delete o.remarks_updated_at;
delete o.id; delete o.created_at;
  return o;
};
function dbReady() {
  if (!sb) {
    toast('Supabase belum siap: isi SUPABASE_URL & SUPABASE_KEY di config.js dan pastikan baris <script> Supabase ada.', true);
    return false;
  }
  return true;
}

// Ambil semua data modul (urut lama -> baru), otomatis halaman per 1000 baris
async function loadData(mod) {
  if (!dbReady()) return [];
  const table = MODULES[mod].slug, size = 1000, out = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await sb.from(table).select('*')
      .order('date', { ascending: true }).order('id', { ascending: true })
      .range(from, from + size - 1);
    if (error) { console.error(error); toast('Gagal memuat data: ' + error.message, true); return out.map(fromDb); }
    out.push(...data);
    if (data.length < size) break;
  }
    const rows = out.map(fromDb);
  if (mod === 'ftq') rows.forEach(r => { if (!String(r.serial ?? '').trim()) r.serial = 'N/A'; });
  return rows;
}
// Ambil n data terbaru (untuk "Recent Entries")
async function loadRecent(mod, n) {
  if (!dbReady()) return [];
  // Urut berdasarkan waktu data MASUK (input maupun impor), bukan tanggal kejadian
  let { data, error } = await sb.from(MODULES[mod].slug).select('*')
    .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(n);
  if (error && /created_at/i.test(error.message || '')) {      // tabel tanpa kolom created_at: urut berdasarkan id
    ({ data, error } = await sb.from(MODULES[mod].slug).select('*').order('id', { ascending: false }).limit(n));
  }
  if (error) { console.error(error); toast('Gagal memuat data: ' + error.message, true); return []; }
  return data.map(fromDb);
}
// Simpan 1 baris. Mengembalikan error (atau null bila sukses)
async function insertRow(mod, rec) {
  if (!dbReady()) return { message: 'Supabase belum siap' };
  const payload = mod === 'rt' ? { ...toDb(rec), remarks_updated_at: new Date().toISOString() } : toDb(rec);
let { error } = await sb.from(MODULES[mod].slug).insert(payload);
if (error && mod === 'rt' && /remarks_updated_at/i.test(error.message || '')) {   // SQL 12 belum dijalankan: simpan tanpa kolom itu
  ({ error } = await sb.from(MODULES[mod].slug).insert(toDb(rec)));
}
return error || null;
}
// Nomor berikutnya (SCAR-008, RT-009, ...)
async function nextNo(mod) {
  const cfg = MODULES[mod];
  if (!cfg.prefix || !dbReady()) return '';
  const { data } = await sb.from(cfg.slug).select(cfg.idKey).order('id', { ascending: false }).limit(50);
  const max = (data || []).reduce((m, r) => Math.max(m, parseInt(String(r[cfg.idKey]).replace(/\D/g, '')) || 0), 0);
  return cfg.prefix + String(max + 1).padStart(3, '0');
}

/* ---------- KOMPONEN UI ---------- */
/* Logo: file di folder utama (LOGO_FILE di config.js). Bila file tidak ada, dipakai gambar bawaan di bawah. */
const LOGO_LIST = [...new Set([(typeof LOGO_FILE !== 'undefined' && LOGO_FILE) || '', 'assets/logo.png', 'assets/Logo.png', 'assets/logo.PNG', 'assets/logo.jpg', 'assets/logo.svg', 'logo.png', 'logo.svg'].filter(Boolean))];
const LOGO_FALLBACK = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M48 4 84 18v26c0 22-15 38-36 48C27 82 12 66 12 44V18Z" fill="#ffffff" stroke="#CD7925" stroke-width="5" stroke-linejoin="round"/><path d="M30 50 43 63 68 34" fill="none" stroke="#5BB8F0" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/></svg>');
// Bila file logo tidak ditemukan, otomatis coba nama berikutnya di LOGO_LIST (terakhir: logo bawaan)
function logoNext(img) {
  const i = (+img.dataset.i || 0) + 1;
  img.dataset.i = i;
  img.src = i < LOGO_LIST.length ? LOGO_LIST[i] : LOGO_FALLBACK;
  if (i >= LOGO_LIST.length) img.onerror = null;
}
const LOGO_SRC = LOGO_LIST[0];
const shieldSVG = `<img src="${LOGO_SRC}" data-i="0" alt="Logo" onerror="logoNext(this)">`;
(function () {
  try {
    const st = document.createElement('style');
    st.textContent = '.shield{border:0!important;border-radius:0!important;width:auto!important;height:64px!important}.brand .logo{border:0!important;width:auto!important;height:42px!important;padding:5px 12px!important;box-sizing:border-box}' +
    '.shield img,.brand .logo img{width:auto;height:100%;max-width:100%;object-fit:contain;display:block}';
    document.head.appendChild(st);
    let l = document.querySelector('link[rel~="icon"]');
    if (!l) { l = document.createElement('link'); l.rel = 'icon'; document.head.appendChild(l); }
    const probe = i => {                       // ikon tab: pakai file logo pertama yang benar-benar ada
      if (i >= LOGO_LIST.length) return;
      const im = new Image();
      im.onload = () => { l.href = LOGO_LIST[i]; };
      im.onerror = () => probe(i + 1);
      im.src = LOGO_LIST[i];
    };
    probe(0);
  } catch (e) { /* abaikan */ }
})();

function topbar(crumb, navBtn) {
  const u = getUser();
  const words = String(u.name || '').trim().split(/\s+/).filter(Boolean);
  const ini = (words.length > 1 ? words[0][0] + words[1][0] : (words[0] || '??').replace(/[^A-Za-z0-9]/g, '').slice(0, 2)).toUpperCase() || '??';
  return `<div class="topbar">
    <div class="brand" data-href="${PAGE_MENU}" title="Kembali ke menu"><div class="logo">${shieldSVG}</div>
      <div><div class="t1">FTQ Quality System${crumb ? `<span class="slash">/</span><span class="crumb">${esc(crumb)}</span>` : ''}</div>
      <div class="t2">QUALITY CONTROL FINAL ASSEMBLY</div></div></div>
    <div class="right">
      ${crumb ? `<button class="btn" data-href="${PAGE_MENU}">← Menu</button>` : ''}
      ${navBtn ? `<button class="btn" data-href="${navBtn.href}">${navBtn.label}</button>` : ''}
      <div class="user"><div class="avatar">${esc(ini)}</div>
        <div><div class="n">${esc(u.name)}</div><div class="r">${ROLE_LABEL[u.role]}</div></div></div>
      <button class="btn" id="btn-logout">Logout</button>
    </div></div>`;
}
function bindCommon() {
  document.querySelectorAll('[data-href]').forEach(el => el.addEventListener('click', () => { location.href = el.dataset.href; }));
  const lo = $('#btn-logout');
  if (lo) lo.addEventListener('click', logout);
}

function badge(v) {
  const c = 'b-' + String(v).toLowerCase().replace(/\s+/g, '');
  return `<span class="badge ${c}">${esc(v)}</span>`;
}
function renderTable(cfg, rows, opts) {
  opts = opts || {};
  const sel = opts.select && rows.some(r => r._id != null);
  const del = opts.del && rows.some(r => r._id != null);
  const edt = opts.edit && rows.some(r => r._id != null);
  const th = (sel ? '<th style="width:36px"><input type="checkbox" data-sel-all title="Pilih semua baris yang tampil"></th>' : '') +
    cfg.cols.map(c => `<th>${c.l}</th>`).join('') + (del || edt ? '<th>Aksi</th>' : '');
  const body = rows.map(r => '<tr>' + (sel ? `<td><input type="checkbox" data-sel="${esc(r._id)}"></td>` : '') + cfg.cols.map(c => {
    const v = r[c.k];
    if (c.t === 'badge') return `<td>${badge(v)}</td>`;
    if (c.t === 'date' || c.t === 'num') return `<td class="mono">${esc(v)}</td>`;
    return `<td>${esc(v)}</td>`;
  }).join('') + (del || edt ? `<td style="white-space:nowrap">${edt ? `<button type="button" class="btn" style="padding:4px 10px;margin-right:6px" data-edit="${esc(r._id)}">Edit</button>` : ''}${del ? `<button type="button" class="btn danger" style="padding:4px 10px" data-del="${esc(r._id)}">Hapus</button>` : ''}</td>` : '') + '</tr>').join('');
  const ncol = cfg.cols.length + (sel ? 1 : 0) + (del || edt ? 1 : 0);
  const empty = `<tr><td colspan="${ncol}" class="empty" style="text-align:center;padding:24px">Tidak ada data</td></tr>`;
  return `<div class="tbl-scroll"><table><thead><tr>${th}</tr></thead><tbody>${body || empty}</tbody></table></div>`;
}

/* ---------- HAPUS DATA (hanya Admin & Engineering) ----------
   Ini satu-satunya tempat di aplikasi yang menghapus baris di database Supabase.
   Izin sebenarnya dijaga database (RLS: policy "admin dan input boleh hapus"),
   pengecekan role di sini hanya lapis tambahan. */
const canDelete = () => { const u = getUser(); return !!u && (u.role === 'admin' || u.role === 'input'); };

// Hapus baris berdasarkan id. Mengembalikan { deleted, error }.
async function deleteRows(mod, ids) {
  if (!canDelete()) return { deleted: 0, error: { message: 'Role Anda tidak punya izin menghapus data.' } };
  if (!dbReady()) return { deleted: 0, error: { message: 'Supabase belum siap' } };
  const list = [...new Set(ids.filter(i => i != null))];
  let deleted = 0;
  for (let i = 0; i < list.length; i += 100) {
    const { data, error } = await sb.from(MODULES[mod].slug).delete().in('id', list.slice(i, i + 100)).select('id');
    if (error) return { deleted, error };
    deleted += (data || []).length;
  }
  // RLS yang menolak tidak memberi error, hanya 0 baris terhapus -> kabari pengguna
  if (deleted < list.length) {
    return { deleted, error: { message: deleted ? 'Sebagian baris tidak terhapus (' + deleted + ' dari ' + list.length + ').' : 'Tidak ada baris yang terhapus. Anda tidak punya izin, atau sesi login habis — login ulang.' } };
  }
  return { deleted, error: null };
}

// Dialog konfirmasi hapus. Mengembalikan Promise<boolean>.
function confirmDelete(mod, rows) {
  const canEdit = canDelete;   // Admin & Engineering

async function updateRow(mod, id, rec) {
  if (!canEdit()) return { message: 'Role Anda tidak punya izin mengubah data.' };
  if (!dbReady()) return { message: 'Supabase belum siap' };
  const { data, error } = await sb.from(MODULES[mod].slug).update(toDb(rec)).eq('id', id).select('id');
  if (error) {
    if (error.code === '23505') return { message: 'Nomor sudah dipakai data lain. Ganti nomornya.' };
    return error;
  }
  if (!data || !data.length) return { message: 'Perubahan ditolak. Anda tidak punya izin, sesi login habis, atau 9-edit-data.sql belum dijalankan di Supabase.' };
  return null;
}

function editRow(mod, row) {
  const cfg = MODULES[mod];
  if (!document.getElementById('ed-style')) {
    const st = document.createElement('style'); st.id = 'ed-style';
    st.textContent = `.ed-ov{position:fixed;inset:0;background:rgba(17,24,39,.45);z-index:80;display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:30px 16px}
      .ed-box{width:min(920px,100%);background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:24px 28px}
      .ed-box h3{font-size:18px;margin-bottom:4px}.ed-box .ed-sub{color:var(--muted);font-size:13px;margin-bottom:16px}
      .ed-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
      .ed-grid label{display:block;font-size:11px;letter-spacing:.8px;color:var(--muted);text-transform:uppercase;margin-bottom:5px}
      .ed-grid label i{color:#dc2626}
      .ed-warn{background:#fff7e0;border:1px solid #f3cf7a;color:#7a5a00;border-radius:8px;padding:10px 14px;font-size:13px;margin:16px 0}
      .ed-act{display:flex;gap:10px;justify-content:flex-end}
      @media(max-width:760px){.ed-grid{grid-template-columns:1fr}}`;
    document.head.appendChild(st);
  }
  const fld = f => {
    const cur = row[f.k] ?? '';
    let inp;
    if (f.type === 'select') {
      const opts = f.opts.includes(cur) || cur === '' ? f.opts : [cur].concat(f.opts);
      if (f.other) {   // nilai di luar daftar (mis. hasil impor / tulis manual) tampil sebagai Others + teksnya
        const isOth = (cur !== '' && !f.opts.includes(cur)) || cur === f.other;
        const shown = isOth ? f.other : cur;
        inp = `<select class="inp" name="${f.k}"><option value="">Pilih...</option>${f.opts.map(o => `<option ${o === shown ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>` +
          `<input class="inp" name="${f.k}__other" type="text" placeholder="Tulis nama ${esc(f.label)}..." value="${esc(isOth && cur !== f.other ? cur : '')}" style="margin-top:8px;${isOth ? '' : 'display:none'}">`;
      } else
      inp = `<select class="inp" name="${f.k}"><option value="">Pilih...</option>${opts.map(o => `<option ${o === cur ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
    } else {
      inp = `<input class="inp" name="${f.k}" type="${f.type}" ${f.type === 'number' ? 'min="0" step="1"' : ''} value="${esc(cur)}">`;
    }
    return `<div><label>${f.label}${f.req ? ' <i>*</i>' : ''}</label>${inp}</div>`;
  };
  return new Promise(resolve => {
    const ov = document.createElement('div');
    ov.className = 'ed-ov';
    ov.innerHTML = `<form class="ed-box" role="dialog" aria-modal="true" novalidate>
      <h3>Edit Data ${esc(cfg.name)}</h3><div class="ed-sub">Ubah isian lalu simpan. Perubahan langsung tersimpan di database Supabase.</div>
      <div class="ed-grid">${cfg.fields.map(fld).join('')}</div>
      <div class="ed-warn"><b>Perhatian:</b> data lama akan <b>diganti</b> dengan isian baru di database.</div>
      <div class="ed-act"><button type="button" class="btn" data-ed="no">Batal</button><button type="submit" class="btn accent" data-ed="yes">Simpan Perubahan</button></div></form>`;
    const done = v => { ov.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = e => { if (e.key === 'Escape') done(false); };
    document.addEventListener('keydown', onKey);
    ov.addEventListener('mousedown', e => { if (e.target === ov) done(false); });
    ov.querySelector('[data-ed="no"]').addEventListener('click', () => done(false));
    const form = ov.querySelector('form');
    cfg.fields.filter(f => f.other).forEach(f => form.elements[f.k].addEventListener('change', () => {
      const o = form.elements[f.k + '__other'], on = form.elements[f.k].value === f.other;
      o.style.display = on ? '' : 'none'; if (!on) o.value = '';
    }));
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const rec = {}; let bad = null;
      cfg.fields.forEach(f => {
        const el = form.elements[f.k]; el.style.borderColor = '';
        let v = el.value.trim();
        if (f.other && v === f.other) {
          const o = form.elements[f.k + '__other']; o.style.borderColor = ''; v = o.value.trim();
          if (!v) { o.style.borderColor = 'var(--red)'; bad = bad || o; }
        }
        if (f.req && !v) { el.style.borderColor = 'var(--red)'; bad = bad || el; }
        rec[f.k] = f.type === 'number' ? (Number(v) || 0) : v;
      });
      if (bad) { toast('Lengkapi semua field yang wajib diisi (*)', true); bad.focus(); return; }
      const btn = form.querySelector('[data-ed="yes"]'); btn.disabled = true; btn.textContent = 'Menyimpan…';
      const err = await updateRow(mod, row._id, rec);
      if (err) { toast(err.message, true); btn.disabled = false; btn.textContent = 'Simpan Perubahan'; return; }
      toast('Perubahan ' + cfg.name + ' tersimpan ✔');
      done(true);
    });
    document.body.appendChild(ov);
    form.querySelector('input,select').focus();
  });
}
  const cfg = MODULES[mod];
  if (!document.getElementById('dx-style')) {
    const st = document.createElement('style'); st.id = 'dx-style';
    st.textContent = `.dx-ov{position:fixed;inset:0;background:rgba(17,24,39,.45);z-index:70;display:flex;align-items:center;justify-content:center;padding:16px}
      .dx-box{width:min(520px,100%);background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:26px 28px;max-height:90vh;overflow:auto}
      .dx-box h3{font-size:18px;margin-bottom:14px}
      .dx-box dl{display:grid;grid-template-columns:auto 1fr;gap:8px 16px;margin-bottom:14px;font-size:14px}
      .dx-box dt{color:var(--muted)}.dx-box dd{font-weight:700}
      .dx-list{background:#fafafa;border:1px solid var(--line);border-radius:8px;padding:10px 14px;font-size:12.5px;color:var(--muted);margin-bottom:14px;line-height:1.7;max-height:140px;overflow:auto}
      .dx-warn{background:#fef2f2;border:1px solid #fca5a5;color:#b91c1c;border-radius:8px;padding:11px 14px;font-size:13px;line-height:1.5;margin-bottom:18px}
      .dx-act{display:flex;gap:10px;justify-content:flex-end}`;
    document.head.appendChild(st);
  }
  const brief = r => cfg.cols.slice(0, 4).map(c => esc(r[c.k] ?? '')).join(' · ');
  const items = rows.slice(0, 8).map(r => '<div>' + brief(r) + '</div>').join('') + (rows.length > 8 ? `<div>… dan ${rows.length - 8} baris lainnya</div>` : '');
  return new Promise(resolve => {
    const ov = document.createElement('div');
    ov.className = 'dx-ov';
    ov.innerHTML = `<div class="dx-box" role="dialog" aria-modal="true"><h3>Hapus Data ${esc(cfg.name)}</h3>
      <dl><dt>Dashboard / tabel</dt><dd>${esc(cfg.name)} (${esc(cfg.slug)})</dd><dt>Jumlah data dihapus</dt><dd>${rows.length.toLocaleString('id-ID')} baris</dd></dl>
      <div class="dx-list">${items}</div>
      <div class="dx-warn"><b>Perhatian:</b> data dihapus <b>permanen dari database Supabase</b> dan tidak bisa dikembalikan.
        Kalau hanya ingin mengosongkan tampilan, gunakan tombol Clear Data.</div>
      <div class="dx-act"><button type="button" class="btn" data-dx="no">Batal</button><button type="button" class="btn danger" data-dx="yes">Ya, hapus permanen</button></div></div>`;
    const done = v => { ov.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = e => { if (e.key === 'Escape') done(false); };
    document.addEventListener('keydown', onKey);
    ov.addEventListener('mousedown', e => { if (e.target === ov) done(false); });
    ov.querySelector('[data-dx="no"]').addEventListener('click', () => done(false));
    ov.querySelector('[data-dx="yes"]').addEventListener('click', () => done(true));
    document.body.appendChild(ov);
    ov.querySelector('[data-dx="no"]').focus();
  });
}

/* ---------- EDIT DATA (hanya Admin & Engineering) ----------
   Izin sebenarnya dijaga database (RLS: policy "admin dan input boleh ubah", lihat supabase/9-edit-data.sql). */
const canEdit = canDelete;

async function updateRow(mod, id, rec) {
  if (!canEdit()) return { message: 'Role Anda tidak punya izin mengubah data.' };
  if (!dbReady()) return { message: 'Supabase belum siap' };
  const { data, error } = await sb.from(MODULES[mod].slug).update(toDb(rec)).eq('id', id).select('id');
  if (error) {
    if (error.code === '23505') return { message: 'Nomor sudah dipakai data lain. Ganti nomornya.' };
    return error;
  }
  if (!data || !data.length) return { message: 'Perubahan ditolak. Anda tidak punya izin, sesi login habis (login ulang), atau 9-edit-data.sql belum dijalankan di Supabase.' };
  return null;
}

// Dialog edit. Mengembalikan Promise<boolean> (true = tersimpan di database).
function editRow(mod, row) {
  const cfg = MODULES[mod];
  if (!document.getElementById('ed-style')) {
    const st = document.createElement('style'); st.id = 'ed-style';
    st.textContent = `.ed-ov{position:fixed;inset:0;background:rgba(17,24,39,.45);z-index:80;display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:30px 16px}
      .ed-box{width:min(920px,100%);background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:24px 28px}
      .ed-box h3{font-size:18px;margin-bottom:4px}.ed-box .ed-sub{color:var(--muted);font-size:13px;margin-bottom:16px}
      .ed-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
      .ed-grid label{display:block;font-size:11px;letter-spacing:.8px;color:var(--muted);text-transform:uppercase;margin-bottom:5px}
      .ed-grid label i{color:#dc2626}
      .ed-warn{background:#fff7e0;border:1px solid #f3cf7a;color:#7a5a00;border-radius:8px;padding:10px 14px;font-size:13px;margin:16px 0}
      .ed-act{display:flex;gap:10px;justify-content:flex-end}
      @media(max-width:760px){.ed-grid{grid-template-columns:1fr}}`;
    document.head.appendChild(st);
  }
  const fld = f => {
    const cur = row[f.k] ?? '';
    let inp;
    if (f.type === 'select') {
      const opts = f.opts.includes(cur) || cur === '' ? f.opts : [cur].concat(f.opts);
      if (f.other) {   // nilai di luar daftar (mis. hasil impor / tulis manual) tampil sebagai Others + teksnya
        const isOth = (cur !== '' && !f.opts.includes(cur)) || cur === f.other;
        const shown = isOth ? f.other : cur;
        inp = `<select class="inp" name="${f.k}"><option value="">Pilih...</option>${f.opts.map(o => `<option ${o === shown ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>` +
          `<input class="inp" name="${f.k}__other" type="text" placeholder="Tulis nama ${esc(f.label)}..." value="${esc(isOth && cur !== f.other ? cur : '')}" style="margin-top:8px;${isOth ? '' : 'display:none'}">`;
      } else
      inp = `<select class="inp" name="${f.k}"><option value="">Pilih...</option>${opts.map(o => `<option ${o === cur ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
    } else {
      inp = `<input class="inp" name="${f.k}" type="${f.type}" ${f.type === 'number' ? 'min="0" step="1"' : ''} value="${esc(cur)}">`;
    }
    return `<div><label>${f.label}${f.req ? ' <i>*</i>' : ''}</label>${inp}</div>`;
  };
  return new Promise(resolve => {
    const ov = document.createElement('div');
    ov.className = 'ed-ov';
    ov.innerHTML = `<form class="ed-box" role="dialog" aria-modal="true" novalidate>
      <h3>Edit Data ${esc(cfg.name)}</h3><div class="ed-sub">Ubah isian lalu simpan. Perubahan langsung tersimpan di database Supabase.</div>
      <div class="ed-grid">${cfg.fields.map(fld).join('')}</div>
      <div class="ed-warn"><b>Perhatian:</b> data lama akan <b>diganti</b> dengan isian baru di database dan tidak ada riwayat perubahan.</div>
      <div class="ed-act"><button type="button" class="btn" data-ed="no">Batal</button><button type="submit" class="btn accent" data-ed="yes">Simpan Perubahan</button></div></form>`;
    const done = v => { ov.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = e => { if (e.key === 'Escape') done(false); };
    document.addEventListener('keydown', onKey);
    ov.addEventListener('mousedown', e => { if (e.target === ov) done(false); });
    ov.querySelector('[data-ed="no"]').addEventListener('click', () => done(false));
    const form = ov.querySelector('form');
    cfg.fields.filter(f => f.other).forEach(f => form.elements[f.k].addEventListener('change', () => {
      const o = form.elements[f.k + '__other'], on = form.elements[f.k].value === f.other;
      o.style.display = on ? '' : 'none'; if (!on) o.value = '';
    }));
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const rec = {}; let bad = null;
      cfg.fields.forEach(f => {
        const el = form.elements[f.k]; el.style.borderColor = '';
        let v = el.value.trim();
        if (f.other && v === f.other) {
          const o = form.elements[f.k + '__other']; o.style.borderColor = ''; v = o.value.trim();
          if (!v) { o.style.borderColor = 'var(--red)'; bad = bad || o; }
        }
        if (f.req && !v) { el.style.borderColor = 'var(--red)'; bad = bad || el; }
        rec[f.k] = f.type === 'number' ? (Number(v) || 0) : v;
      });
      if (bad) { toast('Lengkapi semua field yang wajib diisi (*)', true); bad.focus(); return; }
      const btn = form.querySelector('[data-ed="yes"]'); btn.disabled = true; btn.textContent = 'Menyimpan…';
      const err = await updateRow(mod, row._id, rec);
      if (err) { toast(err.message, true); btn.disabled = false; btn.textContent = 'Simpan Perubahan'; return; }
      toast('Perubahan ' + cfg.name + ' tersimpan ✔');
      done(true);
    });
    document.body.appendChild(ov);
    form.querySelector('input,select').focus();
  });
}

/* ---------- FORMAT EXCEL (dipakai Export DAN Import, supaya judul kolomnya sama) ---------- */
// FTQ memakai judul kolom file master FTQ; SCAR & Red Tag memakai label field di config.js
const XL_FTQ = [
  ['date', 'Date Occurred'], ['model', 'Model'], ['family', 'Harness Type (Main-Fam)'], ['subfamily', 'Harness Type (Sub-Fam)'], ['pn', 'P/N Harness'],
  ['shift', 'Shift'], ['posisi', 'Position'], ['problem', 'Problem Classification'], ['desc', 'Problem Description'],
  ['area', 'Area'], ['qty', 'Qty Defect'], ['root', 'Root Cause'], ['action', 'CA'], ['serial', 'No.Serial']
];
function xlColumns(mod) {
  if (mod === 'ftq') return XL_FTQ.map(([k, h]) => ({ k, h }));
  const cfg = MODULES[mod];
  return cfg.xl ? cfg.xl.map(([k, h]) => ({ k, h })) : cfg.fields.map(f => ({ k: f.k, h: f.label }));
}
// Kolom hitungan (kunci berawalan "_"): No. urut, Month & Years diambil dari tanggal. Dipakai tabel dashboard & export.
function decorate(rows) {
  rows.forEach((r, i) => {
    r._no = i + 1;
    const d = String(r.date || '');
    r._month = /^\d{4}-\d{2}/.test(d) ? MONTHS[+d.slice(5, 7) - 1] : '';
    r._year = /^\d{4}/.test(d) ? Number(d.slice(0, 4)) : '';
  });
  return rows;
}

/* ---------- EXPORT EXCEL (SheetJS; fallback CSV bila offline) ---------- */
function exportExcel(mod, rows) {
  const cfg = MODULES[mod];
  const cols = xlColumns(mod);
  const val = (c, r) => {
    let v = r[c.k] ?? '';
    if (mod === 'ftq' && c.k === 'serial' && String(v).trim() === '') v = 'N/A';
    if (mod === 'ftq' && c.k === 'shift') { const m = /^Shift\s+(\d+)$/i.exec(String(v)); if (m) v = Number(m[1]); }
    return v;
  };
  decorate(rows);
  const fname = `${cfg.name.replace(/\s+/g, '_')}_${today()}`;
  // Format berjudul (Red Tag): baris 1 judul, baris 2 "DATE : ...", baris 3 header, lalu data
  if (cfg.xlTitle) {
    const latest = rows.reduce((m, r) => (r.date > m ? r.date : m), '');
    const dtxt = latest ? Number(latest.slice(8, 10)) + ' ' + MONTHS[+latest.slice(5, 7) - 1] + ' ' + latest.slice(0, 4) : '';
    const aoa = [[cfg.xlTitle], ['DATE : ' + dtxt], cols.map(c => c.h)].concat(rows.map(r => cols.map(c => val(c, r))));
    if (window.XLSX) {
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: 6 } }];
      ws['!cols'] = [6, 20, 16, 12, 16, 13, 56, 41, 15, 14, 14].map(w => ({ wch: w }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, cfg.xlSheet || cfg.name);
      XLSX.writeFile(wb, fname + '.xlsx');
    } else {
      const csv = aoa.map(l => l.map(x => '"' + String(x).replace(/"/g, '""') + '"').join(',')).join('\n');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv' }));
      a.download = fname + '.csv';
      a.click();
      toast('Library Excel tidak termuat (offline) — file diunduh sebagai CSV', true);
    }
    return;
  }
  const data = rows.map(r => { const o = {}; cols.forEach(c => o[c.h] = val(c, r)); return o; });
  if (window.XLSX) {
    const ws = XLSX.utils.json_to_sheet(data, { header: cols.map(c => c.h) });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, cfg.name);
    XLSX.writeFile(wb, fname + '.xlsx');
  } else {
    const heads = cols.map(c => c.h);
    const csv = [heads.join(',')].concat(
      data.map(o => heads.map(h => '"' + String(o[h]).replace(/"/g, '""') + '"').join(','))
    ).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv' }));
    a.download = fname + '.csv';
    a.click();
    toast('Library Excel tidak termuat (offline) — file diunduh sebagai CSV', true);
  }
}

/* ---------- HALAMAN LOGIN (dipanggil dari index.html) ---------- */
// Email akun role Other (bisa diubah di config.js lewat ACCOUNTS.other.email)
const OTHER_EMAIL = (typeof ACCOUNTS !== 'undefined' && ACCOUNTS.other && ACCOUNTS.other.email) || 'other@qc-demo.com';

function initLogin() {
  if (getUser()) { location.replace(PAGE_MENU); return; }
  const app = $('#app');
  let role = 'admin';

  function render() {
    const acc = ACCOUNTS[role];
    app.innerHTML = `<div class="login-wrap"><div class="login-card">
      <div class="shield">${shieldSVG}</div>
      <h1>QUALITY CONTROL FA</h1><div class="sub">FTQ · SCAR · Red Tag</div>
      <div class="field"><label class="lbl">Username / ID</label>
        <input class="inp" id="lg-user" autocomplete="username" placeholder="${acc.username ? esc(acc.username) : 'Nama Anda (bebas)'}"></div>
      <div class="field"><label class="lbl">Password</label>
        <input class="inp" id="lg-pass" type="password" autocomplete="current-password" ${role === 'other' ? 'placeholder="Password role Other (dari admin)"' : ''}></div>
      <label class="lbl">System Role Access</label>
      <div class="roles">${Object.keys(ROLE_LABEL).map(r => `<button type="button" class="role ${r === role ? 'active' : ''}" data-role="${r}">${ROLE_LABEL[r]}</button>`).join('')}</div>
      <div class="err" id="lg-err"></div>
      <button class="btn-primary" id="lg-btn">SECURE LOGIN</button>
      <div class="hint">${role === 'other' ? 'Role Other: hanya dapat melihat dashboard (perlu password dari admin).' : role === 'supervisor' ? 'Supervisor: lihat dashboard & download Excel.' : 'Akses penuh: input data, dashboard, download Excel.'}</div>
    </div></div>`;

    document.querySelectorAll('.role').forEach(b => b.addEventListener('click', () => {
      const keep = $('#lg-user').value;
      role = b.dataset.role;
      render();
      $('#lg-user').value = keep;
    }));
    $('#lg-btn').addEventListener('click', doLogin);
    app.querySelectorAll('.inp').forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); }));
    $('#lg-user').focus();
  }

  async function doLogin() {
    const u = $('#lg-user').value.trim();
    const p = $('#lg-pass').value;
    const a = ACCOUNTS[role];
    const err = $('#lg-err');
    const btn = $('#lg-btn');
    err.textContent = '';

    if (!sb) { err.textContent = 'Supabase belum dikonfigurasi (cek config.js & koneksi internet).'; return; }

    // Role Other: nama bebas, tapi tetap memakai password bersama (akun other@qc-demo.com di Supabase)
    if (role === 'other') {
      if (!u) { err.textContent = 'Isi nama Anda.'; return; }
      btn.disabled = true; btn.textContent = 'MEMERIKSA...';
      const r0 = await sb.auth.signInWithPassword({ email: OTHER_EMAIL, password: p });
      if (r0.error) { err.textContent = 'Password salah.'; btn.disabled = false; btn.textContent = 'SECURE LOGIN'; return; }
      const { data: pr } = await sb.from('qc_roles').select('role').eq('id', r0.data.user.id).maybeSingle();
      if (!pr || pr.role !== 'other') {
        await sb.auth.signOut();
        err.textContent = 'Akun ini tidak terdaftar sebagai Other.';
        btn.disabled = false; btn.textContent = 'SECURE LOGIN';
        return;
      }
      setUser({ name: u, role: 'other' });
      location.href = PAGE_MENU;
      return;
    }

    if (!sb) { err.textContent = 'Supabase belum dikonfigurasi (cek config.js & koneksi internet).'; return; }
    const norm = x => String(x).trim().replace(/\s+/g, ' ').toLowerCase();
    if (![a.username].concat(a.alias || []).some(n => norm(u) === norm(n))) { err.textContent = 'Username tidak sesuai untuk role ' + ROLE_LABEL[role] + '.'; return; }

    btn.disabled = true; btn.textContent = 'MEMERIKSA...';
    const resetBtn = () => { btn.disabled = false; btn.textContent = 'SECURE LOGIN'; };

    const { data, error } = await sb.auth.signInWithPassword({ email: a.email, password: p });
    if (error) { err.textContent = 'Username atau password salah.'; resetBtn(); return; }

    // Pastikan role di database sama dengan role yang dipilih
    const { data: prof } = await sb.from('qc_roles').select('role').eq('id', data.user.id).maybeSingle();
    if (!prof || prof.role !== role) {
      await sb.auth.signOut();
      err.textContent = 'Akun ini tidak terdaftar sebagai ' + ROLE_LABEL[role] + '.';
      resetBtn();
      return;
    }

    setUser({ name: a.username, role: role });
    location.href = PAGE_MENU;
  }

  render();
}

/* ---------- HALAMAN MENU (dipanggil dari menu.html) ---------- */
function initMenu() {
  const u = requireLogin();
  if (!u) return;
  const canInput = PERM[u.role].input;
  $('#app').innerHTML = topbar('', null) + `<div class="page">
    <h2 class="welcome">Welcome Home and have a great day, ${esc(u.name)}</h2>
    <p class="sub">Pilih modul. Setiap modul punya form Data Input dan Dashboard sendiri.</p>
    <div class="cards">${Object.keys(MODULES).map(m => `<div class="mod"><h3>${MODULES[m].name}</h3><p>${MODULES[m].desc}</p>
      <div class="acts">${canInput ? `<button class="btn accent" data-href="${pageInput(m)}">Data Input</button>` : ''}<button class="btn" data-href="${pageDash(m)}">Dashboard</button></div></div>`).join('')}</div></div>`;
  bindCommon();
}