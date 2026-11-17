// Builds Manuals App/csys-manual.html from manual.template.html: screenshots inlined (shots/*.webp from shrink.py),
// equipment + checklist tables generated from the REAL CctvSystemSurvey.gs config.
// Video: put the Google Drive FILE ID of the 3D walkthrough in video_id.txt (shared "Anyone with the link").
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..', '..');
const APP = 'https://script.google.com/macros/s/AKfycbxgUC3d19UykuHyeQbv61Gc0P2HBcpLyf4T2p-jYEZ0ymFSSvU32U8kaRTHzXfemBYi/exec';
const ctx = {}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'CctvSystemSurvey.gs'), 'utf8'), ctx);
const C = ctx.getCctvSysConfig_();
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const LPN = { mon: 'หมวด 1', ups: 'หมวด 2', hdd: 'หมวด 3', eas: 'หมวด 4', tag: 'หมวด 5', cam: 'หมวด 6' };
const types = '<table><tr><th>อุปกรณ์</th><th>อยู่ในไฟล์ LP</th><th>นับในข้อ 2</th></tr>' + C.types.map(t =>
  '<tr><td>' + esc(t.l) + '</td><td>' + (LPN[t.k] ? LPN[t.k] : '— (เพิ่มการ์ดเอง)') + '</td><td>' + (t.base ? '✓' : '') + '</td></tr>').join('') + '</table>';
const checks = '<table><tr><th>#</th><th>รายการตรวจ</th><th>ถ้า NG ควรแก้ด้วยการ์ด</th></tr>' + C.checks.map((c, i) => '<tr><td>' + (i + 1) + '</td><td>' + esc(c.l) + '</td><td>' +
  ({ img: 'กล้อง / สาย / DVR', rec: 'DVR-NVR / HDD', days: 'HDD (เพิ่มความจุ) / ตั้งค่า DVR', time: 'ตั้งเวลา DVR (แก้หน้างาน)', hddh: 'Hard Disk', ups: 'UPS (แบตเตอรี่)', online: 'สายสัญญาณ / PoE Switch', room: 'แจ้งสาขา / งานอาคาร', cable: 'สายสัญญาณ / Adapter', eas: 'เสา EAS', tag: 'เครื่องทำลาย TAG' }[c.k] || '') + '</td></tr>').join('') + '</table>';
const idFile = path.join(__dirname, 'video_id.txt');
const vid = fs.existsSync(idFile) ? fs.readFileSync(idFile, 'utf8').trim() : '';
const view = vid ? 'https://drive.google.com/file/d/' + vid + '/view' : '';
const out = fs.readFileSync(path.join(__dirname, 'manual.template.html'), 'utf8')
  .replace(/\{\{IMG:([\w-]+)\}\}/g, (m, n) => 'data:image/webp;base64,' + fs.readFileSync(path.join(__dirname, 'shots', n + '.webp')).toString('base64'))
  .replace(/\{\{DATE\}\}/g, new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10)).replace(/\{\{APP\}\}/g, APP)
  .replace(/\{\{OPEX\}\}/g, C.opexLimit.toLocaleString('en-US')).replace('{{TYPES}}', types).replace('{{CHECKS}}', checks)
  .replace('{{VIDEO_TOC}}', vid ? '<a href="#vid">🎬 วิดีโอ 3D Walkthrough</a>' : '')
  .replace('{{VIDEO_BTN}}', vid ? '<a class="btn" href="' + view + '" target="_blank" rel="noopener">🎬 วิดีโอ 3D Walkthrough</a>' : '')
  .replace('{{VIDEO_BOX}}', vid ? '<div class="card video" id="vid"><b>🎬 วิดีโอ 3D Walkthrough</b> — ดูภาพรวมก่อนลงหน้างาน (ไม่มีเสียง มีคำบรรยายภาษาไทย) · <a href="' + view + '" target="_blank" rel="noopener">เปิดใน Google Drive</a>' +
    '<iframe src="https://drive.google.com/file/d/' + vid + '/preview" allow="autoplay; fullscreen" allowfullscreen></iframe></div>' : '');
const dest = path.join(ROOT, 'Manuals App', 'csys-manual.html');
fs.writeFileSync(dest, out);
console.log('csys-manual.html', Math.round(out.length / 1024) + ' KB', vid ? '(video ' + vid + ')' : '(no video id yet)');
