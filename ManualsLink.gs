// User manuals live in a separate Apps Script project ("MTN Manuals", folder Manuals App/) since 2026-10-29 — the embedded
// screenshots pushed this project past the Apps Script size limit. Links use MANUALS_URL; old ?page=xxx-manual links
// (bookmarks, PDFs, the MNC project's flood manual link) land on manualMovedPage_() which points to the new address.
var MANUALS_URL = 'https://script.google.com/macros/s/AKfycbx2LKuwYTg9R5U_1MRSZB_UZvL-FGCLKxNcMe42kr_uBTEsistAelM8i_YlVMJzzw3geQ/exec';
var MANUAL_PAGES_ = ["flood-recovery-manual", "hyper-manual", "sc-manual", "hb-manual", "fa-manual", "admin-manual", "cctv-manual", "survey-manual", "aircon-manual", "ref-manual", "np-manual", "layout-manual", "hours-manual", "edmi-manual"];

function manualMovedPage_(e) {
  var q = Object.keys(e.parameter || {}).map(function(k) { return encodeURIComponent(k) + '=' + encodeURIComponent(e.parameter[k]); }).join('&');
  var url = MANUALS_URL + (q ? '?' + q : '');
  var h = '<div style="font-family:sans-serif;max-width:520px;margin:60px auto;text-align:center;padding:16px">' +
      '<div style="font-size:42px">📖</div><h2 style="margin:8px 0">คู่มือย้ายไปที่อยู่ใหม่แล้ว</h2>' +
      '<p style="color:#555">คู่มือการใช้งานทั้งหมดย้ายไปไว้ที่ลิงก์ใหม่ (กดปุ่มด้านล่าง) — กรุณาอัปเดตบุ๊กมาร์กด้วยครับ</p>' +
      '<a href="' + url + '" target="_top" style="display:inline-block;margin-top:10px;padding:10px 22px;background:#7c3aed;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold">เปิดคู่มือ</a>' +
      '<p style="font-size:12px;color:#888;margin-top:18px;word-break:break-all">' + url + '</p></div>';
  return HtmlService.createHtmlOutput(h).setTitle('คู่มือย้ายแล้ว').addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
