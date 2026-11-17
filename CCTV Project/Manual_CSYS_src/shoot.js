// Screenshots for the CCTV System Survey manual → ./shots/*.png (numbered red marks).
//   node build_harness.js && node shoot.js [nameRegex] && python -I shrink.py && node build.js
const puppeteer = require(process.env.LOCALAPPDATA + '/manual_tools/node_modules/puppeteer-core');
const path = require('path'), fs = require('fs');
const DIR = path.join(__dirname, 'shots');
fs.mkdirSync(DIR, { recursive: true });
const FILE = f => 'file:///' + path.join(__dirname, f).split(path.sep).join('/');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ONLY = process.argv[2] ? new RegExp(process.argv[2]) : null;
const PHOTO = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#99f6e4"/><stop offset="1" stop-color="#134e4a"/></linearGradient></defs>' +
  '<rect width="320" height="240" fill="url(#g)"/><rect x="95" y="70" width="120" height="60" rx="12" fill="#f8fafc"/><circle cx="200" cy="100" r="22" fill="#1f2937"/><circle cx="200" cy="100" r="10" fill="#38bdf8"/><rect x="140" y="128" width="16" height="34" fill="#e2e8f0"/>' +
  '<text x="160" y="212" font-family="Tahoma" font-size="20" fill="#fff" text-anchor="middle">ภาพตัวอย่าง (Demo)</text></svg>');

