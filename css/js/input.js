/* input.js — dipakai input-ftq / scar / redtag.html (simpan ke Supabase)
   Hanya role Admin & Input User yang boleh masuk. */
(function () {
  const user = requireLogin();
  if (!user) return;

  const mod = resolveModule();
  if (!mod) return;

  const cfg  = MODULES[mod];
  const perm = PERM[user.role];

  if (!perm.input) {
    alert('Role ' + ROLE_LABEL[user.role] + ' tidak punya akses Data Input.');
    location.replace(pageDash(mod));
    return;
  }

  const app = $('#app');

  const fieldHTML = f => {
    const lab = `<label>${f.label}${f.req ? ' <i>*</i>' : ''}</label>`;
    const inp = f.type === 'select'
      ? `<select class="inp" name="${f.k}"><option value="">Pilih...</option>${f.opts.map(o => `<option>${esc(o)}</option>`).join('')}</select>`
      : `<input class="inp" name="${f.k}" type="${f.type}" ${f.type === 'number' ? 'min="0" step="1"' : ''}>`;
    const oth = f.other ? `<input class="inp" name="${f.k}__other" type="text" placeholder="Tulis nama ${esc(f.label)}..." style="display:none;margin-top:8px">` : '';
    return `<div>${lab}${inp}${oth}</div>`;
  };
  // Field select ber-"other" (mis. Sub Family = Others): tampilkan kotak teks agar nama diisi manual
  const syncOther = () => cfg.fields.filter(f => f.other).forEach(f => {
    const sel = frm.elements[f.k], o = frm.elements[f.k + '__other'];
    if (!sel || !o) return;
    const on = sel.value === f.other;
    o.style.display = on ? '' : 'none';
    if (!on) { o.value = ''; o.style.borderColor = ''; }
  });

  app.innerHTML = topbar(cfg.name + ' Data Input', { label: 'Lihat Dashboard', href: pageDash(mod) }) + `<div class="page">
    <form class="form-card" id="frm" novalidate>
      <div class="fh"><h3>New ${cfg.name} Entry</h3><span><b>*</b> wajib diisi</span></div>
      <div class="grid3">${cfg.fields.map(fieldHTML).join('')}</div>
      <div class="form-actions">
        <button type="submit" class="btn accent" data-mode="go">Submit Entry</button>
        <button type="submit" class="btn" data-mode="again">Submit &amp; Add Another</button>
        <div class="sp"></div>
        <button type="button" class="btn" data-href="${PAGE_MENU}">← Kembali ke Menu</button>
        <button type="button" class="btn danger" id="clr">Clear Form</button>
      </div>
    </form>
    <div class="section-title">Recent Entries (10 terakhir ditambahkan)
      ${perm.export ? '<a id="exp">Export Excel</a>' : ''}</div>
    <div class="tbl-card" id="recent"></div>
  </div>`;
  bindCommon();

  const frm = $('#frm');
  cfg.fields.filter(f => f.other).forEach(f => frm.elements[f.k].addEventListener('change', syncOther));

  // Isi nilai default (tanggal hari ini, nomor otomatis, qty 1)
  async function resetForm() {
    frm.reset();
    cfg.fields.forEach(f => {
      const el = frm.elements[f.k];
      if (!el) return;
      el.style.borderColor = '';
      if (f.def === 'today') el.value = today();
      else if (f.def !== undefined && f.def !== 'auto') el.value = f.def;
    });
    if (cfg.idKey) frm.elements[cfg.idKey].value = await nextNo(mod);
    syncOther();
  }
  async function showRecent() {
    $('#recent').innerHTML = '<div class="empty" style="padding:20px">Memuat...</div>';
    const rows = await loadRecent(mod, 10);
    $('#recent').innerHTML = renderTable(cfg, rows, canDelete() ? { del: true, edit: true } : undefined);
$('#recent').querySelectorAll('button[data-edit]').forEach(b => b.addEventListener('click', async () => {
  const row = rows.find(r => String(r._id) === b.dataset.edit);
  if (row && canEdit() && await editRow(mod, row)) await showRecent();
}));
    // Tombol Hapus per baris (salah input -> hapus di sini; ikut terhapus di database)
    $('#recent').querySelectorAll('button[data-del]').forEach(b => b.addEventListener('click', async () => {
      const row = rows.find(r => String(r._id) === b.dataset.del);
      if (!row || !canDelete()) return;
      if (!(await confirmDelete(mod, [row]))) return;
      b.disabled = true;
      const { deleted, error } = await deleteRows(mod, [row._id]);
      if (error) toast(error.message, true);
      else toast('Data ' + cfg.name + ' dihapus dari database ✔');
      if (!error && cfg.idKey && frm.elements[cfg.idKey]) frm.elements[cfg.idKey].value = await nextNo(mod);
      await showRecent();
    }));
  }
  resetForm();
  showRecent();
  // Setelah impor Excel (kartu Import di halaman ini), Recent Entries & nomor otomatis ikut diperbarui
  document.addEventListener('qc-data-changed', async () => { await showRecent(); if (cfg.idKey) frm.elements[cfg.idKey].value = await nextNo(mod); });
  window.addEventListener('qc-imported', () => showRecent());   // data hasil impor Excel langsung muncul di Recent Entries

  // Submit
  let mode = 'go';
  frm.querySelectorAll('button[type=submit]').forEach(b => b.addEventListener('click', () => mode = b.dataset.mode));

  frm.addEventListener('submit', async e => {
    e.preventDefault();
    const rec = {};
    let bad = null;

    cfg.fields.forEach(f => {
      const el = frm.elements[f.k];
      el.style.borderColor = '';
      let v = el.value.trim();
      if (f.other && v === f.other) {              // pilih "Others" -> pakai teks yang diketik
        const o = frm.elements[f.k + '__other'];
        o.style.borderColor = '';
        v = o.value.trim();
        if (!v) { o.style.borderColor = 'var(--red)'; bad = bad || o; }
      }
      if (f.req && !v) { el.style.borderColor = 'var(--red)'; bad = bad || el; }
      rec[f.k] = f.type === 'number' ? (Number(v) || 0) : v;
    });
    if (bad) { toast('Lengkapi semua field yang wajib diisi (*)', true); bad.focus(); return; }

    const btns = frm.querySelectorAll('button');
    btns.forEach(b => b.disabled = true);
    const error = await insertRow(mod, rec);
    btns.forEach(b => b.disabled = false);

    if (error) {
      if (error.code === '23505' && cfg.idKey) {            // nomor sudah dipakai orang lain
        frm.elements[cfg.idKey].value = await nextNo(mod);
        toast('Nomor sudah dipakai, diganti otomatis. Klik submit lagi.', true);
      } else if (error.code === '42501' || /row-level security/i.test(error.message || '')) {
        toast('Tidak punya izin / sesi login habis. Silakan login ulang.', true);
      } else {
        toast('Gagal menyimpan: ' + error.message, true);
      }
      return;
    }

    toast(cfg.name + ' entry tersimpan ✔');
    if (mode === 'again') {
      await resetForm();
      await showRecent();
      frm.elements[cfg.fields[0].k].focus();
    } else {
      setTimeout(() => { location.href = PAGE_MENU; }, 500);
    }
  });

  $('#clr').addEventListener('click', resetForm);

  const ex = $('#exp');
  if (ex) ex.addEventListener('click', async () => exportExcel(mod, sortRows(await loadData(mod))));
})();
