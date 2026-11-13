/* master-part.js — Input Red Tag: ketik Part Number (EEP / CPN) -> Versigent Part Number, Project (Model), Family, Harness Name terisi otomatis.
   Master disimpan di tabel Supabase master_part (supabase/14-master-part.sql), diisi lewat tombol "Import Master".
   Kolom file master: PROJECT (model) · CPN (EEP) · APN (Versigent PN) · VSM (family) · DESCRIPTION (harness name) · STATUS · Family (opsional) */
(function () {
  if (!document.body || document.body.dataset.module !== 'rt') return;
  const user = getUser && getUser();
  const frm = document.getElementById('frm');
  if (!user || !frm || typeof sb === 'undefined' || !sb) return;

  const norm = v => String(v ?? '').replace(/\s+/g, ' ').trim();
  const key = v => norm(v).toLowerCase();
  const stripNo = v => norm(v).replace(/^\d+\s*[.)\-:]\s*/, '');                // '1. Body' -> 'Body'
  const hkey = v => String(v ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');     // judul kolom dinormalkan

  // VSM -> nama Family
  const VSM = { BD: 'Body', IP: 'IP', ENG: 'Engine', SML: 'Small', HV: 'HV', BATPACK: 'Baterai PDU' };
  const familyOf = (vsm, famCol) => {
    const k = norm(vsm).toUpperCase().replace(/\s+/g, '');
    return VSM[k] || stripNo(famCol) || norm(vsm);
  };

  let master = new Map();      // pn_key -> baris master
  let ready = true;            // false bila tabel master_part belum dibuat

  /* ---------- Muat master ---------- */
  async function loadMaster() {
    const m = new Map(), size = 1000;
    for (let from = 0; ; from += size) {
      const { data, error } = await sb.from('master_part').select('pn_key,pn,apn,model,family,description,status').order('id', { ascending: true }).range(from, from + size - 1);
      if (error) { ready = false; master = m; return; }
      data.forEach(r => m.set(r.pn_key, r));
      if (data.length < size) break;
    }
    ready = true; master = m;
  }

  /* ---------- Isi form ---------- */
  const setText = (name, value) => { const el = frm.elements[name]; if (el && value) el.value = value; };
  const setSelect = (name, value) => {
    const sel = frm.elements[name], oth = frm.elements[name + '__other'];
    if (!sel || !value) return;
    const want = stripNo(value).toLowerCase();
    const hit = [...sel.options].find(o => o.value && o.value !== 'Other' && stripNo(o.value).toLowerCase() === want);
    if (hit) sel.value = hit.value;
    else if ([...sel.options].some(o => o.value === 'Other') && oth) { sel.value = 'Other'; sel.dispatchEvent(new Event('change')); oth.value = norm(value); }
    else return;
    sel.dispatchEvent(new Event('change'));
  };

  const hint = document.createElement('div');
  hint.style.cssText = 'font-size:12px;margin-top:6px;color:var(--muted)';
  const pnEl = frm.elements['pn'];
  if (pnEl) pnEl.parentElement.appendChild(hint);

  function onPn() {
    const m = master.get(key(pnEl.value));
    if (m) {
      setText('aptivpn', m.apn);
      setSelect('project', m.model);
      setSelect('family', m.family);
      setText('harness', m.description);
      const inactive = /inactive|non/i.test(m.status || '');
      hint.style.color = inactive ? '#B45309' : '#1F7A3D';
      hint.textContent = '✔ Terisi otomatis dari master (Versigent PN, Project, Family, Harness Name). Boleh diubah manual.' + (inactive ? ' — Status part: ' + m.status : '');
    } else {
      hint.style.color = 'var(--muted)';
      hint.textContent = pnEl.value.trim() ? (ready ? 'Part Number belum ada di master — isi manual.' : 'Master belum aktif (jalankan 14-master-part.sql di Supabase).') : '';
    }
  }
  let timer = null;
  if (pnEl) {
    pnEl.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(onPn, 150); });
    pnEl.addEventListener('change', onPn);
    pnEl.setAttribute('autocomplete', 'off');
  }

  /* ---------- Kartu Import Master ---------- */
  const card = document.createElement('div');
  card.className = 'form-card';
  card.style.marginTop = '16px';
  card.innerHTML = `<div class="fh"><h3>Master Part Number</h3><span id="mp-count">memuat…</span></div>
    <div style="font-size:13px;color:var(--muted);margin-bottom:12px;line-height:1.5">File Excel / CSV dengan kolom <b>PROJECT</b> (model), <b>CPN</b> (EEP), <b>APN</b> (Versigent Part Number),
      <b>VSM</b> (family: BD, IP, ENG, SML, HV, BAT PACK), <b>DESCRIPTION</b> (harness name), dan <b>STATUS</b>.
      CPN yang sudah ada di master diperbarui; yang baru ditambahkan.</div>
    <div class="form-actions"><button type="button" class="btn accent" id="mp-btn">Import Master (Excel / CSV)</button>
      <input type="file" id="mp-file" accept=".xlsx,.xlsm,.xls,.csv" style="display:none"><span id="mp-status" style="font-size:13px;color:var(--muted)"></span></div>`;
  frm.parentNode.insertBefore(card, frm.nextSibling);
  const countEl = card.querySelector('#mp-count'), statusEl = card.querySelector('#mp-status');
  const showCount = () => { countEl.textContent = ready ? master.size.toLocaleString('id-ID') + ' Part Number di master' : 'tabel master belum dibuat (jalankan 14-master-part.sql)'; };

  // Judul kolom (dinormalkan: huruf kecil tanpa spasi/tanda baca) -> field
  const ALIAS = {
    pn: ['cpn', 'eep', 'eepnumber', 'partnumber', 'partno', 'pn'],
    apn: ['apn', 'versigentpartnumber', 'versigentpn', 'aptivpartnumber'],
    model: ['project', 'model', 'modelharness'],
    vsm: ['vsm'],
    family: ['family'],
    description: ['description', 'harnessname', 'harness'],
    status: ['status']
  };
  function parseMaster(sheetRows) {
    for (let i = 0; i < Math.min(sheetRows.length, 20); i++) {
      const hs = (sheetRows[i] || []).map(hkey);
      const col = {};
      for (const f of Object.keys(ALIAS)) {
        for (const a of ALIAS[f]) { const j = hs.indexOf(a); if (j >= 0) { col[f] = j; break; } }
      }
      if (col.pn == null || (col.apn == null && col.model == null && col.vsm == null && col.family == null && col.description == null)) continue;
      const out = new Map();
      for (let r = i + 1; r < sheetRows.length; r++) {
        const row = sheetRows[r] || [];
        const pn = norm(row[col.pn]);
        if (!pn) continue;
        const g = f => (col[f] == null ? '' : norm(row[col[f]]));
        out.set(key(pn), { pn_key: key(pn), pn, apn: g('apn'), model: g('model'), family: familyOf(g('vsm'), g('family')), description: g('description'), status: g('status'), updated_at: new Date().toISOString() });
      }
      return { rows: [...out.values()], cols: Object.keys(col) };
    }
    return null;
  }

  card.querySelector('#mp-btn').addEventListener('click', () => card.querySelector('#mp-file').click());
  card.querySelector('#mp-file').addEventListener('change', async e => {
    const file = e.target.files[0]; e.target.value = '';
    if (!file) return;
    try {
      statusEl.textContent = 'Membaca file…';
      await new Promise(r => setTimeout(r, 30));   // beri kesempatan tampilan menampilkan status sebelum parsing file besar
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      let res = null;
      for (const n of wb.SheetNames) { res = parseMaster(XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: false, defval: '' })); if (res) break; }
      if (!res || !res.rows.length) { statusEl.textContent = ''; toast('Kolom tidak ditemukan. Pastikan ada judul kolom "CPN" dan minimal salah satu: APN, PROJECT, VSM, DESCRIPTION.', true); return; }
      if (!confirm('Import ' + res.rows.length.toLocaleString('id-ID') + ' Part Number (CPN) ke master?\nKolom terbaca: ' + res.cols.join(', ') + '\nCPN yang sudah ada akan diperbarui.')) { statusEl.textContent = ''; return; }
      let done = 0;
      for (let i = 0; i < res.rows.length; i += 500) {
        const chunk = res.rows.slice(i, i + 500);
        const { error } = await sb.from('master_part').upsert(chunk, { onConflict: 'pn_key' });
        if (error) { statusEl.textContent = ''; toast('Gagal import master: ' + error.message + (/master_part|column/.test(error.message) ? ' — jalankan 14-master-part.sql di Supabase.' : ''), true); return; }
        done += chunk.length; statusEl.textContent = 'Mengimpor… ' + done.toLocaleString('id-ID') + '/' + res.rows.length.toLocaleString('id-ID');
      }
      await loadMaster(); showCount();
      statusEl.textContent = '';
      toast(done.toLocaleString('id-ID') + ' Part Number masuk ke master ✔');
      if (pnEl && pnEl.value) onPn();
    } catch (err) { statusEl.textContent = ''; toast('Gagal membaca file: ' + (err.message || err), true); }
  });

  loadMaster().then(() => { showCount(); if (pnEl && pnEl.value) onPn(); });
})();
