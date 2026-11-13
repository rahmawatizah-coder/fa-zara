/* excel-import.js — Import data dari Excel (FTQ, SCAR, Red Tag)
   Dimuat SETELAH config.js dan common.js. Dipakai di:
     - halaman Dashboard  : tombol "⬆ Import Excel" (jendela popup)
     - halaman Data Input : kartu "Import dari Excel" di bawah form
   Hanya Input User (Engineering Maintenance) yang melihatnya.

   FORMAT EXCEL = format yang sama dengan hasil tombol "⬇ Excel" (lihat xlColumns() di common.js),
   jadi file hasil export bisa langsung diimpor lagi.
   Khusus FTQ, file master FTQ (sheet per model: VF5, VF6, dst) juga langsung terbaca:
   judul kolom yang dikenali: Date Occurred, Model, Harness Type (Main-Fam), P/N Harness, Shift,
   Position, Problem Classification, Problem Description, Area, Qty Defect, Root Cause, CA, Owner, No.Serial.
   Baris yang sudah ada di database dilewati otomatis, jadi aman diimpor berulang kali. */
(function () {
  'use strict';

  /* =====================================================================
     BAGIAN 1 — LOGIKA MURNI (tanpa DOM, bisa diuji di Node)
     ===================================================================== */
  const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const SKIP_SHEET = /dash|pivot/i;
  const ERR_RE = /^#(N\/A|REF!|VALUE!|DIV\/0!|NAME\?|NULL!|NUM!)/i;

  const clean = v => {
    if (v == null) return '';
    const s = String(v).replace(/\s+/g, ' ').trim();
    return ERR_RE.test(s) ? '' : s;
  };
  const low = v => clean(v).toLowerCase();

  const titleCase = s => {
    s = clean(s);
    if (!s) return '';
    if (s.toUpperCase() === 'IP') return 'IP';
    return s.toLowerCase().replace(/(^|[\s\/(-])([a-z])/g, (m, a, b) => a + b.toUpperCase());
  };

  const pad2 = n => String(n).padStart(2, '0');
  function isoOf(y, m, d) {
    if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCMonth() === m - 1 ? y + '-' + pad2(m) + '-' + pad2(d) : null;
  }
  function toISODate(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') {
      if (!isFinite(v) || v < 36526 || v > 73415) return null;
      return new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000).toISOString().slice(0, 10);
    }
    if (v instanceof Date) return isNaN(v) ? null : isoOf(v.getFullYear(), v.getMonth() + 1, v.getDate());
    const s = clean(v);
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return isoOf(+m[1], +m[2], +m[3]);
    m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/);
    if (m) return isoOf(+m[3], +m[2], +m[1]);
    const MON = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
        const ID = { mei: 'may', agu: 'aug', ags: 'aug', okt: 'oct', des: 'dec' };
    const mi = t => { const k = t.slice(0, 3).toLowerCase(); return MON.indexOf(ID[k] || k); };
    const yy = y => (y < 100 ? 2000 + y : y);
    m = s.match(/^(\d{1,2})[\s\-\/.]([A-Za-z]{3,9})[\s\-\/.,]+(\d{2,4})$/);          // 2-Oct-26 / 02 October 2026
    if (m && MON.indexOf(m[2].slice(0, 3).toLowerCase()) >= 0) return isoOf(yy(+m[3]), MON.indexOf(m[2].slice(0, 3).toLowerCase()) + 1, +m[1]);
    m = s.match(/^([A-Za-z]{3,9})[\s\-\/.]+(\d{1,2}),?[\s\-\/.]+(\d{2,4})$/);       // Oct 2, 2026
    if (m && MON.indexOf(m[1].slice(0, 3).toLowerCase()) >= 0) return isoOf(yy(+m[3]), MON.indexOf(m[1].slice(0, 3).toLowerCase()) + 1, +m[2]);
    return null;
  }
  function toQty(v) {
    if (v == null) return 0;
    const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
    return isFinite(n) && n > 0 ? Math.round(n) : 0;
  }
  function toShift(v) {
    const s = clean(v);
    if (!s) return '-';
    if (/^\d+(\.0+)?$/.test(s)) return 'Shift ' + parseInt(s, 10);
    return /^shift/i.test(s) ? 'Shift ' + s.replace(/^shift\s*/i, '') : s;
  }

  // Cari baris judul kolom: baris (12 pertama) yang memuat semua judul wajib (kecil/besar huruf bebas)
  function findHeaderBy(rows, mustHave) {
    for (let i = 0; i < Math.min(rows.length, 12); i++) {
      const cells = (rows[i] || []).map(low);
      if (mustHave.every(m => cells.includes(m))) {
        const idx = {};
        cells.forEach((c, j) => { if (c && !(c in idx)) idx[c] = j; });
        return { row: i, idx };
      }
    }
    return null;
  }
  const findHeader = rows => findHeaderBy(rows, ['date occurred', 'qty defect']);

  /* ---------- FTQ ---------- */
  const famOf = v => {
    const t = String(v || '').toLowerCase();
    if (/\bip\b|instrument/.test(t)) return 'IP';
    if (/body/.test(t)) return 'Body';
    if (/engine/.test(t)) return 'Engine';
    if (/small/.test(t)) return 'Small';
    return '';
  };
  function parseFtqSheets(sheetsRows) {
    const out = { rows: [], invalid: [], sheets: [] };
    const pending = [], subMap = {};   // baris tanpa Main-Fam valid; peta Sub-Fam -> Family dari baris lain di file ini
    for (const name of Object.keys(sheetsRows)) {
      const rows = sheetsRows[name] || [];
      const h = findHeader(rows);
      if (!h) { out.sheets.push({ name, used: false, count: 0 }); continue; }
      const g = (r, ...ks) => { for (const k of ks) if (k in h.idx) return r[h.idx[k]]; return null; };
      // Kolom Family & Sub Family dikenali dari kata "main" / "sub" di judul (urutan kolom bebas, Main-Fam boleh di belakang Sub-Fam)
      const hk = Object.keys(h.idx).filter(k => /harness\s*type|fam/.test(k));
      const mainKey = hk.find(k => /main/.test(k)) || (hk.includes('harness type') ? 'harness type' : null) || (hk.includes('family') ? 'family' : null);
      const subKey = hk.find(k => /sub/.test(k));
      const gk = (r, k) => (k && k in h.idx) ? r[h.idx[k]] : null;
      let count = 0;
      for (let i = h.row + 1; i < rows.length; i++) {
        const r = rows[i] || [];
        const rawDate = g(r, 'date occurred'), rawQty = g(r, 'qty defect');
        const pn = clean(g(r, 'p/n harness'));
        const descRaw = clean(g(r, 'problem description'));
        const probF = clean(g(r, 'problem'));
        if (clean(rawDate) === '' && clean(rawQty) === '' && !pn && !descRaw && !probF) continue;

        const date = toISODate(rawDate);
        if (!date) { out.invalid.push({ sheet: name, row: i + 1, reason: 'tanggal tidak valid' }); continue; }
        const qty = toQty(rawQty);
        if (!qty) { out.invalid.push({ sheet: name, row: i + 1, reason: 'qty tidak valid' }); continue; }

        const famRaw = clean(gk(r, mainKey)), subRaw = clean(gk(r, subKey) || g(r, 'sub family', 'sub-family'));
        let fam = famOf(famRaw);   // Family (Body/Engine/IP/Small) dari kolom Main-Fam
        const problem = titleCase(g(r, 'problem classification')) || titleCase(probF) || 'Other';
        const pos = clean(g(r, 'position', 'posisi')).toUpperCase();
        out.rows.push({
          date,
          model: clean(g(r, 'model')) || name,
          family: fam,
          subfamily: clean(gk(r, subKey) || g(r, 'sub family', 'sub-family')),   // Sub Family = kolom Harness Type (Sub-Fam)
          pn: pn || '-',
          shift: toShift(g(r, 'shift')),
          problem,
          desc: descRaw || probF || problem,
          area: clean(g(r, 'area')) || '-',
          qty,
          root: clean(g(r, 'root cause')),
          action: clean(g(r, 'ca', 'corrective action')),
          serial: clean(g(r, 'no.serial', 'no. serial', 'serial no', 'serial', 'n/a')) || 'N/A',
          posisi: pos || '-'
        });
        if (!fam) pending.push({ obj: out.rows[out.rows.length - 1], sheet: name, row: i + 1, famRaw, subRaw });
        else if (subRaw) { const m = subMap[subRaw.toLowerCase()] = subMap[subRaw.toLowerCase()] || {}; m[fam] = (m[fam] || 0) + 1; }
        count++;
      }
      out.sheets.push({ name, used: true, count });
    }
    // Main-Fam kosong / #N/A: isi dari Sub-Fam yang sama di baris lain (Family yang paling sering dipakai). Bila tetap tidak ketemu -> dilewati.
    const drop = new Set();
    pending.forEach(p => {
      const m = p.subRaw && subMap[p.subRaw.toLowerCase()];
      const best = m && Object.keys(m).sort((a, b) => m[b] - m[a])[0];
      if (best) { p.obj.family = best; return; }
      drop.add(p.obj);
      const sh = out.sheets.find(x => x.name === p.sheet); if (sh) sh.count--;
      out.invalid.push({ sheet: p.sheet, row: p.row, reason: 'Harness Type (Main-Fam) ' + (p.famRaw ? '"' + p.famRaw + '" tidak dikenali' : 'kosong') + ' dan Sub-Fam ' + (p.subRaw ? '"' + p.subRaw + '"' : 'kosong') + ' belum punya pasangan Family' });
    });
    if (drop.size) out.rows = out.rows.filter(r => !drop.has(r));
    return out;
  }

  /* ---------- SCAR & Red Tag (format = hasil export: judul kolom = label field di config.js) ----------
     fields: array {k,label,type,req} dari MODULES[mod].fields */
  function parseGenericSheets(fields, sheetsRows, xl) {
    const out = { rows: [], invalid: [], sheets: [] };
    // Bila modul punya format Excel sendiri (xl), judul kolom diambil dari sana; kolom hitungan ("_...") dilewati.
    const eff = xl
      ? xl.filter(([k]) => k[0] !== '_').map(([k, h]) => Object.assign({}, fields.find(f => f.k === k) || { k, type: 'text' }, { label: h }))
      : fields;
    const idF = eff.find(f => f.def === 'auto') || eff[0];
    const dateF = eff.find(f => f.type === 'date');
    const must = [low(idF.label), low(dateF.label)];
    for (const name of Object.keys(sheetsRows)) {
      const rows = sheetsRows[name] || [];
      const h = findHeaderBy(rows, must);
      if (!h) { out.sheets.push({ name, used: false, count: 0 }); continue; }
      let count = 0;
      for (let i = h.row + 1; i < rows.length; i++) {
        const r = rows[i] || [];
        if (!r.some(c => clean(c) !== '')) continue;
        const rec = {};
        let bad = null;
        for (const f of eff) {
          const raw = low(f.label) in h.idx ? r[h.idx[low(f.label)]] : null;
          if (f.type === 'date') {
            const d = toISODate(raw);
            rec[f.k] = d || '';
            // format xl: hanya tanggal utama (kolom tanggal pertama) yang wajib; tanggal lain boleh kosong
            if ((xl ? f === dateF : f.req) && !d) bad = bad || ('kolom "' + f.label + '" kosong/tidak valid');
          } else if (f.type === 'number') {
            const n = typeof raw === 'number' ? raw : parseFloat(String(raw ?? '').replace(',', '.'));
            rec[f.k] = isFinite(n) && n >= 0 ? Math.round(n) : 0;
            if (!xl && f.req && f.k === 'qty' && !rec[f.k]) bad = bad || ('kolom "' + f.label + '" harus lebih dari 0');
          } else {
            rec[f.k] = clean(raw);
            if (!xl && f.req && rec[f.k] === '' && f.def !== 'auto') bad = bad || ('kolom "' + f.label + '" kosong');
          }
        }
        if (bad) { out.invalid.push({ sheet: name, row: i + 1, reason: bad }); continue; }
        out.rows.push(rec);
        count++;
      }
      out.sheets.push({ name, used: true, count });
    }
    return out;
  }
  /* ---------- RED TAG (format "DAILY RED TAG CHECK") ---------- */
  function parseRedTagSheets(sheetsRows) {
    const out = { rows: [], invalid: [], sheets: [] };
    for (const name of Object.keys(sheetsRows)) {
      const rows = sheetsRows[name] || [];
      const h = findHeaderBy(rows, ['part number', 'qty (pcs)', 'reason']);
      if (!h) { out.sheets.push({ name, used: false, count: 0 }); continue; }
      let titleDate = null;
      for (let i = 0; i < h.row && !titleDate; i++) {
        for (const c of rows[i] || []) {
          const m = /date\s*:\s*(.+)$/i.exec(clean(c));
          if (m) { titleDate = toISODate(m[1].trim()); if (titleDate) break; }
        }
      }
      const g = (r, k) => (k in h.idx ? r[h.idx[k]] : null);
      let count = 0;
      for (let i = h.row + 1; i < rows.length; i++) {
        const r = rows[i] || [];
        const pn = clean(g(r, 'part number')), reason = clean(g(r, 'reason')), rawQty = g(r, 'qty (pcs)');
        if (!pn && !reason && clean(rawQty) === '') continue;
        const date = toISODate(g(r, 'date')) || titleDate;
        if (!date) { out.invalid.push({ sheet: name, row: i + 1, reason: 'tanggal tidak ditemukan (baris "DATE : ..." atau kolom Date)' }); continue; }
        const qty = toQty(rawQty);
        if (!qty) { out.invalid.push({ sheet: name, row: i + 1, reason: 'qty tidak valid' }); continue; }
        if (!pn) { out.invalid.push({ sheet: name, row: i + 1, reason: 'Part Number kosong' }); continue; }
        out.rows.push({
          date, aptivpn: clean(g(r, 'aptiv part number')), pn, project: clean(g(r, 'project')), family: clean(g(r, 'family')),
          qty, reason: reason || '-', remarks: clean(g(r, 'remarks')), reworkplan: clean(g(r, 'rework plan')),
          qtyrework: Math.max(0, toQty(g(r, 'qty rework')))
        });
        count++;
      }
      out.sheets.push({ name, used: true, count });
    }
    return out;
  }

  // Pintu masuk umum: mod = 'ftq' | 'scar' | 'rt'
  function parseModule(mod, fields, sheetsRows, xl) {
        const p = mod === 'ftq' ? parseFtqSheets(sheetsRows) : mod === 'rt' ? parseRedTagSheets(sheetsRows) : parseGenericSheets(fields, sheetsRows, xl);
    if (mod === 'scar') {            // nomor ganda di dalam file: baris berikutnya dilewati
      const seen = new Set(), keep = [];
      p.rows.forEach(r => {
        if (r.no && seen.has(r.no)) p.invalid.push({ sheet: '-', row: 0, reason: 'nomor ' + r.no + ' ganda di file' });
        else { if (r.no) seen.add(r.no); keep.push(r); }
      });
      p.rows = keep;
    }
    return p;
  }

  function monthsOf(rows) {
    const m = {};
    rows.forEach(r => {
      const k = r.date.slice(0, 7);
      (m[k] = m[k] || { rows: 0, qty: 0 });
      m[k].rows++; m[k].qty += Number(r.qty) || 0;
    });
    return m;
  }
  const monthLabel = ym => BULAN[+ym.slice(5, 7) - 1] + ' ' + ym.slice(0, 4);

  const keyOf = r => [r.date, r.model, r.family, r.pn, r.shift, r.problem, r.desc, r.area, r.qty].join('\u0001');

  // FTQ: dicocokkan dengan jumlah kemunculan (dua baris identik di Excel tetap masuk keduanya, sekali saja)
  function splitNewExisting(rows, existingRows) {
    const cnt = new Map();
    existingRows.forEach(e => { const k = keyOf(e); cnt.set(k, (cnt.get(k) || 0) + 1); });
    const fresh = [], already = [];
    rows.forEach(r => {
      const k = keyOf(r), c = cnt.get(k) || 0;
      if (c > 0) { cnt.set(k, c - 1); already.push(r); } else fresh.push(r);
    });
    return { fresh, already };
  }
    const rtKey = r => [r.date, r.pn, r.reason, r.qty].join('\u0001');
  function splitRedTag(rows, existingRows, existingNos, prefix) {
    const cnt = new Map();
    existingRows.forEach(e => { const k = rtKey(e); cnt.set(k, (cnt.get(k) || 0) + 1); });
    let max = 0;
    existingNos.forEach(n => { max = Math.max(max, parseInt(String(n || '').replace(/\D/g, ''), 10) || 0); });
    const fresh = [], already = [];
    rows.forEach(r => {
      const k = rtKey(r), c = cnt.get(k) || 0;
      if (c > 0) { cnt.set(k, c - 1); already.push(r); } else fresh.push(Object.assign({}, r, { no: prefix + String(++max).padStart(3, '0') }));
    });
    return { fresh, already };
  }
  // SCAR / Red Tag: dicocokkan lewat nomor. Baris tanpa nomor diberi nomor berikutnya.
  function splitByNo(rows, existingNos, prefix) {
    const have = new Set(existingNos);
    let max = 0;
    existingNos.concat(rows.map(r => r.no)).forEach(n => { max = Math.max(max, parseInt(String(n || '').replace(/\D/g, ''), 10) || 0); });
    const fresh = [], already = [];
    rows.forEach(r => {
      if (r.no && have.has(r.no)) { already.push(r); return; }
      fresh.push(r.no ? r : Object.assign({}, r, { no: prefix + String(++max).padStart(3, '0') }));
    });
    return { fresh, already };
  }

  const API = { parseSheets: parseFtqSheets, parseModule, parseGenericSheets, toISODate, toQty, toShift, titleCase, monthsOf, monthLabel, keyOf, splitNewExisting, splitByNo, findHeader, SKIP_SHEET };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;

  /* =====================================================================
     BAGIAN 2 — TAMPILAN & KONEKSI (hanya jalan di browser)
     ===================================================================== */
  if (typeof document === 'undefined' || !document.body || typeof getUser !== 'function') return;

  const user = getUser();
  // Impor Excel hanya untuk Input User (Engineering Maintenance)
  const canImport = !!(user && user.role === 'input');

  const style = document.createElement('style');
  style.textContent = `
    .imp-note{color:var(--muted);font-size:13px;line-height:1.5;margin:4px 0 14px}
    .imp-row{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
    .imp-row .inp{width:auto;min-width:240px;height:auto;padding:8px 12px}
    .imp-status{margin-top:12px;font-size:13px;color:var(--muted);min-height:18px}
    .imp-status.bad{color:#dc2626}.imp-status.ok{color:#15803d}
    .imp-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:16px 0}
    .imp-stat{background:#fff7ed;border:1px solid var(--line);border-radius:10px;padding:12px 14px}
    .imp-stat b{display:block;font-size:20px}
    .imp-stat span{color:var(--muted);font-size:11px;letter-spacing:.8px;text-transform:uppercase}
    .imp-sub{font-size:12px;color:var(--muted);margin:8px 0}
    .imp-actions{display:flex;gap:10px;align-items:center;margin-top:14px;flex-wrap:wrap}
    .imp-modal{position:fixed;inset:0;background:rgba(17,24,39,.45);z-index:50;display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:40px 16px}
    .imp-modal .form-card{width:min(980px,100%);margin:0}
    @media(max-width:700px){.imp-stats{grid-template-columns:1fr 1fr}}`;
  document.head.appendChild(style);

  const fmtN = n => Number(n).toLocaleString('id-ID');
  const tick = () => new Promise(r => setTimeout(r, 30));

  async function readWorkbook(file, setStatus) {
    if (!window.XLSX) throw new Error('Library Excel (SheetJS) tidak termuat. Cek koneksi internet lalu muat ulang halaman.');
    const buf = await file.arrayBuffer();
    setStatus('Membaca daftar sheet…'); await tick();
    const names = XLSX.read(buf, { type: 'array', bookSheets: true }).SheetNames || [];
    const dataNames = names.filter(n => !SKIP_SHEET.test(n));
    setStatus('Membaca ' + dataNames.length + ' sheet data… (file besar bisa memakan beberapa detik)'); await tick();
    const opt = { type: 'array', cellFormula: false, cellStyles: false, cellHTML: false, cellNF: false };
    let wb = XLSX.read(buf, Object.assign({ sheets: dataNames }, opt));
    if (!dataNames.some(n => wb.Sheets && wb.Sheets[n])) wb = XLSX.read(buf, opt);
    const out = {};
    dataNames.forEach(n => {
      if (wb.Sheets && wb.Sheets[n]) out[n] = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null });
    });
    return out;
  }

  async function fetchAllNos(cfg) {
    const out = [], size = 1000;
    for (let from = 0; ; from += size) {
      const { data, error } = await sb.from(cfg.slug).select(cfg.idKey).order('id', { ascending: true }).range(from, from + size - 1);
      if (error) throw error;
      out.push(...data.map(r => r[cfg.idKey]));
      if (data.length < size) break;
    }
    return out;
  }
  // FTQ: baris yang sudah ada di database pada rentang tanggal (kolom sama dengan keyOf)
  async function fetchFtqExisting(min, max) {
    const out = [], size = 1000;
    for (let from = 0; ; from += size) {
      const { data, error } = await sb.from('ftq').select('date,model,family,pn,shift,problem,description,area,qty')
        .gte('date', min).lte('date', max)
        .order('id', { ascending: true }).range(from, from + size - 1);
      if (error) throw error;
      out.push(...data.map(r => Object.assign({}, r, { desc: r.description })));
      if (data.length < size) break;
    }
    return out;
  }
    async function fetchRtExisting(min, max) {
    const out = [], size = 1000;
    for (let from = 0; ; from += size) {
      const { data, error } = await sb.from('redtag').select('date,pn,reason,qty')
        .gte('date', min).lte('date', max)
        .order('id', { ascending: true }).range(from, from + size - 1);
      if (error) throw error;
      out.push(...data);
      if (data.length < size) break;
    }
    return out;
  }

  /* Bangun antarmuka impor di dalam elemen `root`. Mengembalikan fungsi reset. */
  function build(root, mod, onDone) {
    const cfg = MODULES[mod];
    const $r = s => root.querySelector(s);
    root.innerHTML = `
      <div class="fh"><h3>Import ${esc(cfg.name)} dari Excel</h3><span>format .xlsx — sama dengan hasil tombol ⬇ Excel</span></div>
      <p class="imp-note">Pilih file Excel. ${mod === 'ftq'
        ? 'File master FTQ (sheet per model: VF5, VF6, dst) dan file hasil export sama-sama bisa dibaca.'
        : 'Gunakan file hasil export ' + esc(cfg.name) + ' (judul kolom harus sama).'}
        Data yang sudah ada di database dilewati otomatis, jadi aman diimpor berulang kali.</p>
      <div class="imp-row"><input type="file" class="inp" data-r="file" accept=".xlsx,.xlsm"></div>
      <div class="imp-status" data-r="status"></div>
      <div data-r="result" hidden>
        <div class="imp-row"><label class="imp-sub" style="margin:0">Bulan yang diimpor:</label>
          <select class="inp" data-r="month"></select></div>
        <div class="imp-stats" data-r="stats"></div>
        <div class="imp-sub" data-r="invalid"></div>
        <div class="imp-sub">Pratinjau (maksimal 8 baris yang akan diimpor):</div>
        <div class="tbl-card" data-r="preview"></div>
        <div class="imp-actions">
          <button type="button" class="btn accent" data-r="go" disabled>Impor</button>
          <a class="btn" data-r="dash" href="${pageDash(mod)}" hidden>Buka Dashboard ${esc(cfg.name)}</a>
        </div>
      </div>`;
    const g = k => root.querySelector(`[data-r="${k}"]`);
    const fileEl = g('file'), statusEl = g('status'), resultEl = g('result'), monthEl = g('month');
    const statsEl = g('stats'), invalidEl = g('invalid'), previewEl = g('preview'), goBtn = g('go'), dashBtn = g('dash');
    let parsed = null, fresh = [], token = 0;

    const setStatus = (msg, kind) => { statusEl.textContent = msg; statusEl.className = 'imp-status' + (kind ? ' ' + kind : ''); };

    async function refresh() {
      const my = ++token;
      const ym = monthEl.value;
      const rows = ym === 'all' ? parsed.rows : parsed.rows.filter(r => r.date.slice(0, 7) === ym);
      goBtn.disabled = true; dashBtn.hidden = true;
      previewEl.innerHTML = ''; statsEl.innerHTML = '';
      if (!rows.length) { setStatus('Tidak ada data pada pilihan ini.', 'bad'); return; }
      if (!dbReady()) { setStatus('Supabase belum siap (cek config.js).', 'bad'); return; }
      setStatus('Memeriksa data yang sudah ada di database…');
      let split;
      try {
        if (mod === 'ftq') {
          const dates = rows.map(r => r.date).sort();
          split = splitNewExisting(rows, await fetchFtqExisting(dates[0], dates[dates.length - 1]));
        } else if (mod === 'rt') {
          const dates = rows.map(r => r.date).sort();
          split = splitRedTag(rows, await fetchRtExisting(dates[0], dates[dates.length - 1]), await fetchAllNos(cfg), cfg.prefix || '');
        } else {
          split = splitByNo(rows, await fetchAllNos(cfg), cfg.prefix || '');
        }
      } catch (e) {
        if (my === token) setStatus('Gagal memeriksa database: ' + (e.message || e), 'bad');
        return;
      }
      if (my !== token) return;
      fresh = split.fresh;
      const qty = a => a.reduce((s, r) => s + (Number(r.qty) || 0), 0);
      const stat = (v, l) => `<div class="imp-stat"><b>${v}</b><span>${l}</span></div>`;
      statsEl.innerHTML = stat(fmtN(rows.length), 'Baris di Excel') + stat(fmtN(split.already.length), 'Sudah ada di database') +
        stat(fmtN(fresh.length), 'Siap diimpor') + stat(fmtN(qty(fresh)), 'Total qty diimpor');
      previewEl.innerHTML = renderTable(cfg, fresh.slice(0, 8));
      goBtn.textContent = fresh.length ? 'Impor ' + fmtN(fresh.length) + ' baris' : 'Tidak ada data baru';
      goBtn.disabled = !fresh.length;
      setStatus(fresh.length ? 'Siap. Periksa pratinjau lalu klik tombol Impor.' : 'Semua baris pada pilihan ini sudah ada di database.', fresh.length ? '' : 'ok');
    }

    async function doImport() {
      const rows = fresh.slice();
      if (!rows.length) return;
      goBtn.disabled = true; monthEl.disabled = true; fileEl.disabled = true;
      let done = 0, failed = false;
      try {
        for (let i = 0; i < rows.length; i += 200) {
          const chunk = rows.slice(i, i + 200).map(toDb);
          const { error } = await sb.from(cfg.slug).insert(chunk);
          if (error) throw error;
          done += chunk.length;
          setStatus('Mengimpor… ' + fmtN(done) + ' / ' + fmtN(rows.length));
          await tick();
        }
        toast(fmtN(done) + ' baris ' + cfg.name + ' berhasil diimpor ✔');
      } catch (e) {
        failed = true;
        const msg = (e && e.message) || String(e);
        let why;
        if (e && (e.code === '42501' || /row-level security/i.test(msg))) why = 'Tidak punya izin / sesi login habis. Silakan login ulang. ';
        else if (/column/i.test(msg) && /(find|exist)/i.test(msg)) why = 'Kolom di database belum lengkap — jalankan supabase/4-kolom-baru.sql di Supabase SQL Editor. (' + msg + ') ';
        else why = 'Gagal mengimpor: ' + msg + '. ';
        setStatus(why + fmtN(done) + ' baris sudah masuk; baris itu akan dilewati bila Anda mengulang.', 'bad');
      } finally {
        monthEl.disabled = false; fileEl.disabled = false;
      }
      if (done) { try { window.dispatchEvent(new Event('qc-imported')); } catch (e) { /* abaikan */ } }
      if (done) { try { document.dispatchEvent(new CustomEvent('qc-data-changed')); } catch (e) { /* abaikan */ } }
      if (done && typeof onDone === 'function') { try { onDone(); } catch (e) { console.error(e); } }
      if (failed) { await refresh().catch(() => {}); return; }
      await refresh();
      setStatus('Selesai: ' + fmtN(done) + ' baris berhasil diimpor ke database.', 'ok');
      dashBtn.hidden = !!document.body.dataset.dash;
    }

    fileEl.addEventListener('change', async () => {
      const f = fileEl.files && fileEl.files[0];
      resultEl.hidden = true; parsed = null;
      if (!f) { setStatus(''); return; }
      try {
        const sheetsRows = await readWorkbook(f, setStatus);
        setStatus('Memproses data…'); await tick();
        parsed = parseModule(mod, cfg.fields, sheetsRows, cfg.xl);
        const used = parsed.sheets.filter(s => s.used).length;
        if (!parsed.rows.length) {
          throw new Error(used ? 'Tidak ada baris data yang valid di file ini.'
            : mod === 'ftq' ? 'Tidak ada sheet dengan kolom "Date Occurred" dan "Qty Defect". Pastikan ini file FTQ.'
              : 'Judul kolom tidak cocok. Gunakan file hasil export ' + cfg.name + ' (kolom: ' + (cfg.xl ? cfg.xl.map(x => x[1]) : cfg.fields.map(x => x.label)).join(', ') + ').');
        }
        const months = monthsOf(parsed.rows);
        const keys = Object.keys(months).sort().reverse();
        monthEl.innerHTML = keys.map(k => `<option value="${k}">${monthLabel(k)} — ${fmtN(months[k].rows)} baris</option>`).join('') +
          `<option value="all">Semua bulan — ${fmtN(parsed.rows.length)} baris</option>`;
        monthEl.value = keys[0];
        invalidEl.textContent = used + ' sheet data terbaca.' + (parsed.invalid.length
          ? ' ' + fmtN(parsed.invalid.length) + ' baris dilewati karena tidak valid (contoh: ' +
            parsed.invalid.slice(0, 3).map(x => (x.row ? 'sheet ' + x.sheet + ' baris ' + x.row + ' — ' : '') + x.reason).join('; ') + ').' : '');
        resultEl.hidden = false;
        await refresh();
      } catch (e) {
        console.error(e);
        setStatus('Gagal membaca file: ' + (e.message || e), 'bad');
      }
    });
    monthEl.addEventListener('change', refresh);
    goBtn.addEventListener('click', doImport);
  }

  /* ---------- Popup (dipakai tombol di Dashboard) ---------- */
  function open(mod, onDone) {
    if (!canImport) { toast('Role Anda tidak punya izin impor.', true); return; }
    if (!MODULES[mod]) return;
    const old = document.getElementById('imp-modal');
    if (old) old.remove();
    const wrap = document.createElement('div');
    wrap.className = 'imp-modal'; wrap.id = 'imp-modal';
    const card = document.createElement('div');
    card.className = 'form-card';
    wrap.appendChild(card);
    document.body.appendChild(wrap);
    document.body.dataset.dash = '1';
    build(card, mod, onDone);
    const close = document.createElement('button');
    close.type = 'button'; close.className = 'btn'; close.textContent = '✕ Tutup'; close.style.marginTop = '14px';
    close.addEventListener('click', () => wrap.remove());
    card.appendChild(close);
    wrap.addEventListener('mousedown', e => { if (e.target === wrap) wrap.remove(); });
  }
  window.QCImport = { open };

  /* ---------- Kartu di halaman Data Input ---------- */
  const frm = document.getElementById('frm');
  const curMod = document.body.dataset.module ? resolveModule() : null;
  if (frm && canImport && curMod) {
    const card = document.createElement('div');
    card.className = 'form-card'; card.id = 'imp';
    frm.insertAdjacentElement('afterend', card);
    build(card, curMod, null);
  }
})();
