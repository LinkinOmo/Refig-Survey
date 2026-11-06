// MTN Manuals — every user manual of the Air Ref Survey app, split out of the main project (2026-10-29) because the
// embedded screenshots pushed the main project past the Apps Script size limit. The main app links here via MANUALS_URL
// (ManualsLink.gs); manuals link back to the app via APP_URL. Criteria tables come from ManualConfig.gs (snapshot).
var APP_URL = 'https://script.google.com/macros/s/AKfycbxgUC3d19UykuHyeQbv61Gc0P2HBcpLyf4T2p-jYEZ0ymFSSvU32U8kaRTHzXfemBYi/exec';

var MANUALS = {
    'flood-recovery-manual': { title: 'คู่มือการใช้งาน Flood Recovery Plan', edition: false, template: false },
    'hyper-manual': { title: 'คู่มือแบบสำรวจ Hyper (C7 & AMM)', edition: false, template: false },
    'sc-manual': { title: 'คู่มือเช็คลิสต์ปิดสาขา', edition: false, template: true },
    'hb-manual': { title: 'คู่มือสำรวจเครื่องเป่ามือ Hyper', edition: false, template: true },
    'fa-manual': { title: 'คู่มือสำรวจพื้นที่เก็บ Fixed Asset', edition: true, template: true },
    'admin-manual': { title: 'คู่มือผู้ดูแลระบบ (Super Admin)', edition: false, template: true },
    'fi-manual': { title: 'คู่มือสำรวจความเสี่ยงอัคคีภัย Hyper', edition: false, template: false },
    'cctv-manual': { title: 'คู่มือแบบสำรวจกล้องวงจรปิด (CCTV)', edition: false, template: false },
    'survey-manual': { title: 'คู่มือแบบสำรวจแอร์ & ตู้แช่', edition: false, template: true },
    'aircon-manual': { title: 'คู่มือแบบสำรวจเครื่องปรับอากาศ', edition: false, template: true },
    'ref-manual': { title: 'คู่มือแบบสำรวจตู้แช่', edition: false, template: true },
    'np-manual': { title: 'คู่มือแบบสำรวจ New Product', edition: false, template: true },
    'layout-manual': { title: 'คู่มือแบบสำรวจพื้นที่ก่อนติดตั้ง', edition: false, template: true },
    'hours-manual': { title: 'คู่มือแบบสำรวจความพร้อมปรับลดเวลาทำการ', edition: false, template: true },
    'edmi-manual': { title: 'คู่มือกรอกแบบฟอร์ม EDMI Solar Meter', edition: false, template: true }
};

function doGet(e) {
  var page = (e && e.parameter && e.parameter.page) || '';
  var m = MANUALS[page];
  if (!m) {
    var t = HtmlService.createTemplateFromFile('ManualIndex');
    t.manuals = MANUALS;
    return t.evaluate().setTitle('คู่มือการใช้งาน — MTN Survey App').addMetaTag('viewport', 'width=device-width, initial-scale=1')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
  var out;
  if (m.template) {
    var tpl = HtmlService.createTemplateFromFile(page);
    if (m.edition) tpl.edition = e.parameter.v === 'store' ? 'store' : 'ho';   // fa-manual: store edition hides the labour criteria
    out = tpl.evaluate();
  } else {
    out = HtmlService.createHtmlOutputFromFile(page);
  }
  return out.setTitle(m.title).addMetaTag('viewport', 'width=device-width, initial-scale=1').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
