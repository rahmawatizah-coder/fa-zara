/* dashboard.js — dipakai dashboard-ftq / scar / redtag.html (data dari Supabase) */
(function () {
  const user = requireLogin();
  if (!user) return;

  const mod = resolveModule();
  if (!mod) return;

  const cfg  = MODULES[mod];
  const perm = PERM[user.role];
  const app  = $('#app');
  const st   = {};          // state filter
  let all = [];             // semua data modul (diambil dari Supabase)
  let gcharts = [];
  const GCOLORS = ['#1fd1b5', '#3b82f6', '#e8892b', '#a855d8', '#22b573', '#e5c12a'];
  const sel = new Set();    // id baris yang dicentang untuk dihapus
  let cleared = false;      // true = tampilan sedang dikosongkan lewat tombol Hapus Data (database TIDAK disentuh)
  let hidden = new Set();   // id baris yang disembunyikan saat Hapus Data (hanya di memori halaman ini)
  let hiddenCount = 0;
  let sig = '';             // "sidik jari" data terakhir, supaya auto-refresh tidak menggambar ulang bila tidak ada perubahan
  let lastLoad = 0;

  // Gaya tambahan: tabel bisa digeser (atas-bawah & kiri-kanan) + dialog Clear Data
  const css = document.createElement('style');
  css.textContent = `
    .tbl-card .tbl-scroll{overflow:auto;max-height:min(70vh,620px);cursor:grab;overscroll-behavior:contain;scrollbar-width:thin}
    .tbl-card .tbl-scroll.dragging{cursor:grabbing;user-select:none}
    .tbl-card .tbl-scroll.dragging *{user-select:none}
    .tbl-card thead th{position:sticky;top:0;z-index:2}
    .tbl-card .head small{color:var(--muted);font-size:12px;font-weight:500}
    .filters .btnrow.wide{grid-column:1/-1;justify-content:flex-end}
    .filters .btnrow.wide .btn,.filters .btnrow.wide #f-clear{flex:0 0 auto;white-space:nowrap;padding:0 18px}
    .tbl-card .head{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
    .tbl-card .head .btn{margin-left:auto;padding:6px 14px}
    .clear-banner{background:#FFF6D6;border:1px solid #F0D27A;color:#7A5A00;border-radius:10px;padding:12px 18px;margin-bottom:18px;font-size:13px}
    .cd-overlay{position:fixed;inset:0;background:rgba(31,41,55,.45);z-index:60;display:flex;align-items:center;justify-content:center;padding:16px}
    .cd-box{width:min(460px,100%);background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:26px 28px;box-shadow:0 12px 32px rgba(17,24,39,.18)}
    .cd-box h3{font-size:18px;margin-bottom:14px}
    .cd-box dl{display:grid;grid-template-columns:auto 1fr;gap:8px 16px;margin-bottom:16px;font-size:14px}
    .cd-box dt{color:var(--muted)} .cd-box dd{font-weight:700}
    .cd-warn{background:#FFF6D6;border:1px solid #F0D27A;color:#7A5A00;border-radius:8px;padding:11px 14px;font-size:13px;line-height:1.5;margin-bottom:18px}
    .cd-actions{display:flex;gap:10px;justify-content:flex-end}
    .cd-opt{display:flex;gap:12px;align-items:flex-start;border:1px solid var(--line);border-radius:10px;padding:12px 14px;margin-bottom:10px;cursor:pointer;font-size:13.5px;line-height:1.45}
    .cd-opt:hover{border-color:var(--accent)}.cd-opt input{margin-top:3px}.cd-opt b{display:block;margin-bottom:2px}
    .cd-opt small{color:var(--muted);font-size:12.5px}
    .cd-opt.sel{border-color:var(--accent);background:var(--soft)}
    /* daftar panjang: bisa di-scroll & di-drag */
    .dscroll{overflow:auto;cursor:grab;overscroll-behavior:contain;scrollbar-width:thin}
    .dscroll.dragging{cursor:grabbing;user-select:none}
    .bars-scroll{max-height:250px;overflow-y:auto;padding-right:8px}
    .chart .hint{font-size:11px;color:var(--muted);margin:-8px 0 10px;font-weight:500;text-transform:none;letter-spacing:0}
    .pie-wrap{display:flex;gap:10px;align-items:center}.pie-wrap.col{flex-direction:column;align-items:stretch}
    .pie-wrap .gbox{flex:1 1 55%;min-width:0;height:230px}.pie-wrap.col .gbox{height:170px;flex:none}
    .pie-legend{flex:1 1 45%;max-height:230px;font-size:12px}.pie-wrap.col .pie-legend{max-height:76px}
    .pie-legend div{display:flex;gap:8px;align-items:center;padding:3px 4px;white-space:nowrap}
    .pie-legend i{width:10px;height:10px;border-radius:2px;flex:none}.pie-legend b{margin-left:auto;padding-left:8px}
    /* Top 3 */
    .t3-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
    .t3-card{all:unset;box-sizing:border-box;cursor:pointer;display:block;background:#FFFBF5;border:1px solid var(--line);border-radius:12px;padding:18px 20px;transition:.15s}
    .t3-card:hover,.t3-card:focus-visible{border-color:var(--accent);transform:translateY(-2px)}
    .t3-card .rk{display:inline-block;font-size:11px;font-weight:700;letter-spacing:1px;padding:3px 9px;border-radius:20px;background:var(--soft);color:var(--accent-d)}
    .t3-card .nm{font-size:18px;font-weight:700;margin:10px 0 2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .t3-card .q{font-size:30px;font-weight:800;line-height:1.1}.t3-card .q small{font-size:12px;color:var(--muted);font-weight:500;margin-left:6px}
    .t3-card .tr{height:7px;background:#eceff3;border-radius:4px;overflow:hidden;margin:12px 0 6px}.t3-card .tr div{height:100%;border-radius:4px}
    .t3-card .go{font-size:12px;color:var(--accent)}
    .dt-box{width:min(980px,100%);max-height:92vh;overflow:auto;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:24px 28px}
    .dt-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:14px 0 18px}
    .dt-stats div{background:#FFFBF5;border:1px solid var(--line);border-radius:10px;padding:12px 14px}
    .dt-stats b{display:block;font-size:22px}.dt-stats span{font-size:11px;color:var(--muted);letter-spacing:.8px;text-transform:uppercase}
    .dt-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:18px}
    .dt-grid .chart{padding:16px 18px;min-height:0}
    .dt-tbl{max-height:260px}
    @media(max-width:900px){.t3-grid,.dt-grid,.dt-stats{grid-template-columns:1fr 1fr}}
    @media(max-width:560px){.t3-grid,.dt-grid,.dt-stats{grid-template-columns:1fr}}
    .f-dates{grid-column:1/-1;display:flex;gap:16px;align-items:end;flex-wrap:wrap;border-top:1px dashed var(--line);padding-top:14px}
    .f-dates>div:not(.f-quick){min-width:190px}.f-quick{display:flex;gap:8px;flex-wrap:wrap}
    /* Red Tag: terbaru per hari + status rework */
    .rt-sec{margin-bottom:24px}
    .rt-bar{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
    .rt-bar select.inp{width:auto;min-width:250px}
    .rt-days{display:flex;gap:8px;flex-wrap:wrap}
    .rt-day{all:unset;box-sizing:border-box;cursor:pointer;font-size:12.5px;padding:6px 12px;border-radius:20px;background:#fff;border:1px solid var(--line);color:var(--text)}
    .rt-day:hover{border-color:var(--accent)}
    .rt-day.on{background:var(--soft);border-color:var(--accent);color:var(--accent-d);font-weight:700}
    .rt-day small{color:var(--muted);margin-left:4px}
    .rt-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:18px}
    .rt-stat{border:1px solid var(--line);border-radius:12px;padding:16px 20px;background:#fff;box-shadow:0 1px 3px rgba(17,24,39,.07);border-left:6px solid}
    .rt-stat.close{border-left-color:#7BD389;background:#F3FBF5}.rt-stat.rework{border-left-color:#5BB8F0;background:#F1F8FE}.rt-stat.open{border-left-color:#FFC15E;background:#FFF9EE}
    button.rt-stat{appearance:none;font:inherit;color:inherit;text-align:left;width:100%;box-sizing:border-box;display:block;cursor:pointer;border-left-width:6px;transition:.15s}
    button.rt-stat.close{border-left-color:#7BD389}button.rt-stat.rework{border-left-color:#5BB8F0}button.rt-stat.open{border-left-color:#FFC15E}
    button.rt-stat:hover,button.rt-stat:focus-visible{transform:translateY(-2px);box-shadow:0 4px 12px rgba(17,24,39,.12)}
    .rt-stat .go{font-size:12px;color:var(--accent-d);margin-top:8px}
    .rt-dsec{border:1px solid var(--line);border-radius:12px;margin-bottom:16px;overflow:hidden}.rt-dsec.hl{border-color:var(--accent);box-shadow:0 0 0 2px var(--soft)}
    .rt-dsec .head{padding:14px 18px;font-weight:700;display:flex;gap:10px;align-items:center;flex-wrap:wrap}.rt-dsec .head small{color:var(--muted);font-weight:500}
    .rt-stat h5{font-size:12px;letter-spacing:.9px;text-transform:uppercase;color:var(--muted);margin-bottom:8px}
    .rt-stat .big{font-size:28px;font-weight:800;line-height:1}.rt-stat .big small{font-size:12px;font-weight:500;color:var(--muted);margin-left:6px}
    .rt-stat .sub2{display:flex;gap:18px;margin-top:10px;font-size:13px;color:var(--muted)}.rt-stat .sub2 b{color:var(--text)}
    @media(max-width:700px){.rt-stats{grid-template-columns:1fr}}
    /* Board SCAR */
    .board .b-row{display:grid;gap:16px;margin-bottom:16px}
    .board .b1{grid-template-columns:1.5fr 1.2fr 1.2fr .8fr;grid-template-rows:400px}.board .b2{grid-template-columns:1fr 1.25fr 1fr 1fr}
    .board .chart{padding:16px 18px;min-height:0;min-width:0}.board .chart h4{text-align:center;margin-bottom:10px}
    .board .gbox{height:328px}.board .b2 .gbox{height:250px}
    .board .pie-wrap .gbox{height:328px}.board .pie-wrap .pie-legend{max-height:328px}.board .pie-wrap.col .gbox{height:170px}
    .b-slicers{display:flex;flex-direction:column;gap:10px;height:400px;min-height:0}
    .slicer{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:10px 12px}
    .slicer h5{font-size:13px;margin-bottom:8px}.slicer h5 small{font-weight:400}.slicer .dr{display:flex;align-items:center;gap:8px;margin-bottom:6px}.slicer .dr span{width:44px;font-size:11px;color:var(--muted);flex:none}.slicer .dr .inp{flex:1;min-width:0}
    .slicer .inp{height:34px;padding:0 8px;font-size:12.5px}.slicer small{color:var(--muted);font-size:11px}
    .slicer.years{flex:1;display:flex;flex-direction:column;min-height:0}
    .slicer .chips{display:flex;flex-direction:column;gap:6px;overflow:auto;flex:1;min-height:0}
    .chip{all:unset;box-sizing:border-box;cursor:pointer;text-align:center;font-size:13px;padding:6px 10px;border-radius:6px;background:#EAF5FD;border:1px solid #BFE0F5;color:#1F6C99}
    .chip.on{background:#5BB8F0;color:#0B3550;font-weight:700;border-color:#5BB8F0}
    .xscroll{overflow-x:auto;overflow-y:hidden;cursor:grab}
    @media(max-width:1200px){.board .b1,.board .b2{grid-template-columns:1fr 1fr}}
    @media(max-width:700px){.board .b1,.board .b2{grid-template-columns:1fr}}`;
  document.head.appendChild(css);

  // Validasi role Engineering ke Supabase (bukan hanya menyembunyikan tombol):
  // sesi login diperiksa server, lalu role dibaca dari tabel qc_roles (dilindungi RLS).
  async function verifyEngineering() {
    const u = getUser();
    if (!u || u.role !== 'input' || !sb) return false;
    try {
      const r = await sb.auth.getUser();
      const uid = r && r.data && r.data.user && r.data.user.id;
      if (!uid) return false;
      const q = await sb.from('qc_roles').select('role').eq('id', uid).maybeSingle();
      return !q.error && !!q.data && q.data.role === 'input';
    } catch (e) { return false; }
  }

  // Dialog konfirmasi Hapus Data (tampilan). onYes dipanggil hanya bila pengguna menyetujui.
  function confirmClear(shownCount, onYes) {
    const ov = document.createElement('div');
    ov.className = 'cd-overlay';
    ov.innerHTML = `<div class="cd-box" role="dialog" aria-modal="true">
      <h3>Hapus Data dari Tampilan</h3>
      <dl><dt>Dashboard</dt><dd>${esc(cfg.name)}</dd>
          <dt>Tabel</dt><dd>${esc(cfg.slug)}</dd>
          <dt>Data ditampilkan</dt><dd>${Number(shownCount).toLocaleString('id-ID')} baris</dd></dl>
      <div class="cd-warn"><b>Perhatian:</b> data hanya dikosongkan dari <b>tampilan</b> dashboard ini, <b>bukan dihapus dari database Supabase</b>.
        Setelah itu dashboard hanya menampilkan data <b>baru</b> yang diinput/diimpor sesudahnya.
        Data lama bisa ditampilkan kembali lewat tombol ⟳ Refresh → "Kembalikan semua data".
        (Untuk menghapus permanen di database, centang baris lalu pakai "Hapus Terpilih".)</div>
      <div class="cd-actions"><button type="button" class="btn" data-cd="no">Batal</button>
        <button type="button" class="btn danger" data-cd="yes">Ya, kosongkan tampilan</button></div></div>`;
    const close = () => { ov.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    ov.addEventListener('mousedown', e => { if (e.target === ov) close(); });
    ov.querySelector('[data-cd="no"]').addEventListener('click', close);
    const yes = ov.querySelector('[data-cd="yes"]');
    yes.addEventListener('click', async () => {
      yes.disabled = true; yes.textContent = 'Memeriksa hak akses…';
      const ok = await verifyEngineering();
      close();
      if (!ok) { toast('Hapus Data tampilan hanya untuk role Engineering.', true); return; }
      onYes();
    });
    document.body.appendChild(ov);
    yes.focus();
  }

  // Dialog pilihan Refresh (hanya muncul saat tampilan sedang dikosongkan). Mengembalikan 'new' | 'all' | null.
  function chooseRefresh() {
    return new Promise(resolve => {
      const ov = document.createElement('div');
      ov.className = 'cd-overlay';
      ov.innerHTML = `<div class="cd-box" role="dialog" aria-modal="true">
        <h3>Refresh Data ${esc(cfg.name)}</h3>
        <p style="font-size:13.5px;color:var(--muted);margin-bottom:14px">Tampilan sedang dikosongkan (${hiddenCount.toLocaleString('id-ID')} baris lama disembunyikan). Pilih yang ingin dilakukan:</p>
        <label class="cd-opt sel"><input type="radio" name="cd-rf" value="new" checked>
          <span><b>Refresh data baru saja</b><small>Ambil data yang baru diinput/diimpor setelah Hapus Data. Data lama tetap tersembunyi.</small></span></label>
        <label class="cd-opt"><input type="radio" name="cd-rf" value="all">
          <span><b>Kembalikan semua data</b><small>Tampilkan lagi seluruh data dari database, termasuk ${hiddenCount.toLocaleString('id-ID')} baris yang tadi dikosongkan.</small></span></label>
        <div class="cd-warn" id="cd-rf-warn"></div>
        <div class="cd-actions"><button type="button" class="btn" data-cd="no">Batal</button>
          <button type="button" class="btn accent" data-cd="yes">Lanjutkan</button></div></div>`;
      const warn = ov.querySelector('#cd-rf-warn');
      const sync = () => {
        const v = ov.querySelector('input[name="cd-rf"]:checked').value;
        ov.querySelectorAll('.cd-opt').forEach(l => l.classList.toggle('sel', l.querySelector('input').checked));
        warn.innerHTML = v === 'all'
          ? '<b>Perhatian:</b> seluruh data lama akan muncul kembali di dashboard dan tampilan "kosong" dibatalkan. Database tidak berubah.'
          : '<b>Info:</b> hanya data baru yang ditampilkan. Database tidak berubah.';
      };
      const done = v => { ov.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
      const onKey = e => { if (e.key === 'Escape') done(null); };
      document.addEventListener('keydown', onKey);
      ov.addEventListener('change', sync);
      ov.addEventListener('mousedown', e => { if (e.target === ov) done(null); });
      ov.querySelector('[data-cd="no"]').addEventListener('click', () => done(null));
      ov.querySelector('[data-cd="yes"]').addEventListener('click', () => done(ov.querySelector('input[name="cd-rf"]:checked').value));
      document.body.appendChild(ov);
      sync();
      ov.querySelector('[data-cd="yes"]').focus();
    });
  }

  // Mengosongkan tampilan: ingat id baris yang ada sekarang, lalu sembunyikan. TIDAK ada operasi tulis/hapus ke Supabase.
  function clearView() {
    hidden = new Set(all.map(r => String(r._id)));
    hiddenCount = hidden.size;
    all = [];
    cleared = true;
    sel.clear();
    render();
    toast('Tampilan ' + cfg.name + ' dikosongkan. Data di database tetap aman — data baru akan muncul otomatis.');
  }

  // Tombol ⟳ Refresh
  async function onRefreshClick() {
    if (!cleared) { await reload(true); toast('Data ' + cfg.name + ' dimuat ulang ✔'); return; }
    const choice = await chooseRefresh();
    if (!choice) return;
    if (choice === 'all') {
      cleared = false; hidden = new Set(); hiddenCount = 0;
      await reload(true);
      toast('Semua data ' + cfg.name + ' ditampilkan kembali ✔');
    } else {
      await reload(true);
      toast(all.length ? all.length + ' data baru ditampilkan ✔' : 'Belum ada data baru sejak tampilan dikosongkan.');
    }
  }

  // Tabel data: tampilkan SEMUA kolom yang diinput (bukan hanya ringkasan), bisa digeser kiri-kanan & atas-bawah
  const numKeys = new Set(['_no', '_year']);
  const allCols = cfg.xl
    ? cfg.xl.map(([k, h]) => { const f = cfg.fields.find(x => x.k === k) || {}; return { k, l: h, t: f.type === 'date' ? 'date' : (f.type === 'number' || numKeys.has(k)) ? 'num' : undefined }; })
    : cfg.fields.map(f => ({ k: f.k, l: f.label, t: f.type === 'date' ? 'date' : f.type === 'number' ? 'num' : undefined }));
  const tblCfg = Object.assign({}, cfg, { cols: allCols });

  const nav = perm.input ? { label: 'Input Data', href: pageInput(mod) } : null;

  /* ---------- RED TAG: tabel terbaru per hari + status Close / Rework ----------
     Status dihitung dari data input (Qty vs Qty Rework):
       Close  = Qty Rework >= Qty            -> seluruh qty selesai (Qty Close = Qty)
       Rework = 0 < Qty Rework < Qty         -> sebagian sudah di-rework (Qty Rework = Qty Rework input, sisanya belum)
       Open   = Qty Rework = 0               -> belum di-rework */
  const rtQ = r => Number(r.qty) || 0, rtW = r => Number(r.qtyrework) || 0;
  const rtStatus = r => (rtW(r) <= 0 ? 'Open' : rtW(r) >= rtQ(r) ? 'Close' : 'Rework');
  const newestFirst = rows => rows.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '') || (Number(b._id) || 0) - (Number(a._id) || 0));
  const fmtDate = d => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || ''); return m ? m[3] + ' ' + MONTHS[+m[2] - 1].slice(0, 3) + ' ' + m[1] : (d || '-'); };
  const tblScroll = h => h.replace('class="tbl-scroll"', 'class="tbl-scroll dscroll"');

  function showRtDetail(rows, focus) {
    const grp = { Open: [], Rework: [], Close: [] };
    rows.forEach(r => grp[rtStatus(r)].push(r));
    const meta = {
      Open:   { t: 'Belum Rework',                note: 'Qty Rework = 0' },
      Rework: { t: 'Sudah Rework, belum keseluruhan', note: '0 < Qty Rework < Qty' },
      Close:  { t: 'Close',                       note: 'Qty Rework ≥ Qty' }
    };
    const cols = [{ k: 'no', l: 'Red Tag No.' }, { k: 'date', l: 'Date', t: 'date' }, { k: 'pn', l: 'Part Number' }, { k: 'project', l: 'Project' }, { k: 'family', l: 'Family' },
      { k: 'reason', l: 'Reason' }, { k: 'qty', l: 'Qty Red Tag', t: 'num' }, { k: 'qrw', l: 'Qty Rework', t: 'num' }, { k: 'sisa', l: 'Sisa', t: 'num' }, { k: 'stt', l: 'Status', t: 'badge' }];
    const sec = key => {
      const list = newestFirst(grp[key]).map(r => ({ no: r.no, date: r.date, pn: r.pn, project: r.project, family: r.family, reason: r.reason,
        qty: rtQ(r), qrw: Math.min(rtW(r), rtQ(r)), sisa: Math.max(0, rtQ(r) - rtW(r)), stt: key }));
      return `<div class="rt-dsec${key === focus ? ' hl' : ''}" data-sec="${key}"><div class="head">${meta[key].t}<small>${list.length} red tag · ${sum(list, 'qty')} pcs · rework ${sum(list, 'qrw')} pcs · sisa ${sum(list, 'sisa')} pcs · ${meta[key].note}</small></div>${tblScroll(renderTable({ cols }, list))}</div>`;
    };
    const ov = document.createElement('div');
    ov.className = 'cd-overlay';
    ov.innerHTML = `<div class="dt-box" role="dialog" aria-modal="true">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px"><h3 style="font-size:22px;margin:0">Detail Status Red Tag</h3>
        <button type="button" class="btn" data-dt="x" style="margin-left:auto">Tutup ✕</button></div>
      ${['Open', 'Rework', 'Close'].map(sec).join('')}</div>`;
    const close = () => { ov.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    ov.addEventListener('mousedown', e => { if (e.target === ov) close(); });
    ov.querySelector('[data-dt="x"]').addEventListener('click', close);
    document.body.appendChild(ov);
    ov.querySelectorAll('.tbl-scroll').forEach(e => e.classList.add('dt-tbl'));
    enableAllDrag(ov);
    const hl = ov.querySelector('.rt-dsec.hl'); if (hl) hl.scrollIntoView({ block: 'start' });
  }

  function rtHTML(rows) {
    // --- 1) Red Tag Terbaru: urut berdasarkan REMARKS yang terakhir diinput/diubah (bukan tanggal) ---
    //     Waktu diisi trigger database (supabase/12-redtag-remarks-terbaru.sql) -> r._ru. Tanpa kolom itu: urut id terbaru.
    const RT_RECENT_MS = 2 * 24 * 60 * 60 * 1000;                          // data terbaru tampil 2 hari, lalu hilang otomatis
    const now = Date.now();
    const recent = rows.filter(r => { const t = r._ru ? new Date(r._ru).getTime() : NaN; return !isNaN(t) && now - t <= RT_RECENT_MS; });
    const byRemarks = recent.sort((a, b) => (b._ru || '').localeCompare(a._ru || '') || (Number(b._id) || 0) - (Number(a._id) || 0));
    const fmtDT = v => { const d = v ? new Date(v) : null; return d && !isNaN(d) ? d.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(/\./g, ':') : '-'; };
    const latestRows = byRemarks.map(r => ({ ...r, _st: rtStatus(r), ru: fmtDT(r._ru) }));
    const dayCols = [
      { k: 'no', l: 'Red Tag No.' }, { k: 'date', l: 'Date', t: 'date' }, { k: 'aptivpn', l: 'Versigent Part Number' }, { k: 'pn', l: 'Part Number' }, { k: 'harness', l: 'Harness Name' }, { k: 'project', l: 'Project' },
      { k: 'family', l: 'Family' }, { k: 'qty', l: 'Qty (Pcs)', t: 'num' }, { k: 'reason', l: 'Reason' }, { k: 'remarks', l: 'Remarks' }, { k: 'ru', l: 'Remarks Diperbarui' },
      { k: 'reworkplan', l: 'Rework Plan' }, { k: 'qtyrework', l: 'Qty Rework', t: 'num' }, { k: '_st', l: 'Status', t: 'badge' }
    ];
    const latest = `<div class="tbl-card rt-sec"><div class="head">Red Tag Terbaru
        <small>${latestRows.length} tag · Qty ${sum(latestRows, 'qty')} pcs · Qty Rework ${sum(latestRows, 'qtyrework')} pcs · hanya input / update Remarks atau Qty dalam 2 hari terakhir (paling atas = terbaru), lalu hilang otomatis</small></div>
      ${latestRows.length ? tblScroll(renderTable({ cols: dayCols }, latestRows)) : '<div class="empty" style="padding:26px 22px">Tidak ada input atau update Remarks dalam 2 hari terakhir.</div>'}</div>`;

    // --- 2) Status Red Tag yang sudah di-rework (Close / Rework) ---
    const grp = { Close: [], Rework: [], Open: [] };
    rows.forEach(r => grp[rtStatus(r)].push(r));
    const cQty = sum(grp.Close, 'qty');
    const wDone = sum(grp.Rework, 'qtyrework'), wLeft = grp.Rework.reduce((a, r) => a + (rtQ(r) - rtW(r)), 0);
    const oQty = sum(grp.Open, 'qty');
    const stats = `<div class="rt-stats">
      <button type="button" class="rt-stat close" data-rtst="Close" title="Klik untuk melihat detail"><h5>Close</h5><div class="big">${cQty}<small>pcs · ${grp.Close.length} red tag</small></div>
        <div class="sub2"><span>Qty Close <b>${cQty}</b></span><span>Qty Rework <b>0</b></span></div><div class="go">Klik untuk detail ›</div></button>
      <button type="button" class="rt-stat rework" data-rtst="Rework" title="Klik untuk melihat detail"><h5>Rework (sebagian)</h5><div class="big">${wDone}<small>pcs · ${grp.Rework.length} red tag</small></div>
        <div class="sub2"><span>Qty Rework <b>${wDone}</b></span><span>Sisa belum <b>${wLeft}</b></span></div><div class="go">Klik untuk detail ›</div></button>
      <button type="button" class="rt-stat open" data-rtst="Open" title="Klik untuk melihat detail"><h5>Belum Rework</h5><div class="big">${oQty}<small>pcs · ${grp.Open.length} red tag</small></div>
        <div class="sub2"><span>Qty Close <b>0</b></span><span>Qty Rework <b>0</b></span></div><div class="go">Klik untuk detail ›</div></button></div>`;
    const stRows = newestFirst(grp.Close.concat(grp.Rework)).map(r => {
      const status = rtStatus(r);
      return { no: r.no, date: r.date, pn: r.pn, project: r.project, family: r.family, qty: rtQ(r),
        qclose: status === 'Close' ? rtQ(r) : 0, qrework: status === 'Rework' ? rtW(r) : 0, sisa: Math.max(0, rtQ(r) - rtW(r)), status };
    });
    const stCols = [
      { k: 'no', l: 'Red Tag No.' }, { k: 'date', l: 'Date', t: 'date' }, { k: 'pn', l: 'Part Number' }, { k: 'project', l: 'Project' }, { k: 'family', l: 'Family' },
      { k: 'qty', l: 'Qty Red Tag', t: 'num' }, { k: 'qclose', l: 'Qty Close', t: 'num' }, { k: 'qrework', l: 'Qty Rework', t: 'num' }, { k: 'sisa', l: 'Sisa', t: 'num' }, { k: 'status', l: 'Status', t: 'badge' }
    ];
    const status = `<div class="rt-sec"><div class="section-title">Status Red Tag yang Sudah di-Rework</div>${stats}
      <div class="tbl-card"><div class="head">Daftar Close &amp; Rework (${stRows.length} red tag)<small>Close = Qty Rework ≥ Qty · Rework = sebagian sudah di-rework</small></div>
      ${tblScroll(renderTable({ cols: stCols }, stRows))}</div></div>`;
    return latest + status;
  }

  function render() {
    const oldScroll = app.querySelector('.tbl-scroll');
    const keep = oldScroll ? [oldScroll.scrollTop, oldScroll.scrollLeft] : null;
    const years = [...new Set(all.map(r => r.date.slice(0, 4)))].sort();
    const monthOpts = MONTHS.map((m, i) => ({ v: String(i + 1).padStart(2, '0'), t: m }));
    const fvals = cfg.filters.map(f => [...new Set(all.map(r => r[f.k]).filter(Boolean))].sort());
    const opt = (vals, sel) => '<option value="">All</option>' + vals.map(v => {
      const val = v.v ?? v, txt = v.t ?? v;
      return `<option value="${esc(val)}" ${String(val) === sel ? 'selected' : ''}>${esc(txt)}</option>`;
    }).join('');

    const board = !!cfg.board;
    const yset = new Set(st.years || []);
    const rows = board
      ? sortRows(all).filter(r =>
          (!st.iFrom || r.date >= st.iFrom) && (!st.iTo || r.date <= st.iTo) &&
          (!st.pFrom || (r.proddate && r.proddate >= st.pFrom)) && (!st.pTo || (r.proddate && r.proddate <= st.pTo)) &&
          (!yset.size || yset.has(r.date.slice(0, 4))))
      : sortRows(all).filter(r =>
          (!st.year  || r.date.slice(0, 4) === st.year) &&
          (!st.month || r.date.slice(5, 7) === st.month) &&
          (!st.dFrom || r.date.slice(0, 10) >= st.dFrom) && (!st.dTo || r.date.slice(0, 10) <= st.dTo) &&
          cfg.filters.every(f => !st[f.k] || r[f.k] === st[f.k]));

    decorate(rows);
    const kpis = board ? [] : cfg.kpis(rows);

    const charts = cfg.charts.map((c, ci) => {
      const m = {};
      rows.forEach(r => {
        const key = r[c.k];
        if (!key) return;
        m[key] = (m[key] || 0) + (c.sum ? (Number(r[c.sum]) || 0) : 1);
      });
      const arr = Object.entries(m).sort((a, b) => b[1] - a[1]);
      if (c.pie) return `<div class="chart"><h4>${c.t}</h4>${arr.length ? `<div class="pie-wrap col"><div class="gbox"><canvas id="c-pie-${ci}"></canvas></div><div class="pie-legend dscroll" id="c-pie-${ci}-lg">${legendHTML(arr.map(e => e[0]), arr.map(e => e[1]))}</div></div>` : '<div class="empty">Tidak ada data</div>'}</div>`;
      const max = arr.length ? arr[0][1] : 1;
      const bars = arr.length
        ? arr.map(([k, v], i) => `<div class="bar-row"><div class="lab" title="${esc(k)}">${esc(k)}</div>
            <div class="track"><div class="fill" style="width:${(v / max * 100).toFixed(1)}%;background:${COLORS[i % COLORS.length]}"></div></div>
            <div class="num">${v}</div></div>`).join('')
        : '<div class="empty">Tidak ada data</div>';
      return `<div class="chart"><h4>${c.t}${arr.length > 7 ? ' <span class="hint">· ' + arr.length + ' item — geser/drag ke bawah</span>' : ''}</h4><div class="bars-scroll dscroll">${bars}</div></div>`;
    }).join('');

    const filterCells = `<div><label>YEAR</label><select class="inp" data-f="year">${opt(years, st.year || '')}</select></div>
        <div><label>MONTH</label><select class="inp" data-f="month">${opt(monthOpts, st.month || '')}</select></div>
        ${cfg.filters.map((f, i) => `<div><label>${f.label.toUpperCase()}</label><select class="inp" data-f="${f.k}">${opt(fvals[i], st[f.k] || '')}</select></div>`).join('')}
        <div class="f-dates"><div><label>DARI TANGGAL</label><input type="date" class="inp" data-b="dFrom" value="${esc(st.dFrom || '')}"></div>
          <div><label>SAMPAI TANGGAL</label><input type="date" class="inp" data-b="dTo" value="${esc(st.dTo || '')}"></div>
          <div class="f-quick"><button type="button" class="chip" data-dq="today">Hari Ini</button><button type="button" class="chip" data-dq="7">7 Hari</button><button type="button" class="chip" data-dq="30">30 Hari</button><button type="button" class="chip" data-dq="month">Bulan Ini</button><button type="button" class="chip" data-dq="clear">Semua Tanggal</button></div></div>`;
    const boardYears = [...new Set(all.map(r => r.date.slice(0, 4)))].sort();
    const boardHTML = !board ? '' : `<div class="board">
      <div class="b-row b1">
        <div class="chart"><h4>Total Scar by Model</h4><div class="pie-wrap"><div class="gbox"><canvas id="b-model"></canvas></div><div class="pie-legend dscroll" id="b-model-lg"></div></div></div>
        <div class="chart"><h4>Total Scar by Family</h4><div class="gbox"><canvas id="b-family"></canvas></div></div>
        <div class="chart"><h4>Total Scar by Month</h4><div class="gbox"><canvas id="b-month"></canvas></div></div>
        <div class="b-slicers">
          <div class="slicer"><h5>Issue Date <small>${st.iFrom || st.iTo ? '· dipilih' : '· All Periods'}</small></h5><div class="dr"><span>Dari</span><input type="date" class="inp" data-b="iFrom" value="${esc(st.iFrom || '')}"></div><div class="dr"><span>Sampai</span><input type="date" class="inp" data-b="iTo" value="${esc(st.iTo || '')}"></div></div>
          <div class="slicer"><h5>Production Date <small>${st.pFrom || st.pTo ? '· dipilih' : '· All Periods'}</small></h5><div class="dr"><span>Dari</span><input type="date" class="inp" data-b="pFrom" value="${esc(st.pFrom || '')}"></div><div class="dr"><span>Sampai</span><input type="date" class="inp" data-b="pTo" value="${esc(st.pTo || '')}"></div></div>
          <div class="slicer years"><h5>Years</h5><div class="chips dscroll">${boardYears.map(y => `<button type="button" class="chip${yset.has(y) ? ' on' : ''}" data-year="${y}">${y}</button>`).join('') || '<small>Tidak ada data</small>'}</div></div>
        </div>
      </div>
      <div class="b-row b2">
        <div class="chart"><h4>Total Scar by Scar Level</h4><div class="gbox"><canvas id="b-level"></canvas></div></div>
        <div class="chart"><h4>Total Scar by Status</h4><div class="xscroll dscroll" id="b-status-x"><div id="b-status-w" style="height:250px"><canvas id="b-status"></canvas></div></div></div>
        <div class="chart"><h4>Total Scar by 4M Analysis</h4><div class="pie-wrap col"><div class="gbox"><canvas id="b-4m"></canvas></div><div class="pie-legend dscroll" id="b-4m-lg"></div></div></div>
        <div class="chart"><h4>Total Scar by Years</h4><div class="gbox"><canvas id="b-years"></canvas></div></div>
      </div>
    </div>`;
    const top3HTML = (!cfg.top3 || board) ? '' : top3Cards(rows);

    app.innerHTML = topbar(cfg.name + ' Dashboard', nav) + `<div class="page">
      <div class="filters"${board ? ' style="grid-template-columns:1fr;padding:12px 20px"' : ''}>
        ${board ? '' : filterCells}
        <div class="btnrow${user.role === 'input' || board ? ' wide' : ''}"><button class="btn" id="f-reset">Reset Filter</button><button class="btn" id="f-refresh" title="Refresh data / kembalikan data">⟳ Refresh</button>${user.role === 'input' ? '<button class="btn" id="f-import" title="Impor data dari file Excel">⬆ Import</button>' : ''}${user.role === 'input' ? '<button class="btn danger" id="f-clear" title="Kosongkan tampilan dashboard saja (database Supabase tidak diubah)">🗑 Hapus Data</button>' : ''}${perm.export ? '<button class="btn green" id="f-export">⬇ Excel</button>' : ''}</div>
      </div>
      ${cleared ? `<div class="clear-banner">Tampilan dikosongkan (${hiddenCount.toLocaleString('id-ID')} baris lama disembunyikan). Data di database Supabase <b>tidak</b> dihapus. Data baru akan muncul otomatis; klik ⟳ Refresh → "Kembalikan semua data" untuk menampilkan semuanya.</div>` : ''}
      ${board ? boardHTML : `<div class="kpis">${kpis.map(k => `<div class="kpi"><div class="v">${k.v}</div><div class="l">${k.l}</div></div>`).join('')}</div>
      ${mod === 'rt' ? rtHTML(rows) : ''}
      ${top3HTML}
      <div class="charts">${charts}</div>
      <div class="graphs">
        <div class="chart"><h4>Tren per Bulan</h4><div class="gbox"><canvas id="g-trend"></canvas></div></div>
        <div class="chart"><h4>${esc(cfg.pie ? cfg.pie.t : 'Komposisi — ' + cfg.charts[0].t)}</h4><div class="pie-wrap col"><div class="gbox"><canvas id="g-pie"></canvas></div><div class="pie-legend dscroll" id="g-pie-lg"></div></div></div>
      </div>`}
      <div class="tbl-card"><div class="head">Data Table (${rows.length} baris)<small>geser / drag tabel (atas-bawah & kiri-kanan) untuk melihat semua data</small>${canDelete() ? '<button type="button" class="btn danger" id="f-delsel" disabled>Hapus Terpilih (0)</button>' : ''}</div>${renderTable(tblCfg, rows, canDelete() ? { select: true, edit: true } : undefined)}</div>
    </div>`;

    bindCommon();
    app.querySelectorAll('[data-dq]').forEach(b => b.addEventListener('click', () => {
      const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      const now = new Date(), q = b.dataset.dq;
      if (q === 'clear') { delete st.dFrom; delete st.dTo; }
      else {
        st.dTo = iso(now);
        st.dFrom = q === 'today' ? iso(now) : q === 'month' ? iso(new Date(now.getFullYear(), now.getMonth(), 1)) : iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - (+q - 1)));
      }
      render();
    }));
    app.querySelectorAll('input[data-b]').forEach(i => i.addEventListener('change', () => { st[i.dataset.b] = i.value; render(); }));
    app.querySelectorAll('.chip[data-year]').forEach(b => b.addEventListener('click', () => {
      const y = b.dataset.year, cur = new Set(st.years || []);
      cur.has(y) ? cur.delete(y) : cur.add(y);
      st.years = [...cur]; render();
    }));
    app.querySelectorAll('[data-rtday]').forEach(b => b.addEventListener('click', () => { st.rtDate = b.dataset.rtday; render(); }));
    app.querySelectorAll('[data-rtst]').forEach(b => b.addEventListener('click', () => showRtDetail(rows, b.dataset.rtst)));
    const rs = app.querySelector('select[data-rtsel]');
    if (rs) rs.addEventListener('change', () => { st.rtDate = rs.value; render(); });
    app.querySelectorAll('.t3-card').forEach(b => b.addEventListener('click', () => showTopDetail(b.dataset.name, Number(b.dataset.rank), rows)));
    app.querySelectorAll('select[data-f]').forEach(s => s.addEventListener('change', () => { st[s.dataset.f] = s.value; render(); }));
    $('#f-reset').addEventListener('click', () => { Object.keys(st).forEach(k => delete st[k]); render(); });
    $('#f-refresh').addEventListener('click', onRefreshClick);
    const ex = $('#f-export');
    if (ex) ex.addEventListener('click', () => exportExcel(mod, rows));
    const cl = $('#f-clear');
    if (cl) cl.addEventListener('click', () => {
      if (user.role !== 'input') return;               // lapis 1 (tampilan); lapis 2: verifyEngineering() saat konfirmasi
      confirmClear(rows.length, clearView);
    });
    const im = $('#f-import');
    if (im) im.addEventListener('click', () => {
      if (window.QCImport) QCImport.open(mod, () => reload(true));
      else toast('excel-import.js belum terpasang di halaman ini.', true);
    });

    app.querySelectorAll('button[data-edit]').forEach(b => b.addEventListener('click', async () => {
      const row = rows.find(r => String(r._id) === b.dataset.edit);
      if (row && canEdit() && await editRow(mod, row)) await reload(true);
    }));
    bindDelete(rows);
    if (board) drawBoard(rows); else drawGraphs(rows);
    const sc = app.querySelector('.tbl-scroll');
    enableAllDrag();
    if (sc && keep) { sc.scrollTop = keep[0]; sc.scrollLeft = keep[1]; }
  }

  // Daftar/tabel bisa di-drag (klik tahan lalu tarik) ke segala arah, selain scroll mouse/trackpad/sentuh biasa
  function enableDragScroll(el) {
    if (el._drag) return; el._drag = true;
    let down = false, moved = false, sx = 0, sy = 0, sl = 0, st0 = 0;
    el.addEventListener('mousedown', e => {
      if (e.button !== 0 || e.target.closest('input,button:not(.t3-card),select,a,label,.chip')) return;
      down = true; moved = false; sx = e.clientX; sy = e.clientY; sl = el.scrollLeft; st0 = el.scrollTop;
    });
    window.addEventListener('mousemove', e => {
      if (!down) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (!moved && Math.abs(dx) + Math.abs(dy) < 4) return;
      moved = true; el.classList.add('dragging');
      el.scrollLeft = sl - dx; el.scrollTop = st0 - dy;
    });
    window.addEventListener('mouseup', () => { down = false; el.classList.remove('dragging'); setTimeout(() => { moved = false; }, 0); });
    el.addEventListener('click', e => { if (moved) { e.stopPropagation(); e.preventDefault(); } }, true);   // selesai drag bukan klik
  }
  const enableAllDrag = root => (root || app).querySelectorAll('.dscroll').forEach(enableDragScroll);

  function bindDelete(rows) {
    const btn = $('#f-delsel');
    if (!btn) return;
    const ids = new Set(rows.map(r => String(r._id)));
    [...sel].forEach(i => { if (!ids.has(String(i))) sel.delete(i); });          // buang pilihan yang sudah tidak tampil
    const boxes = [...app.querySelectorAll('input[data-sel]')];
    const all = app.querySelector('input[data-sel-all]');
    const sync = () => {
      btn.textContent = 'Hapus Terpilih (' + sel.size + ')';
      btn.disabled = sel.size === 0;
      if (all) all.checked = boxes.length > 0 && boxes.every(b => b.checked);
    };
    boxes.forEach(b => {
      b.checked = sel.has(b.dataset.sel);
      b.addEventListener('change', () => { b.checked ? sel.add(b.dataset.sel) : sel.delete(b.dataset.sel); sync(); });
    });
    if (all) all.addEventListener('change', () => {
      boxes.forEach(b => { b.checked = all.checked; all.checked ? sel.add(b.dataset.sel) : sel.delete(b.dataset.sel); });
      sync();
    });
    sync();
    btn.addEventListener('click', async () => {
      if (!canDelete()) return;
      const chosen = rows.filter(r => sel.has(String(r._id)));
      if (!chosen.length) return;
      if (!canPermDelete()) { adminDeleteNotice(); return; }   // Admin: hanya peringatan, harus konfirmasi Engineering
      if (!(await confirmDelete(mod, chosen))) return;
      btn.disabled = true; btn.textContent = 'Menghapus…';
      const { deleted, error } = await deleteRows(mod, chosen.map(r => r._id));
      sel.clear();
      if (error) toast(error.message, true);
      else toast(deleted + ' baris ' + cfg.name + ' dihapus dari database ✔');
      await refresh();
    });
  }

  /* ---------- GRAFIK (Chart.js) ---------- */

  /* ---------- Warna, label angka & legenda ---------- */
  // Palet cerah (bukan gelap, bukan putih, tidak sama dengan oranye logo #CD7925)
  const PIE = ['#5BB8F0', '#7BD389', '#B39DDB', '#F7D154', '#FF8A80', '#4DD0C4', '#F48FB1', '#A5D6A7', '#90CAF9', '#FFCC80', '#C5E17A', '#CE93D8'];
  const pieColor = i => (i < PIE.length ? PIE[i] : 'hsl(' + ((i * 47) % 360) + ' 55% 52%)');
  const legendHTML = (labels, data) => labels.map((l, i) => `<div title="${esc(l)}"><i style="background:${pieColor(i)}"></i><span>${esc(l)}</span><b>${data[i]}</b></div>`).join('');

  // Plugin kecil: menulis angka di atas batang / titik garis / persen di irisan pie
  const valueLabels = {
    id: 'valueLabels',
    afterDatasetsDraw(chart) {
      const ctx = chart.ctx, type = chart.config.type, horiz = chart.options.indexAxis === 'y';
      ctx.save();
      ctx.font = '600 11px Inter, system-ui, sans-serif';
      ctx.textBaseline = 'middle';
      chart.data.datasets.forEach((ds, di) => {
        const meta = chart.getDatasetMeta(di);
        const tot = ds.data.reduce((a, b) => a + (Number(b) || 0), 0) || 1;
        meta.data.forEach((el, i) => {
          const v = ds.data[i];
          if (v == null) return;
          if (type === 'pie' || type === 'doughnut') {
            const pct = v / tot * 100;
            if (pct < 6) return;
            const pos = el.tooltipPosition();
            ctx.textAlign = 'center'; ctx.fillStyle = '#1f2937';
            ctx.fillText(Math.round(pct) + '%', pos.x, pos.y);
          } else if (horiz) {
            ctx.textAlign = 'left'; ctx.fillStyle = '#374151'; ctx.fillText(v, el.x + 5, el.y);
          } else {
            ctx.textAlign = 'center'; ctx.fillStyle = '#374151'; ctx.fillText(v, el.x, el.y - 10);
          }
        });
      });
      ctx.restore();
    }
  };

  /* ---------- Top 3 (FTQ) ---------- */
  function topList(rows) {
    const t = cfg.top3, m = {};
    rows.forEach(r => { const k = r[t.k]; if (k) m[k] = (m[k] || 0) + (t.sum ? (Number(r[t.sum]) || 0) : 1); });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }
  function top3Cards(rows) {
    const list = topList(rows), total = list.reduce((a, e) => a + e[1], 0) || 1, top = list.slice(0, 3);
    const colors = ['#FF8A80', '#FFC15E', '#F7D154'];
    const body = top.length ? top.map(([k, v], i) => `<button type="button" class="t3-card" data-name="${esc(k)}" data-rank="${i + 1}" title="Klik untuk melihat detail">
        <span class="rk">TOP ${i + 1}</span><div class="nm">${esc(k)}</div>
        <div class="q">${v}<small>pcs · ${(v / total * 100).toFixed(1)}% dari total defect</small></div>
        <div class="tr"><div style="width:${(v / top[0][1] * 100).toFixed(1)}%;background:${colors[i]}"></div></div>
        <div class="go">Klik untuk detail ›</div></button>`).join('') : '<div class="empty">Tidak ada data</div>';
    return `<div class="chart" style="margin-bottom:24px;min-height:0"><h4>${esc(cfg.top3.t)} <span class="hint">· klik salah satu untuk melihat detailnya</span></h4><div class="t3-grid">${body}</div></div>`;
  }
  function showTopDetail(name, rank, rows) {
    const t = cfg.top3;
    const mine = rows.filter(r => r[t.k] === name);
    const totalAll = rows.reduce((a, r) => a + (t.sum ? (Number(r[t.sum]) || 0) : 1), 0) || 1;
    const qty = mine.reduce((a, r) => a + (t.sum ? (Number(r[t.sum]) || 0) : 1), 0);
    const dates = mine.map(r => r.date).sort();
    const dims = ['model', 'family', 'shift', 'area', 'pn', 'posisi', 'desc']
      .filter(k => k !== t.k && cfg.fields.some(f => f.k === k) && mine.some(r => r[k]));
    const lab = k => (cfg.fields.find(f => f.k === k) || {}).label || k;
    const lists = dims.map(k => {
      const m = {};
      mine.forEach(r => { const v = r[k]; if (v) m[v] = (m[v] || 0) + (t.sum ? (Number(r[t.sum]) || 0) : 1); });
      const arr = Object.entries(m).sort((a, b) => b[1] - a[1]), max = arr[0][1];
      return `<div class="chart"><h4>Per ${esc(lab(k))} <span class="hint">· ${arr.length} item</span></h4><div class="bars-scroll dscroll">${arr.map(([x, v], i) =>
        `<div class="bar-row"><div class="lab" title="${esc(x)}">${esc(x)}</div><div class="track"><div class="fill" style="width:${(v / max * 100).toFixed(1)}%;background:${COLORS[i % COLORS.length]}"></div></div><div class="num">${v}</div></div>`).join('')}</div></div>`;
    }).join('');
    const cols = [{ k: 'date', l: 'Date', t: 'date' }, { k: 'model', l: 'Model' }, { k: 'family', l: 'Family' }, { k: 'subfamily', l: 'Sub Family' },{ k: 'pn', l: 'P/N' }, { k: 'shift', l: 'Shift' }, { k: 'desc', l: 'Problem Description' }, { k: 'area', l: 'Area' }, { k: 'posisi', l: 'Position' }, { k: 'qty', l: 'Qty', t: 'num' }]
      .filter(c => mine.some(r => r[c.k] !== undefined && r[c.k] !== ''));
    const ov = document.createElement('div');
    ov.className = 'cd-overlay';
    ov.innerHTML = `<div class="dt-box" role="dialog" aria-modal="true">
      <div style="display:flex;align-items:center;gap:12px"><span style="font-size:11px;font-weight:700;padding:3px 9px;border-radius:20px;background:var(--soft);color:var(--accent-d)">TOP ${rank}</span>
        <h3 style="font-size:22px;margin:0">${esc(name)}</h3><button type="button" class="btn" data-dt="x" style="margin-left:auto">Tutup ✕</button></div>
      <div class="dt-stats"><div><b>${qty}</b><span>Total Qty (pcs)</span></div><div><b>${mine.length}</b><span>Jumlah kejadian</span></div>
        <div><b>${(qty / totalAll * 100).toFixed(1)}%</b><span>Dari total defect</span></div><div><b style="font-size:15px;padding-top:6px">${dates.length ? esc(dates[0]) + ' → ' + esc(dates[dates.length - 1]) : '-'}</b><span>Periode kejadian</span></div></div>
      <div class="dt-grid">${lists || '<div class="empty">Tidak ada rincian</div>'}</div>
      <div class="tbl-card"><div class="head">Daftar kejadian ${esc(name)} (${mine.length} baris)<small>geser / drag untuk melihat semua</small></div>${renderTable({ cols }, mine)}</div></div>`;
    const close = () => { ov.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    ov.addEventListener('mousedown', e => { if (e.target === ov) close(); });
    ov.querySelector('[data-dt="x"]').addEventListener('click', close);
    document.body.appendChild(ov);
    ov.querySelectorAll('.tbl-scroll').forEach(e => e.classList.add('dscroll', 'dt-tbl'));
    enableAllDrag(ov);
  }

  /* ---------- Board SCAR (sesuai tampilan Power BI) ---------- */
  function drawBoard(rows) {
    gcharts.forEach(c => c.destroy());
    gcharts = [];
    if (!window.Chart) { app.querySelectorAll('.board canvas').forEach(c => { c.parentElement.innerHTML = '<div class="empty">Chart.js tidak termuat.</div>'; }); return; }
    Chart.defaults.color = '#4b5563';
    Chart.defaults.borderColor = '#eceff3';
    Chart.defaults.font.family = 'Inter, system-ui, sans-serif';
    const BL = '(blank)';
    const count = fn => { const m = new Map(); rows.forEach(r => { const k = fn(r) || BL; m.set(k, (m.get(k) || 0) + 1); }); return [...m.entries()]; };
    const byLabel = a => a.sort((x, y) => (x[0] === BL ? -1 : y[0] === BL ? 1 : String(x[0]).localeCompare(String(y[0]), undefined, { numeric: true })));
    const byCount = a => a.sort((x, y) => y[1] - x[1]);
    const short = (t, n) => (String(t).length > n ? String(t).slice(0, n - 1) + '…' : t);
    const mk = (id, type, entries, color, extra) => {
      const el = $('#' + id); if (!el) return null;
      const c = new Chart(el, {
        type, plugins: [valueLabels],
        data: { labels: entries.map(e => e[0]), datasets: [Object.assign({ data: entries.map(e => e[1]) }, color)] },
        options: Object.assign({ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }, extra || {})
      });
      gcharts.push(c); return c;
    };
    const barScales = { x: { grid: { display: false }, ticks: { callback(v) { return short(this.getLabelForValue(v), 12); } } }, y: { beginAtZero: true, grace: '12%', ticks: { precision: 0 } } };

    // 1) Model (pie + legenda yang bisa di-scroll)
    const model = byCount(count(r => r.model));
    mk('b-model', 'pie', model, { backgroundColor: model.map((e, i) => pieColor(i)), borderColor: '#ffffff', borderWidth: 1 });
    $('#b-model-lg').innerHTML = legendHTML(model.map(e => e[0]), model.map(e => e[1]));
    // 2) Family (kolom merah)
    mk('b-family', 'bar', byLabel(count(r => r.family)), { backgroundColor: '#FF8A80', maxBarThickness: 36 }, { scales: barScales });
    // 3) Month (batang horizontal, Jan di bawah)
    const mc = Array(12).fill(0); rows.forEach(r => { const m = +r.date.slice(5, 7); if (m) mc[m - 1]++; });
    mk('b-month', 'bar', MONTHS.map((m, i) => [m.slice(0, 3), mc[i]]).reverse(), { backgroundColor: '#90CAF9', maxBarThickness: 16 },
      { indexAxis: 'y', scales: { x: { beginAtZero: true, grace: '12%', ticks: { precision: 0 } }, y: { grid: { display: false } } } });
    // 4) Scar Level (kolom)
    mk('b-level', 'bar', byLabel(count(r => r.level)), { backgroundColor: '#90CAF9', maxBarThickness: 40 }, { scales: barScales });
    // 5) Status (garis; kategori banyak -> area bisa digeser/drag ke samping)
    const status = byLabel(count(r => r.status));
    const w = $('#b-status-w'); if (w) { w.style.width = Math.max(status.length * 70, 100) + 'px'; w.style.minWidth = '100%'; }
    mk('b-status', 'line', status, { borderColor: '#5BB8F0', backgroundColor: '#5BB8F0', pointRadius: 4, borderWidth: 3, tension: 0 },
      { scales: { x: { grid: { display: false }, ticks: { autoSkip: false, maxRotation: 55, minRotation: 55, callback(v) { return short(this.getLabelForValue(v), 16); } } }, y: { beginAtZero: true, grace: '12%', ticks: { precision: 0 } } } });
    // 6) 4M Analysis (pie)
    const m4 = byCount(count(r => r.analysis));
    mk('b-4m', 'pie', m4, { backgroundColor: m4.map((e, i) => pieColor(i + 3)), borderColor: '#ffffff', borderWidth: 1 });
    $('#b-4m-lg').innerHTML = legendHTML(m4.map(e => e[0]), m4.map(e => e[1]));
    // 7) Years (kolom merah)
    mk('b-years', 'bar', count(r => r.date.slice(0, 4)).sort((a, b) => a[0].localeCompare(b[0])), { backgroundColor: '#FF8A80', maxBarThickness: 44 }, { scales: barScales });
    enableAllDrag();
  }

  function drawGraphs(rows) {
    gcharts.forEach(c => c.destroy());
    gcharts = [];

    if (!window.Chart) {
      ['g-trend', 'g-pie'].forEach(id => {
        const el = $('#' + id);
        if (el) el.parentElement.innerHTML = '<div class="empty">Chart.js tidak termuat. Cek koneksi internet & baris &lt;script&gt; Chart.js di file HTML.</div>';
      });
      return;
    }

    Chart.defaults.color = '#4b5563';
    Chart.defaults.borderColor = '#eceff3';
    Chart.defaults.font.family = 'Inter, system-ui, sans-serif';

    const c0 = cfg.charts[0];
    const sumKey = c0.sum;
    const val = r => sumKey ? (Number(r[sumKey]) || 0) : 1;
    const yLabel = sumKey ? 'Total Qty' : 'Jumlah Data';

    // 0) Grafik lingkaran per kategori (chart dengan pie:true di config.js, mis. Defect by Model)
    cfg.charts.forEach((c, ci) => {
      const el = $('#c-pie-' + ci); if (!el) return;
      const m = {};
      rows.forEach(r => { const k = r[c.k]; if (k) m[k] = (m[k] || 0) + (c.sum ? (Number(r[c.sum]) || 0) : 1); });
      const e = Object.entries(m).sort((a, b) => b[1] - a[1]);
      gcharts.push(new Chart(el, {
        type: 'pie', plugins: [valueLabels],
        data: { labels: e.map(x => x[0]), datasets: [{ data: e.map(x => x[1]), backgroundColor: e.map((x, i) => pieColor(i)), borderColor: '#ffffff', borderWidth: 2 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
      }));
      enableAllDrag(el.closest('.chart'));
    });

    // 1) Tren per bulan
    const byMonth = {};
    rows.forEach(r => { const ym = r.date.slice(0, 7); byMonth[ym] = (byMonth[ym] || 0) + val(r); });
    const keys = Object.keys(byMonth).sort();
    const labels = [], data = [];
    if (keys.length) {
      let [y, m] = keys[0].split('-').map(Number);
      const [ey, em] = keys[keys.length - 1].split('-').map(Number);
      while (y < ey || (y === ey && m <= em)) {
        const k = y + '-' + String(m).padStart(2, '0');
        labels.push(MONTHS[m - 1].slice(0, 3) + ' ' + y);
        data.push(byMonth[k] || 0);
        m++; if (m > 12) { m = 1; y++; }
      }
    }
    gcharts.push(new Chart($('#g-trend'), {
      type: 'bar',                                        // ganti 'line' untuk grafik garis
      data: { labels, datasets: [{ label: yLabel, data, backgroundColor: '#7CC4F4', borderColor: '#7CC4F4', borderRadius: 6, maxBarThickness: 48, tension: 0.3 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
      }
    }));

    // 2) Komposisi. FTQ: lingkaran (pie) jumlah defect Position IB vs ROB (cfg.pie); modul lain: doughnut per grafik pertama
    const pc = cfg.pie || c0;
    const pval = r => pc.sum ? (Number(r[pc.sum]) || 0) : 1;
    const norm = v => String(v ?? '').trim();
    const comp = {};
    if (pc.only) pc.only.forEach(k => { comp[k] = 0; });                 // IB & ROB selalu tampil walau salah satunya 0
    rows.forEach(r => {
      let k = norm(r[pc.k]); if (!k) return;
      if (pc.only) { const hit = pc.only.find(o => o.toUpperCase() === k.toUpperCase()); if (!hit) return; k = hit; }
      comp[k] = (comp[k] || 0) + pval(r);
    });
    const entries = Object.entries(comp).sort((a, b) => b[1] - a[1]);
    const noData = !entries.some(e => e[1] > 0);
    const POS_COLOR = { IB: '#5BB8F0', ROB: '#7BD389' };                 // warna tetap: IB biru muda, ROB hijau muda
    const sliceColor = (k, i) => (pc.only && POS_COLOR[k]) || pieColor(i);
    gcharts.push(new Chart($('#g-pie'), {
      type: cfg.pie ? 'pie' : 'doughnut',
      plugins: [valueLabels],
      data: {
        labels: entries.map(e => e[0]),
        datasets: [{ data: noData ? [] : entries.map(e => e[1]), backgroundColor: entries.map((e, i) => sliceColor(e[0], i)), borderColor: '#ffffff', borderWidth: 2 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: cfg.pie ? 0 : '60%',
        plugins: { legend: { display: false } }
      }
    }));
    const lg = $('#g-pie-lg');
    if (lg) {
      lg.innerHTML = entries.map((e, i) => `<div title="${esc(e[0])}"><i style="background:${sliceColor(e[0], i)}"></i><span>${esc(e[0])}</span><b>${e[1]}</b></div>`).join('');
      enableAllDrag(lg.parentElement);
    }
  }

  // Ambil data dari database. Bila tampilan sedang dikosongkan, baris lama tetap disembunyikan (hanya data baru yang tampil).
  // force=false (auto-refresh): menggambar ulang hanya bila datanya berubah.
  async function reload(force) {
    const rows = await loadData(mod);
    lastLoad = Date.now();
    const shown = cleared ? rows.filter(r => !hidden.has(String(r._id))) : rows;
    const nsig = shown.length + '|' + shown.map(r => r._id).join(',');
    if (!force && nsig === sig) return;
    sig = nsig;
    all = shown;
    render();
  }
  const refresh = () => reload(true);

  // Data selalu mengikuti database: muat ulang saat halaman kembali dilihat (mis. setelah hapus/input di halaman lain)
  const stale = () => !document.hidden && Date.now() - lastLoad > 8000 && !$('.cd-overlay') && !$('.dx-ov') && !$('#imp-modal');
  window.addEventListener('pageshow', e => { if (e.persisted) reload(false); });
  document.addEventListener('visibilitychange', () => { if (stale()) reload(false); });
  window.addEventListener('focus', () => { if (stale()) reload(false); });
  setInterval(() => { if (stale()) reload(false); }, 30000);

  // Tampilan awal sambil memuat data
  app.innerHTML = topbar(cfg.name + ' Dashboard', nav) + '<div class="page"><div class="empty" style="padding:40px">Memuat data...</div></div>';
  bindCommon();
  refresh();
})();
