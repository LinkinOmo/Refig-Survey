// Builds Manuals App/ffr-manual.html from manual.template.html: screenshots inlined (shots/*.webp from shrink.py),
// option tables generated from the REAL FfRenovateSurvey.gs config + FfRenovateStores.gs (BOQ) so the manual never drifts.
// Video (optional): put the Google Drive FILE ID in video_id.txt (shared "Anyone with the link").
//   node build_harness.js && node shoot.js && python -I shrink.py && node build.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..', '..');
const APP = 'https://script.google.com/macros/s/AKfycbxgUC3d19UykuHyeQbv61Gc0P2HBcpLyf4T2p-jYEZ0ymFSSvU32U8kaRTHzXfemBYi/exec';
const ctx = {}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'FfRenovateStores.gs'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'FfRenovateSurvey.gs'), 'utf8'), ctx);
const C = vm.runInContext('({ why: FFR_WHY, rackTypes: FFR_RACK_TYPES, rackRec: FFR_RACK_REC, layoutSt: FFR_LAYOUT_ST, site: FFR_SITE, sysRec: FFR_SYS_REC, equip: FFR_EQUIP, wo: FFR_WO, roles: FFR_ROLES,' +
  ' ok: FFR_AMB_OK, max: FFR_AMB_MAX, rh: FFR_RH_MAX, stores: FFR_STORES, items: FFR_ITEMS, asOf: FFR_BOQ_AS_OF })', ctx);
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const ul = a => '<ul>' + a.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>';

// BOQ totals (same maths as the report: refurbish qty × refurbish price + new qty × new price)
let boq = 0;
C.stores.forEach(s => (s.L || []).forEach(l => { const it = C.items[l[0]]; boq += (l[1] || 0) * it[3] + (l[2] || 0) * it[4]; }));
const site = '<table><tr><th>#</th><th>คำถาม</th><th>ตัวเลือก</th><th>นับเป็นความเสี่ยง</th></tr>' + C.site.map((c, i) =>
  '<tr><td>' + (i + 1) + '</td><td>' + esc(c.l) + '</td><td>' + c.v.map(esc).join(' / ') + '</td><td class="new">' + (c.bad.length ? c.bad.map(esc).join(', ') : '<span class="note">— (ข้อมูลประกอบ)</span>') + '</td></tr>').join('') + '</table>';
const rackRec = '<table><tr><th>ข้อเสนอ MTN</th><th>ใช้เมื่อ</th></tr>' + [
  'คอมเพรสเซอร์ทำงานครบ ไม่รั่ว ซ่อมไม่บ่อย มีกำลังพอรับตู้ตามแผน',
  'โครงสร้างยังดี แต่ต้องเปลี่ยนคอมเพรสเซอร์ / พัดลม Condenser / ชุดคอนโทรล หรืออุดรั่วใหญ่',
  'อายุมาก (เช่น > 15 ปี) + ซ่อมบ่อย / ค่าซ่อมสูง / น้ำยาเลิกใช้ (R22, R404A) / กำลังไม่พอรับตู้ใหม่'
].map((t, i) => '<tr><td><b>' + esc(C.rackRec[i]) + '</b></td><td>' + t + '</td></tr>').join('') + '</table>';

const CF2 = vm.runInContext('({ cap: FFR_CAP, install: FFR_INSTALL })', ctx);
const capTbl = '<div class="tbl"><table><tr><th>ช่อง</th><th>ดูจากไหน</th></tr>' + CF2.cap.map(c => '<tr><td>' + esc(c.l) + '</td><td>' + (c.v ? c.v.map(esc).join(' / ') : esc(c.ph || '-')) + '</td></tr>').join('') + '</table></div>';
const instTbl = '<table><tr><th>#</th><th>คำถาม</th><th>ตัวเลือก</th><th>นับเป็นข้อจำกัด</th></tr>' + CF2.install.map((c, i) =>
  '<tr><td>' + (i + 1) + '</td><td>' + esc(c.l) + '</td><td>' + c.v.map(esc).join(' / ') + '</td><td class="new">' + (c.bad.length ? c.bad.map(esc).join(', ') : '<span class="note">— (ข้อมูลประกอบ)</span>') + '</td></tr>').join('') + '</table>';
