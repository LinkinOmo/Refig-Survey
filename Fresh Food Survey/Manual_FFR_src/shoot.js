// Screenshots for the FF Renovate Survey manual → ./shots/*.png (numbered red marks).
//   node build_harness.js && node shoot.js [nameRegex] && python -I shrink.py && node build.js
const puppeteer = require(process.env.LOCALAPPDATA + '/manual_tools/node_modules/puppeteer-core');
const path = require('path'), fs = require('fs');
const DIR = path.join(__dirname, 'shots');
fs.mkdirSync(DIR, { recursive: true });
const FILE = f => 'file:///' + path.join(__dirname, f).split(path.sep).join('/');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ONLY = process.argv[2] ? new RegExp(process.argv[2]) : null;
const PHOTO = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fecdd3"/><stop offset="1" stop-color="#881337"/></linearGradient></defs>' +
  '<rect width="320" height="240" fill="url(#g)"/><rect x="60" y="70" width="200" height="90" rx="8" fill="#f8fafc"/><rect x="72" y="82" width="176" height="40" fill="#bae6fd"/><rect x="72" y="128" width="176" height="20" fill="#cbd5e1"/>' +
  '<text x="160" y="205" font-family="Tahoma" font-size="20" fill="#fff" text-anchor="middle">ภาพตัวอย่าง (Demo)</text></svg>');

