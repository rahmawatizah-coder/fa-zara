/* config.js — Supabase, akun, hak akses, dan definisi modul */

/* ---------- SUPABASE ---------- */
/* Isi dua nilai ini dari Supabase: Settings -> API Keys (Project URL + Publishable key) */
const SUPABASE_URL = 'https://wqcidshhuennmlgpcgds.supabase.co';
const SUPABASE_KEY = 'sb_publishable_gt4wWjfASygA5OPGip9nnw_E0Juk_KP';

/* ---------- AKUN & HAK AKSES ---------- */
/* Password TIDAK lagi di sini: disimpan aman di Supabase Auth */
const ACCOUNTS = {
  admin:      { username: 'admin',         email: 'admin@qc-demo.com'       },
  input:      { username: 'Engineering',   email: 'maintenance@qc-demo.com', alias: ['Engineering Maintenance', 'Maintenance'] },
  supervisor: { username: 'supervisor',    email: 'supervisor@qc-demo.com'  },
  other:      { username: null,            email: null                      }
};
const ROLE_LABEL = { admin: 'Admin', input: 'Engineering', supervisor: 'Supervisor', other: 'Other' };

const PERM = {
  admin:      { input: true,  export: true  },
  input:      { input: true,  export: true  },
  supervisor: { input: false, export: true  },
  other:      { input: false, export: false }
};

/* ---------- UMUM ---------- */
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const COLORS = ['#5BB8F0','#7BD389','#B39DDB','#F7D154','#FF8A80','#4DD0C4'];   // palet cerah untuk batang grafik
const sum    = (rows, k) => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0);
const uniq   = (rows, k) => new Set(rows.map(r => r[k]).filter(Boolean)).size;