const idFile = path.join(__dirname, 'video_id.txt');
const vid = fs.existsSync(idFile) ? fs.readFileSync(idFile, 'utf8').trim() : '';
const view = vid ? 'https://drive.google.com/file/d/' + vid + '/view' : '';
const TPL = fs.readFileSync(path.join(__dirname, 'manual.template.html'), 'utf8');
const img = n => 'data:image/webp;base64,' + fs.readFileSync(path.join(__dirname, 'shots', n + '.webp')).toString('base64');
// Two editions: 'user' (ffr-manual — no budget / BOQ money / report; *_u screenshots) and 'full' (ffr-manual-full —
// Super Admin only, served by Manuals App behind a signed link). <!--FULL-->…<!--/FULL--> and <!--USER-->…<!--/USER--> mark the parts.
function build(ed) {
  const full = ed === 'full';
  let out = TPL.replace(full ? /<!--USER-->[\s\S]*?<!--\/USER-->/g : /<!--FULL-->[\s\S]*?<!--\/FULL-->/g, '')
    .replace(/<!--\/?(FULL|USER)-->/g, '')
    .replace(/\{\{IMGU:([\w-]+)\}\}/g, (m, n) => img(full ? n : n + '_u'))
    .replace(/\{\{IMG:([\w-]+)\}\}/g, (m, n) => img(n))
    .replace(/\{\{FAQN\}\}/g, full ? '11' : '9')
    .replace(/\{\{DATE\}\}/g, new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10)).replace(/\{\{APP\}\}/g, APP)
    .replace(/\{\{OK\}\}/g, C.ok).replace(/\{\{MAX\}\}/g, C.max).replace(/\{\{RH\}\}/g, C.rh)
    .replace(/\{\{NSTORE\}\}/g, C.stores.length).replace(/\{\{BOQ_AS_OF\}\}/g, C.asOf).replace(/\{\{BOQ_M\}\}/g, (boq / 1e6).toFixed(1))
    .replace('{{WHY}}', ul(C.why)).replace('{{RACK_TYPES}}', ul(C.rackTypes)).replace('{{RACK_REC}}', rackRec)
    .replace('{{LAYOUT_ST}}', ul(C.layoutSt)).replace('{{SITE}}', site).replace('{{SYS_REC}}', ul(C.sysRec)).replace('{{WO}}', C.wo.map(esc).join(' / '))
    .replace('{{ROLES}}', C.roles.map(esc).join(' · ')).replace('{{CAP}}', capTbl).replace('{{INSTALL}}', instTbl)
    .replace('{{VIDEO_TOC}}', vid ? '<a href="#vid">🎬 วิดีโอสรุป</a>' : '')
    .replace('{{VIDEO_BTN}}', vid ? '<a class="btn" href="' + view + '" target="_blank" rel="noopener">🎬 วิดีโอสรุป</a>' : '')
    .replace('{{VIDEO_BOX}}', vid ? '<div class="card video" id="vid"><b>🎬 วิดีโอสรุป</b> — ดูภาพรวมก่อนลงหน้างาน · <a href="' + view + '" target="_blank" rel="noopener">เปิดใน Google Drive</a>' +
      '<iframe src="https://drive.google.com/file/d/' + vid + '/preview" allow="autoplay; fullscreen" allowfullscreen></iframe></div>' : '');
  if (full) out = out.replace('<title>คู่มือสำรวจก่อน Renovate Fresh Food</title>', '<title>คู่มือสำรวจก่อน Renovate Fresh Food (ฉบับเต็ม)</title><meta name="robots" content="noindex">');
  const left = out.match(/\{\{[A-Z_:\w-]+\}\}|<!--\/?(FULL|USER)-->/g);
  if (left) { console.error(ed, 'UNFILLED:', left); process.exit(1); }
  // user edition must carry no money / budget wording
  if (!full) { const bad = out.replace(/data:image[^"]+/g, '').match(/฿|MB|งบประมาณ|งบเทียบ|ผลต่างงบ|ลดงบ|คิดงบ|ต่องบ|486|546|CAPEX|NBV|ราคา|ffr_report/g); if (bad) { console.error('user edition leaks:', [...new Set(bad)]); process.exit(1); } }
  const name = full ? 'ffr-manual-full.html' : 'ffr-manual.html';
  fs.writeFileSync(path.join(ROOT, 'Manuals App', name), out);
  console.log(name, Math.round(out.length / 1024) + ' KB');
}
build('user'); build('full');
console.log(C.stores.length + ' stores · BOQ ฿' + (boq / 1e6).toFixed(1) + 'M', vid ? '(video ' + vid + ')' : '(no video)');