// USER=1 → user-edition shots (*_u.png): budget / BOQ prices stripped before marks are placed (user manual is budget-free).
const USER = !!process.env.USER_EDITION;
const KIT = (user) => {
  window.__USER = user;
  window.scrub = function () {
    if (!window.__USER) return;
    const d = document.getElementById('ffr-sum-delta'); if (d) d.parentElement.style.display = 'none';
    document.querySelectorAll('[data-out="cost"]').forEach(e => e.style.display = 'none');
    document.querySelectorAll('#ffr-context .grid > div').forEach(c => { if (/ระบบ \+ อื่นๆ/.test(c.textContent)) c.style.display = 'none'; });
    document.querySelectorAll('#ffr-context p').forEach(p => { if (/BOQ รวม/.test(p.textContent)) p.style.display = 'none'; });
    const w = document.createTreeWalker(document.getElementById('content-ffr-survey') || document.body, NodeFilter.SHOW_TEXT);
    let t; while ((t = w.nextNode())) {
      const v = t.nodeValue.replace(/\s*·\s*ราคา Refurbish.*$/, '').replace(/\s*·\s*[\d,.]+\s*฿/g, '');
      if (v !== t.nodeValue) t.nodeValue = v;
    }
  };
  window.mark = function (el, n, opt) {
    scrub();
    if (typeof el === 'string') { try { el = document.querySelector(el); } catch (e) { el = null; } }
    if (!el) { console.log('no mark target', n); return; }
    const r = el.getBoundingClientRect(), pad = 4;
    const b = document.createElement('div'); b.className = '__mk';
    b.style.cssText = 'position:absolute;z-index:9999;pointer-events:none;border:3px solid #e11d48;border-radius:8px;left:' + (r.left + scrollX - pad) + 'px;top:' + (r.top + scrollY - pad) + 'px;width:' + (r.width + pad * 2) + 'px;height:' + (r.height + pad * 2) + 'px';
    document.body.appendChild(b);
    if (n != null) {
      const c = document.createElement('div'); c.className = '__mk';
      const left = (opt && opt.right) ? r.right + 4 : r.left - 16;
      c.style.cssText = 'position:absolute;z-index:10000;pointer-events:none;width:26px;height:26px;border-radius:50%;background:#e11d48;color:#fff;font:700 14px/26px Tahoma,sans-serif;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,.35);left:' + (left + scrollX) + 'px;top:' + (r.top + scrollY - 14) + 'px';
      c.textContent = n; document.body.appendChild(c);
    }
  };
  window.clearMarks = () => document.querySelectorAll('.__mk').forEach(x => x.remove());
  window.Q = s => document.querySelector(s);
  window.QS = s => Array.from(document.querySelectorAll(s));
  window.fire = el => { el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
  window.setIn = (root, sel, v) => { const el = root.querySelector(sel); if (!el) { console.log('no mark target', sel); return; } el.value = v; fire(el); };
  window.radio = (name, v) => { const r = QS('input[name="' + name + '"]').find(x => x.value === v); if (r) { r.checked = true; fire(r); } };
};

(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-sandbox', '--allow-file-access-from-files'] });
  async function open(file, w, h) {
    const page = await browser.newPage();
    await page.emulateTimezone('Asia/Bangkok');
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 2 });
    await page.setRequestInterception(true);
    page.on('request', r => /drive\.google\.com\/(thumbnail|uc)/.test(r.url()) ? r.respond({ status: 200, contentType: 'image/svg+xml', body: PHOTO }) : r.continue());
    page.on('pageerror', e => console.log('PAGEERR', e.message));
    page.on('console', m => { if (/no mark target|MISSING|SERVER ERR/.test(m.text())) console.log('  ', m.text()); });
    page.on('dialog', d => d.accept());
    await page.goto(FILE(file), { waitUntil: 'networkidle0' });
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(KIT, USER);
    await sleep(900);
    return page;
  }
  async function shot(page, name, sels, pad = 14) {
    if (ONLY && !ONLY.test(name)) { await page.evaluate(() => clearMarks()); return; }
    await sleep(450);
    const clip = await page.evaluate((sels, pad) => {
      let x1 = 1e9, y1 = 1e9, x2 = -1e9, y2 = -1e9;
      [].concat(sels).forEach(s => {
        let el; try { el = s.startsWith('JS:') ? eval(s.slice(3)) : document.querySelector(s); } catch (e) { el = null; }
        if (!el) { console.log('no mark target', s); return; }
        const r = el.getBoundingClientRect();
        x1 = Math.min(x1, r.left + scrollX); y1 = Math.min(y1, r.top + scrollY); x2 = Math.max(x2, r.right + scrollX); y2 = Math.max(y2, r.bottom + scrollY);
      });
      return { x: Math.max(0, x1 - pad), y: Math.max(0, y1 - pad), width: Math.min(document.documentElement.scrollWidth, x2 + pad) - Math.max(0, x1 - pad), height: y2 - y1 + pad * 2 };
    }, sels, pad);
    await page.screenshot({ path: path.join(DIR, name + (USER ? '_u' : '') + '.png'), clip, captureBeyondViewport: true });
    await page.evaluate(() => clearMarks());
    console.log('shot', name);
  }

  // ── FORM ──
  let p = await open('form.html', 1000, 900);
  await p.addStyleTag({ content: '#ffr-rest-form .sticky{position:static!important}' });
  await shot(p, 'f01_guide', '#content-ffr-survey details');

  await p.evaluate(() => {
    const f = Q('#ffr-form'); f.reporterName.value = 'สมชาย ใจดี'; f.reporterPhone.value = '081-234-5678'; f.reporterRole.value = 'MTN สาขา'; f.surveyDate.value = '2026-11-18';
    Q('#ffr-station-search').focus(); handleFfrStationInput(Q('#ffr-station-search'));
  });
  await sleep(700);
  await p.evaluate(() => { Q('#ffr-station-search').focus(); handleFfrStationInput(Q('#ffr-station-search')); });
  await sleep(500);
  await p.evaluate(() => {
    mark(Q('#ffr-form [name="reporterRole"]'), 1); mark(Q('#ffr-form [name="surveyDate"]'), 2);
    mark(Q('#ffr-station-search'), 3); mark(QS('#ffr-station-dropdown div')[0], 4, { right: true }); mark(Q('#ffr-hide-done').parentElement, 5, { right: true });
  });
  await shot(p, 'f02_store', ['JS:Q("#ffr-form .bg-white.p-4")', '#ffr-station-dropdown']);

  await p.evaluate(() => { const s = FFR_STORE_LIST[0]; Q('#ffr-station-search').value = _ffrStoreLabel(s); Q('#ffr-station-dropdown').classList.add('hidden'); _applyFfrStore(s); });
  await sleep(1200);
  await p.evaluate(() => {
    const sec = Q('#ffr-context').closest('.bg-white');
    mark(Q('#ffr-store-badge'), null);
    mark(Q('#ffr-context .grid'), 1); mark(QS('#ffr-context > div').find(d => /Layout ของสาขา/.test(d.textContent)), 2);
    mark(QS('#ffr-context > div').find(d => /Write-off/.test(d.textContent)), 3); mark(Q('#ffr-form [name="layoutStatus"]'), 4);
  });
  await shot(p, 'f03_context', ['#ffr-store-badge', 'JS:Q("#ffr-context").closest(".bg-white")']);

  await p.evaluate(() => {
    const rows = QS('#ffr-amb tr[data-amb]'), t = [26.1, 27.8, 24.5, 23.9, 25.2];
    rows.forEach((r, i) => { setIn(r, '[data-a="t"]', t[i]); setIn(r, '[data-a="rh"]', 55 + i * 2); setIn(r, '[data-a="tm"]', '14:' + String(10 + i * 5)); });
    setIn(rows[1], '[data-a="nt"]', 'แอร์โซนนี้ไม่เย็น / ใกล้ประตู Loading');
    const sec = Q('#ffr-amb').closest('.bg-white');
    mark(Q('#ffr-amb'), 1); mark(rows[1].querySelector('[data-a="t"]'), 2, { right: true }); mark(Q('#ffr-amb-sum'), 3, { right: true }); mark(Q('#ffr-amb-photo'), 4);
  });
  await shot(p, 'f04_amb', 'JS:Q("#ffr-amb").closest(".bg-white")');

  // cabinet card — planned refurbish, one cannot be refurbished
  await p.evaluate(() => {
    const el = QS('#ffr-items [data-item]').find(e => e.dataset.plan === 'ref' && +e.querySelector('[data-i="q"]').value >= 3) || QS('#ffr-items [data-item]').find(e => e.dataset.plan === 'ref');
    el.id = '__cref';
    const q = +el.querySelector('[data-i="q"]').value;
    setIn(el, '[data-i="pos"]', 'ริมผนัง'); setIn(el, '[data-i="yr"]', 2009); setIn(el, '[data-i="brand"]', 'Arneg'); setIn(el, '[data-i="tm"]', 5.5);
    setIn(el, '[data-i="rep"]', 4); setIn(el, '[data-i="repCost"]', 18500); setIn(el, '[data-i="body"]', '2'); setIn(el, '[data-i="cool"]', '2'); setIn(el, '[data-i="door"]', '1');
    setIn(el, '[data-i="qRef"]', q - 2); setIn(el, '[data-i="qWork"]', 1); setIn(el, '[data-i="qNew"]', 1);
    setIn(el, '[data-i="why"]', 'คอยล์รั่ว / ตัน'); setIn(el, '[data-i="wo"]', 'Partial write-off');
    (FFR.units || []).slice(0, 2).forEach(function(u) { ffrAddEq(el.dataset.item, u.id); });   // picks fill the Asset No. too
    mark(el.querySelector('.bg-rose-800 span span'), 1); mark(el.querySelector('.grid.grid-cols-2'), 2); mark(el.querySelector('.grid.grid-cols-3'), 3);
    mark(el.querySelector('.border.border-gray-200.rounded-lg'), 4); mark(el.querySelector('[data-sec="why"]'), 5); mark(el.querySelector('[data-sec="wo"]'), 6);
    const fl = el.querySelectorAll('input[type="file"]'); mark(fl[fl.length - 1].closest('div'), 7);   // photo upload (the first file input is the QR scan)
    mark(el.querySelector('[data-i="eq"]').closest('.border-indigo-200'), 8);
  });
  await shot(p, 'f05_card_ref', '#__cref');

  // cabinet card — planned new, old one still workable
  await p.evaluate(() => {
    const el = QS('#ffr-items [data-item]').find(e => e.dataset.plan === 'new' && +e.querySelector('[data-i="q"]').value >= 4) || QS('#ffr-items [data-item]').find(e => e.dataset.plan === 'new');
    el.id = '__cnew';
    const q = +el.querySelector('[data-i="q"]').value;
    setIn(el, '[data-i="body"]', '1'); setIn(el, '[data-i="cool"]', '1'); setIn(el, '[data-i="door"]', '2'); setIn(el, '[data-i="yr"]', 2016);
    setIn(el, '[data-i="qWork"]', 2); setIn(el, '[data-i="qNew"]', q - 2); setIn(el, '[data-i="wo"]', 'Full write-off');
    mark(el.querySelector('.bg-rose-800 span span'), 1); mark(el.querySelector('.border.border-gray-200.rounded-lg'), 2); mark(el.querySelector('[data-sec="wo"]'), 3);
  });
  await shot(p, 'f06_card_new', '#__cnew');

  await p.evaluate(() => { mark(Q('#ffr-rest-form .sticky'), 1); });
  await shot(p, 'f07_bar', '#ffr-rest-form .sticky', 18);

  await p.evaluate(() => {
    const el = Q('#ffr-racks [data-rack]'); el.id = '__rk';
    const s = (k, v) => setIn(el, '[data-r="' + k + '"]', v);
    s('brand', 'Bitzer'); s('model', 'Multiset 4×4CES'); s('yr', 2006); s('refg', 'R404A'); s('comp', 4); s('compOk', 3);
    s('feeds', 'High chilled ริมผนัง + Open high chill produce'); s('cond', '3'); s('cdu', '2'); s('leak', 'มี'); s('ctrl', 'ปกติ'); s('spare', 'ไม่มี');
    s('spareHp', 0); s('spareCirc', 0); s('fit', 'รองรับไม่ได้'); s('rep', 7); s('repCost', 56000); s('rec', 'เปลี่ยน Rack ใหม่'); s('nt', 'คอมเพรสเซอร์เปลี่ยนแล้ว 2 ตัวในปีนี้ · มีคราบน้ำมันที่ข้อต่อ'); s('asset', '1100210100'); s('wo', 'Full write-off');
    const files = el.querySelectorAll('input[type="file"]');
    mark(el.querySelector('[data-r="type"]'), 1); mark(el.querySelector('[data-r="comp"]').closest('div'), 2); mark(el.querySelector('[data-r="rec"]'), 3, { right: true }); mark(el.querySelector('[data-r="fit"]').closest('div'), 7);
    mark(el.querySelector('[data-r="asset"]').closest('.grid'), 4); mark(files[0].closest('div'), 5); mark(files[2].closest('div'), 6);
  });
  await shot(p, 'f08_rack', '#__rk');

  await p.evaluate(() => {
    const pick = { open24: 'ไม่ใช่', room: 'ต้องปรับปรุง', pipe: 'เดินยาก', elec: 'ต้องตรวจสอบเพิ่ม', outlet: 'มีบางจุด', drain: 'ไม่มี — ต้องใช้ถังพักน้ำ', ac: 'ไม่แน่ใจ', night: 'มีแต่ไม่ใช้ / ชำรุด' };
    Object.keys(pick).forEach(k => radio('ffr_site_' + k, pick[k]));
    const f = Q('#ffr-form'); f.pipeLen.value = 120; f.sysRec.value = 'Plug-in ทั้งหมด';
    mark(Q('#ffr-site'), 1); mark(QS('#ffr-site input:checked').find(r => r.value.indexOf('ถังพักน้ำ') > -1).nextElementSibling, 2, { right: true });
    mark(f.pipeLen, 3); mark(f.sysRec, 4);
  });
  await shot(p, 'f09_site', ['JS:Q("#ffr-site").closest(".bg-white").querySelector("h3")', 'JS:Q("#ffr-form [name=sysRec]").closest(".grid")']);

  // 6.2 capacity
  await p.evaluate(() => {
    const v = { acType: 'Chiller (น้ำเย็น)', acTR: 350, chTot: 3, chRun: 2, acLoad: 88, acCond: 'พอใช้', trKva: 3000, mdbRated: 4000, mdbPeak: 3300, spareCb: 2 };
    QS('#ffr-cap [data-cap]').forEach(el => { if (v[el.dataset.cap] !== undefined) { el.value = v[el.dataset.cap]; fire(el); } });
    const c = k => Q('#ffr-cap [data-cap="' + k + '"]').closest('div');
    mark(c('acType'), 1); mark(c('chTot'), 2); mark(c('chRun'), null); mark(c('acLoad'), 3); mark(c('mdbRated'), 4); mark(c('mdbPeak'), null); mark(Q('#ffr-cap-hint'), 5);
  });
  await shot(p, 'f11_cap', ['JS:QS("#ffr-site").length && Q("#ffr-cap").previousElementSibling.previousElementSibling', '#ffr-cap-hint']);

  // 6.3 installation constraints
  await p.evaluate(() => {
    const pick = { route: 'ต้องถอดประตู / ผนังชั่วคราว', dock: 'ได้บางช่วงเวลา', night: 'ได้บางวัน / ต้องขออนุญาต', stage: 'ไม่มี', zone: 'ได้บางส่วน', landlord: 'ใช่' };
    Object.keys(pick).forEach(k => radio('ffr_inst_' + k, pick[k]));
    const n = Q('#ffr-inst-note'); n.value = 'ประตูหลังกว้าง 1.0 ม. ต้องขนผ่านหน้าร้าน · ห้างอนุญาตทำงาน 22:00–06:00';
    mark(Q('#ffr-inst'), 1); mark(QS('#ffr-inst input:checked').find(r => r.value === 'ไม่มี').nextElementSibling, 2); mark(n, 3);
  });
  await shot(p, 'f12_inst', ['JS:Q("#ffr-inst").previousElementSibling', '#ffr-inst-note']);

  await p.evaluate(() => {
    const v = { 'grind|ok': 1, 'grind|fix': 1, 'saw|ok': 1, 'slice|nw': 1, 'vac|ok': 2, 'scale|ok': 3, 'scale|fix': 1 };
    QS('#ffr-equip [data-eq]').forEach(i => { const x = v[i.dataset.eq + '|' + i.dataset.ek]; if (x) i.value = x; });
    Q('#ffr-form').comments.value = 'แนะนำเปลี่ยน Rack positive (อายุ 20 ปี ซ่อมบ่อย) · ตู้ High chilled ริมผนังยังใช้ต่อได้';
    mark(Q('#ffr-equip'), 1); mark(Q('#ffr-form [name="comments"]'), 2);
    mark(QS('#ffr-form button').find(b => /Save Draft/.test(b.textContent)), 3); mark(Q('#ffr-form button[type="submit"]'), 4);
  });
  await shot(p, 'f10_submit', ['JS:Q("#ffr-equip").closest(".bg-white")', 'JS:Q("#ffr-form button[type=submit]").closest(".pt-4")']);
  await p.close();

  // ── REPORT ──
  p = await open('report.html', 1320, 900);
  await sleep(800);
  await p.evaluate(() => { mark(Q('#kpis'), 1); mark(Q('#fState'), 2, { right: true }); mark(Q('#view-stores tbody tr[data-open]'), 3); mark(Q('#layoutFolderBtn'), 4); });
  await shot(p, 'r01_stores', ['#kpis', '#view-stores', 'JS:Q("nav")']);
  await p.evaluate(() => setTab('items'));
  await sleep(300);
  await p.evaluate(() => {
    mark(QS('[data-tab]').find(b => /ตู้แช่/.test(b.textContent)), 1);
    const ths = QS('#view-items th'); const t = (re) => ths.find(h => re.test(h.textContent));
    mark(t(/แผน BOQ/), 2); mark(t(/Refurbish/), 3); mark(t(/Request New/), 4); mark(t(/งบตามผล/), 5, { right: false });
  });
  await shot(p, 'r02_items', ['JS:Q("[data-tab]").parentElement', '#view-items']);
  await p.evaluate(() => setTab('racks'));
  await sleep(500);
  await p.evaluate(() => {
    const c = QS('#view-racks > div')[0]; if (!c) return;
    const badge = Array.from(c.querySelectorAll('span,div')).find(e => /เปลี่ยน Rack|Overhaul|ใช้ต่อ/.test(e.textContent) && e.children.length === 0);
    if (badge) mark(badge, 1); mark(c.querySelector('img') ? c.querySelector('img').parentElement.parentElement : null, 2);
  });
  await shot(p, 'r03_racks', ['JS:Q("#view-racks > div")', 'JS:QS("#view-racks > div")[1]']);
  await p.evaluate(() => { setTab('stores'); openRecord(Q('#view-stores tbody tr[data-open]').dataset.open); });
  await sleep(900);
  // fixed overlay only paints the viewport → make it static, then crop to header + ambient + first 3 cabinet cards
  await p.addStyleTag({ content: '#modal{position:absolute!important;height:auto!important;overflow:visible!important}' });
  await sleep(300);
  await p.evaluate(() => {
    const cards = QS('#modalBody .border.rounded-lg');
    mark(QS('#modalBody .grid')[0], 1); mark(QS('#modalBody h3')[0], 2); mark(cards[0], 3);
    const wo = cards[0] && cards[0].querySelector('div.text-amber-800'); if (wo) mark(wo, 4);
  });
  await shot(p, 'r04_record', ['JS:Q("#modal > div > div")', 'JS:QS("#modalBody .border.rounded-lg")[2]']);
  await browser.close();
})();