const KIT = () => {
  window.mark = function (el, n, opt) {
    if (typeof el === 'string') { try { el = el.startsWith('JS:') ? eval(el.slice(3)) : document.querySelector(el); } catch (e) { el = null; } }
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
  window.card = i => Q('#csys-items [data-item="' + i + '"]');
  window.setI = (i, k, v) => { const el = card(i).querySelector('[data-i="' + k + '"]'); if (el.type === 'checkbox') el.checked = !!v; else el.value = v; el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('change')); };
  window.setN = (n, v) => { const el = Q('#csys-form [name="' + n + '"]'); el.value = v; el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('change')); };
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
    await page.evaluate(KIT);
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
    await page.screenshot({ path: path.join(DIR, name + '.png'), clip, captureBeyondViewport: true });
    await page.evaluate(() => clearMarks());
    console.log('shot', name);
  }

  // ── FORM ──
  let p = await open('form.html', 1000, 900);
  await p.addStyleTag({ content: '#csys-rest-form .sticky.__static{position:static!important}' });
  await p.evaluate(() => Q('#csys-rest-form .sticky').classList.add('__static'));
  await p.evaluate(() => { const f = Q('#csys-form'); f.reporterName.value = 'สมชาย ใจดี'; f.reporterPhone.value = '081-234-5678'; f.reporterRole.value = 'MTN สาขา'; Q('#csys-station-search').focus(); handleCsysStationInput(Q('#csys-station-search')); });
  await sleep(900);
  await p.evaluate(() => { Q('#csys-station-search').focus(); handleCsysStationInput(Q('#csys-station-search')); });
  await sleep(500);
  await p.evaluate(() => { mark(Q('#csys-only-lp').parentElement, 1); mark(QS('#csys-station-dropdown div')[0], 2, { right: true }); mark(Q('#csys-hide-done').parentElement, 3, { right: true }); });
  await shot(p, 'f00_scope', ['JS:Q("#csys-station-search").closest("div.grid")', '#csys-station-dropdown']);
  await p.evaluate(() => { const f = Q('#csys-form'); f.reporterName.value = 'สมชาย ใจดี'; f.reporterPhone.value = '081-234-5678'; f.reporterRole.value = 'MTN สาขา';
    const s = _cctvStores().find(x => x.code === '119104'); Q('#csys-station-search').value = s.label; _applyCsysStore(s); });
  await sleep(1200);
  await p.evaluate(() => { mark('[name="reporterRole"]', 1); mark('#csys-station-search', 2, { right: true }); mark('#csys-purpose', 3); });
  await shot(p, 'f01_store', ['JS:Q(\'#csys-form > .bg-white\')']);
  await p.evaluate(() => { const d = Q('#csys-context details'); if (d) d.open = true; Q('#csys-context').scrollIntoView();
    mark(Q('#csys-context .flex-wrap'), 1); mark(QS('#csys-context p').find(x => /LP แจ้งเสีย/.test(x.textContent)), 2); mark('#csys-context details summary', 3); const c = QS('#csys-context td').find(x => /ยกเลิก/.test(x.textContent)); if (c) mark(c, 4, { right: true }); });
  await shot(p, 'f02_context', ['JS:Q(\'#csys-context\').parentElement']);
  await p.evaluate(() => { const v = { cam: [104, 76, 28], dvr: [4, 4, 0], hdd: [8, 7, 1], mon: [6, 5, 1], ups: [2, 1, 1], eas: [38, 34, 4], tag: [20, 16, 4] };
    Object.keys(v).forEach(k => { setN('base_' + k + '_total', v[k][0]); setN('base_' + k + '_ok', v[k][1]); setN('base_' + k + '_bad', v[k][2]); });
    setN('camAnalog', 60); setN('camIp', 44); setN('recDays', 21); setN('online', 'บางส่วน');
    Q('#csys-base').closest('.bg-white').scrollIntoView(); mark('[name="base_cam_total"]', 1); mark(Q('#csys-base [data-lpbase="cam"]'), 2, { right: true }); mark('[name="recDays"]', 3); mark('[name="online"]', 4, { right: true }); });
  await shot(p, 'f03_base', ['JS:Q(\'#csys-base\').closest(\'.bg-white\')']);
  await p.evaluate(() => { CSYS_CONFIG.checks.forEach(c => { const v = ['days', 'ups', 'cable'].indexOf(c.k) > -1 ? 'NG' : 'OK'; const r = Q('#csys-checks input[data-chk="' + c.k + '"][value="' + v + '"]'); r.checked = true; });
    Q('#csys-checks').scrollIntoView(); mark(Q('#csys-checks input[data-chk="days"][value="NG"]').parentElement, 1, { right: true }); mark(Q('#csys-checks input[data-chk="ups"][value="NG"]').parentElement, 2, { right: true }); });
  await shot(p, 'f04_checks', ['JS:Q(\'#csys-checks\').parentElement']);
  await p.evaluate(() => { setI('I01', 'loc', 'CH3–CH18 ทางเดินหลังร้าน + Receiving'); setI('I01', 'cause', 'สายขาด / หลุด / Adapter เสีย'); setI('I01', 'brand', 'Hikvision');
    setI('I01', 'qOk', 4); setI('I01', 'qFix', 12); setI('I01', 'qNew', 4); setI('I01', 'qNone', 2);
    setI('I01', 'fix', 'เปลี่ยน Adapter 12V + เข้าหัว BNC ใหม่'); setI('I01', 'cEq', 2160); setI('I01', 'cLab', 1500); setI('I01', 'cClimb', 1200); setI('I01', 'cTest', 500); setI('I01', 'unitNew', 3500); setI('I01', 'newCms', '261116000');
    const c = card('I01'); c.scrollIntoView();
    mark(c.querySelector('.bg-slate-50'), 1); mark(c.querySelector('[data-i="qOk"]').closest('.border'), 2); mark(c.querySelector('[data-sec="fix"]'), 3); mark(c.querySelector('[data-sec="new"]'), 4); mark(c.querySelector('[data-i="newCms"]'), 5, { right: true }); });
  await shot(p, 'f05_card', ['JS:card(\'I01\')']);
  await p.evaluate(() => { setI('I02', 'qOk', 2); setI('I02', 'qFix', 6); setI('I02', 'qNew', 2); setI('I03', 'qNew', 1); setI('I03', 'unitNew', 6500); setI('I04', 'qFix', 1); setI('I04', 'fix', 'เปลี่ยนแบตเตอรี่'); setI('I04', 'cEq', 1800);
    setI('I06', 'qNew', 4); setI('I06', 'reuse', true); const c = card('I06'); c.scrollIntoView(); mark(c.querySelector('[data-i="reuse"]').parentElement, 1, { right: true }); mark(c.querySelector('[data-out="left"]'), 2, { right: true }); });
  await shot(p, 'f06_reuse', ['JS:card(\'I06\')']);
  await p.evaluate(() => { Q('#csys-rest-form .sticky').classList.remove('__static'); window.scrollTo(0, Q('#csys-items').getBoundingClientRect().top + scrollY - 200); mark(Q('#csys-rest-form .sticky'), 1); });
  await shot(p, 'f07_bar', ['JS:Q(\'#csys-rest-form .sticky\')'], 8);
  await p.evaluate(() => Q('#csys-rest-form .sticky').classList.add('__static'));
  await p.evaluate(() => { const b = Q('#csys-form button[type="submit"]'); b.scrollIntoView({ block: 'center' }); mark(QS('#csys-form button').find(x => /Save Draft/.test(x.textContent)), 1); mark(b, 2, { right: true }); mark('#csys-items + div button', 3); });
  await shot(p, 'f08_submit', ['JS:Q(\'#csys-items\').nextElementSibling', 'JS:Q(\'#csys-form button[type="submit"]\').closest(\'.pt-4\')']);
  // closing-store mode
  await p.evaluate(() => { Q('#csys-purpose input[value^="สาขาปิด"]').click();
    const v = { cam: [34, 6, 4], dvr: [2, 0, 0], hdd: [4, 1, 0], mon: [3, 0, 0], ups: [1, 1, 0], eas: [8, 0, 0], tag: [4, 0, 0] };
    QS('#csys-harvest [data-hv]').forEach(i => { const a = v[i.dataset.hv]; i.value = a[['ok', 'bad', 'old'].indexOf(i.dataset.hk)]; });
    setN('harvestDest', 'Warehouse ตลาดนิมิต'); setN('removalDate', '2026-12-15'); Q('#csys-harvest-section').scrollIntoView(); mark('#csys-harvest', 1); mark('[name="harvestDest"]', 2); });
  await shot(p, 'f09_closing', ['#csys-harvest-section']);
  await p.close();

  // ── REPORT ──
  p = await open('report.html', 1400, 900);
  await sleep(1200);
  await p.evaluate(() => { mark('#stLp', 1); mark('#stSurv', 2); mark('#stOpex', 3); mark('#stCapex', 4); mark('#stCms', 5); });
  await shot(p, 'r01_kpi', ['JS:Q(\'#stLp\').closest(\'.grid\')', '#srcNote']);
  await p.evaluate(() => { const rows = QS('#xBody tr'); const r = rows.find(x => /19104/.test(x.textContent)); mark('#xFlag', 1); if (r) { mark(r.children[3], 2); mark(r.children[5], 3); } const n = rows.find(x => /ยังไม่ตรวจ/.test(x.textContent)); if (n) mark(n.children[5], 4); });
  await shot(p, 'r02_cross', ['JS:Q(\'#xSearch\').parentElement', 'JS:QS(\'#xBody tr\')[5]']);
  await p.evaluate(() => { showView('items'); });
  await sleep(300);
  await p.evaluate(() => { mark('#iRes', 1); const r = QS('#iBody tr')[0]; if (r) { mark(r.children[3], 2); mark(r.children[7], 3); } });
  await shot(p, 'r03_items', ['JS:Q(\'#iSearch\').parentElement', 'JS:QS(\'#iBody tr\')[Math.min(5, QS(\'#iBody tr\').length - 1)]']);
  await p.evaluate(() => { showView('x'); openModal(Object.keys(__D.records).find(id => /19104/.test(__D.records[id].data['Branch Code']))); });
  await sleep(900);
  await p.evaluate(() => { const c = Q('#modalBody [data-it]'); if (c) { mark(Array.from(c.querySelectorAll('p')).find(x => /^LP:/.test(x.textContent)), 1); mark(c.querySelector('[data-cms]'), 2, { right: true }); } mark('#cmsBtn', 3); });
  await shot(p, 'r04_modal', ['JS:Q(\'#detailModal > div\')'], 4);
  await p.evaluate(() => { closeModal(); openLpModal(); });
  await sleep(600);
  await p.evaluate(() => { mark('#lpFile', 1); mark('#lpAsOf', 2, { right: true }); mark('#lpUploadBtn', 3); });
  await shot(p, 'r05_lp', ['JS:Q(\'#lpModal > div\')'], 4);
  await browser.close();
})();