/* ---------- DEFINISI MODUL ---------- */
const MODULES = {
  ftq: {
    name: 'FTQ', slug: 'ftq', storeKey: 'ftq_data_v1', prefix: null,
    top3: { t: 'Top 3 Defect', k: 'problem', sum: 'qty' },
    pie: { t: 'Jumlah Defect by Position (IB vs ROB)', k: 'posisi', sum: 'qty', only: ['IB', 'ROB'] },   // pengganti grafik komposisi by model
    afterSubmit: 'menu',   // setelah Submit Entry -> kembali ke menu
    desc: 'First Time Quality: catat defect wire harness per model, family, dan problem.',
    filters: [{ k: 'family', label: 'Family' }, { k: 'model', label: 'Model Harness' }],
    kpis: r => [
      { v: uniq(r, 'model'),   l: 'Total Model' },
      { v: sum(r, 'qty'),      l: 'Total Defect' },
      { v: uniq(r, 'problem'), l: 'Total Problem' },
      { v: uniq(r, 'family'),  l: 'Total Family' }
    ],
    charts: [
      { t: 'Defect by Model',   k: 'model',   sum: 'qty', pie: true },
      { t: 'Defect by Problem', k: 'problem', sum: 'qty' },
      { t: 'Defect by Family',  k: 'family',  sum: 'qty' }
    ],
    fields: [
      { k: 'date',    label: 'Date Occurred',       type: 'date',   req: 1, def: 'today' },
      { k: 'model',   label: 'Model Harness',       type: 'select', req: 1, opts: ['VF5','VF6','VF7','VF8','VF9','Minivan','VF5 NP','VF6 RHD','VF7 RHD','VF8 NP','VF9 NP','VF WILD','BRP'] },
      { k: 'family',  label: 'Family',              type: 'select', req: 1, other: 'Other', opts: ['Engine','Body','Small','IP','Other'] },
      { k: 'pn',      label: 'P/N Harness',         type: 'text',   req: 1 },
      { k: 'shift',   label: 'Shift',               type: 'select', req: 1, opts: ['Shift 1','Shift 2'] },
      { k: 'problem', label: 'Problem',             type: 'select', req: 1, opts: ['Cross Wire','Damage','Orientation','Unseated','Missing','Others','Dimension'] },
      { k: 'desc',    label: 'Problem Description', type: 'text',   req: 1 },
      { k: 'area',    label: 'Area',                type: 'text',   req: 1 },
      { k: 'qty',     label: 'Qty Defect',          type: 'number', req: 1, def: 1 },
      { k: 'root',    label: 'Root Cause',          type: 'text' },
      { k: 'action',  label: 'Corrective Action',   type: 'text' },
      { k: 'serial',  label: 'No.Serial',           type: 'text',   def: 'N/A' },
      { k: 'posisi',  label: 'Position',            type: 'select', req: 1, opts: ['IB','ROB'] },
      { k: 'subfamily', label: 'Sub Family',        type: 'select', other: 'Others', opts: ['FR Door','FL Door','RR Door','RL Door','BK Door','Drive Door','Pass Door','Tailgate RH','Tailgate LH','Cabin','Front','Floor','Underbody','Front Bumper','Rear Bumper','Roof','Ceiling','Console','Seat','Others'] }
    ],
    cols: [
      { k: 'date', l: 'Date Occurred', t: 'date' }, { k: 'model', l: 'Model Harness' }, { k: 'family', l: 'Family' },
      { k: 'problem', l: 'Problem' }, { k: 'desc', l: 'Problem Description' }, { k: 'area', l: 'Area' },
      { k: 'qty', l: 'Qty Defect', t: 'num' }
    ],
    seed: [
      ['2026-08-25','VF6','Engine','Cross Wire','Cross Wire cav 8,12 C038','C038',1],
      ['2026-07-10','VF9','IP','Unseated','Unseated cav 16 K03','K03',1],
      ['2026-07-09','VF8','Small','Cross Wire','Cross Wire cav 1-2 C001DF','C001DF',2],
      ['2026-06-08','VF7','Engine','Damage','Damage C453','C453',2],
      ['2026-06-07','VF6','Engine','Damage','Damage C238','C238',4],
      ['2026-06-06','VF6','Engine','Broken Wire','Broken Wire C117','C117',1],
      ['2026-05-05','VF5','Body','Cross Wire','Cross Wire cav 2-3 K26','K26',3],
      ['2026-05-04','VF5','Small','Damage Connector','Damage Conn M01','M01',1],
      ['2026-05-03','Minivan','Body','Damage Connector','Damage C001','C001',2],
      ['2026-05-02','Minivan','Small','Cross Wire','Cross Wire cav 2,6 D001','D001',1]
    ].map(a => ({ date: a[0], model: a[1], family: a[2], pn: '-', shift: 'Shift 1', problem: a[3], desc: a[4], area: a[5], qty: a[6], root: '', action: '', owner: '' }))
  },

  scar: {
    name: 'SCAR', slug: 'scar', storeKey: 'scar_data_v1', prefix: 'SCAR-', idKey: 'no',
        board: true,
    desc: 'Supplier Corrective Action Request: lacak keluhan ke supplier sampai status Closed.',
    filters: [{ k: 'family', label: 'Family' }, { k: 'model', label: 'Model' }, { k: 'status', label: 'Status' }],
    kpis: r => [
      { v: r.length,                                                      l: 'Total SCAR' },
      { v: r.filter(x => /^open/i.test(x.status || '')).length,           l: 'Open' },
      { v: r.filter(x => /^waiting/i.test(x.status || '')).length,        l: 'Waiting SQM' },
      { v: r.filter(x => /^closed/i.test(x.status || '')).length,         l: 'Closed' }
    ],
    charts: [
      { t: 'SCAR by Model',       k: 'model' },
      { t: 'SCAR by Level',       k: 'level' },
      { t: 'SCAR by Status',      k: 'status' },
      { t: 'SCAR by Family',      k: 'family' },
      { t: 'SCAR by Date',        k: 'date' },
      { t: '4M Analysis',         k: 'analysis' }
    ],
    /* Urutan & nama field = urutan & judul kolom Excel (impor/ekspor) */
    fields: [
      { k: 'no',       label: 'SCAR No.',            type: 'text',   req: 1, def: 'auto' },
      { k: 'date',     label: 'Issue Date',          type: 'date',   req: 1, def: 'today' },
      { k: 'level',    label: 'SCAR Level',          type: 'select', req: 1, opts: ['A','B','C','I'] },
      { k: 'model',    label: 'Model',               type: 'select', req: 1, opts: ['VF5','VF6','VF7','VF8','VF9','Minivan','VF5 NP','VF6 RHD','VF7 RHD','VF8 NP','VF9 NP','VF WILD','BRP'] },
      { k: 'family',   label: 'Family',              type: 'select', req: 1, other: 'Other', opts: ['Engine','Body','Small','IP','Other'] },
      { k: 'proddate', label: 'Production Date',     type: 'date' },
      { k: 'harness',  label: 'Harness',             type: 'text' },
      { k: 'pn',       label: 'P/N',                 type: 'text',   req: 1 },
      { k: 'event',    label: 'Event',               type: 'text' },
      { k: 'desc',     label: 'Problem Description', type: 'text',   req: 1 },
      { k: 'analysis', label: '4M Analysis',         type: 'select', req: 1, opts: ['Man','Machine','Material','Method','N/A'] },
      { k: 'root',     label: 'Detail Root Cause',   type: 'text' },
      { k: 'qty',      label: 'Qty Case',            type: 'number', req: 1, def: 1 },
      { k: 'action',   label: 'Action Plan',         type: 'text' },
      { k: 'status',   label: 'Status',              type: 'select', req: 1, opts: ['Open','Closed with specified reason','Waiting for SQM approval','Closed with countermeasure','Closed','Open without containment','N/A'] },
      { k: 'supplier', label: 'Supplier',            type: 'text' },
      { k: 'due',      label: 'Due Date',            type: 'date' }
    ],
    /* Format file Excel (ekspor = impor). Kunci berawalan "_" dihitung otomatis dari Issue Date / urutan baris. */
    xl: [
      ['_no','No.'], ['_month','Month'], ['date','Issue Date'], ['no','SCAR No.'], ['level','SCAR Level'], ['model','Model'],
      ['family','Family'], ['proddate','Production Date'], ['harness','Harness'], ['pn','P/N'], ['event','Event'],
      ['desc','Problem Description'], ['analysis','4M Analysis'], ['root','Detail Root Cause'], ['qty','Qty Case'],
      ['action','Action Plan'], ['_year','Years'], ['status','Status']
    ],
    cols: [
      { k: 'no', l: 'SCAR No.' }, { k: 'date', l: 'Issue Date', t: 'date' }, { k: 'level', l: 'SCAR Level', t: 'badge' },
      { k: 'model', l: 'Model' }, { k: 'family', l: 'Family' }, { k: 'pn', l: 'P/N' },
      { k: 'desc', l: 'Problem Description' }, { k: 'qty', l: 'Qty Case', t: 'num' }, { k: 'status', l: 'Status', t: 'badge' }
    ],
    seed: [
      ['SCAR-001','2026-05-06','CBL-1001','Insulation crack','A','Closed'],
      ['SCAR-002','2026-05-20','CN-220','Terminal bent','B','Closed'],
      ['SCAR-003','2026-06-11','CBL-1005','Wire gauge out of spec','C','Open']
    ].map(a => ({ no: a[0], date: a[1], pn: a[2], desc: a[3], qty: 1, level: a[4], root: '', action: '', harness: '', status: a[5] }))
  },

    rt: {
    name: 'Red Tag', slug: 'redtag', storeKey: 'rt_data_v1', prefix: 'RT-', idKey: 'no',
    desc: 'Daily Red Tag Check: part/harness yang ditahan beserta alasan, remarks, dan rencana rework.',
    filters: [{ k: 'project', label: 'Project' }, { k: 'family', label: 'Family' }],
    kpis: r => [
      { v: r.length,                                         l: 'Total Red Tag' },
      { v: sum(r, 'qty'),                                    l: 'Total Qty (Pcs)' },
      { v: sum(r, 'qtyrework'),                              l: 'Qty Rework' },
      { v: Math.max(0, sum(r, 'qty') - sum(r, 'qtyrework')), l: 'Sisa Qty' }
    ],
    pie: { t: 'Red Tag by Project (Qty)', k: 'project', sum: 'qty' },   // grafik lingkaran (menggantikan batang & komposisi by project)
    charts: [
      { t: 'Red Tag by Family (Qty)',  k: 'family',  sum: 'qty' },
      { t: 'Red Tag by Reason',        k: 'reason' }
    ],
    fields: [
      { k: 'no',        label: 'Red Tag No.',        type: 'text',   req: 1, def: 'auto' },
      { k: 'date',      label: 'Date',               type: 'date',   req: 1, def: 'today' },
      { k: 'aptivpn',   label: 'Versigent Part Number', type: 'text' },
      { k: 'pn',        label: 'Part Number (EEP)',  type: 'text',   req: 1 },
      { k: 'harness',   label: 'Harness Name',       type: 'text' },
      { k: 'project',   label: 'Project',            type: 'select', req: 1, other: 'Other', opts: ['VF5','VF5NP','VF6','VF6 RHD','VF7','VF7 RHD','VF8','VF8NP','VF9','VFWild','VFe34','MINI VAN','MHU','MMC','Other'] },
      { k: 'family',    label: 'Family',             type: 'select', req: 1, other: 'Other', opts: ['1. Body','2. IP','3. Front end','4. Under body','5. Tailgate RH','6. Tailgate LH','7. CHMSL','8. Bumper FR','9. Bumper RR','10. Door FR RH','11. Door FR LH','12. Door RR RH','13. Door RR LH','14. Door BK','15. Console','16. Roof','17. SRR Pigtail','18. Impact Sensor','19. RR USB','20. Water Pump','21. HV Battery','22. HV Heater','23. HV Comp','24. Small Battery','MHU Pigtail','SML','HV','Engine','Small','Baterai PDU','Other'] },
      { k: 'qty',       label: 'Qty (Pcs)',          type: 'number', req: 1, def: 1 },
      { k: 'reason',    label: 'Reason',             type: 'text',   req: 1 },
      { k: 'remarks',   label: 'Remarks',            type: 'text' },
      { k: 'reworkplan',label: 'Rework Plan',        type: 'text' },
      { k: 'qtyrework', label: 'Qty Rework',         type: 'number', def: 0 }
    ],
    xlTitle: 'DAILY RED TAG CHECK',
    xlSheet: 'RED TAG LIST',
    xl: [
      ['_no','No'], ['aptivpn','Versigent Part Number'], ['pn','Part Number'], ['harness','Harness Name'], ['project','Project'], ['family','Family'],
      ['qty','Qty (Pcs)'], ['reason','Reason'], ['remarks','Remarks'], ['reworkplan','Rework Plan'], ['qtyrework','Qty Rework'], ['date','Date']
    ],
    cols: [
      { k: 'no', l: 'Red Tag No.' }, { k: 'date', l: 'Date', t: 'date' }, { k: 'aptivpn', l: 'Versigent Part Number' }, { k: 'pn', l: 'Part Number' }, { k: 'harness', l: 'Harness Name' },
      { k: 'project', l: 'Project' }, { k: 'family', l: 'Family' }, { k: 'qty', l: 'Qty (Pcs)', t: 'num' },
      { k: 'reason', l: 'Reason' }, { k: 'remarks', l: 'Remarks' }, { k: 'qtyrework', l: 'Qty Rework', t: 'num' }
    ],
    seed: []
  }
};

/* ---------- LOGO ---------- */
/* Lokasi file logo. Contoh: 'assets/logo.png' (sesuaikan dengan nama file di folder assets).
   Bila file tidak ditemukan, otomatis dicoba assets/logo.png, logo.png, logo.svg, lalu logo bawaan. */
const LOGO_FILE = 'assets/logo.png';

/* ---------- NAMA FILE HALAMAN ---------- */
const PAGE_LOGIN = 'index.html';
const PAGE_MENU  = 'menu.html';
const pageDash  = mod => 'dashboard-' + MODULES[mod].slug + '.html';
const pageInput = mod => 'input-' + MODULES[mod].slug + '.html';