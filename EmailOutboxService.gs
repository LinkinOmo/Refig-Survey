/**
 * Local-Outlook email fallback — the third rung when BOTH Gmail's daily MailApp
 * quota AND Brevo fail to send. Apps Script has no way to reach into a machine on
 * the AVP's desk on its own, so this is a pull queue instead of a push: a row is
 * queued here, and a local Python script (running Outlook via pywin32 on the AVP's
 * own PC, scheduled with Windows Task Scheduler) polls a token-gated doGet route
 * over plain HTTP to claim + send it, then reports back sent/failed.
 *
 * Ported from the "GAS Vendor Portal" sibling project's EmailOutboxService.gs —
 * same pattern, adapted to this project's shape:
 *  - This is a container-bound script (no SpreadsheetApp.openById anywhere in
 *    the codebase), so _outboxSheet_() uses SpreadsheetApp.getActiveSpreadsheet()
 *    directly rather than a portal-style "open by ID" helper.
 *  - There is no generic _findRowByColumnValue_ helper in this codebase, so
 *    _outboxAck_ scans the sheet directly instead.
 *  - sendAppEmail_'s opts.attachments are Blob objects (not {b64,name,mime}),
 *    matching how _sendViaBrevo_ in EmailService.gs consumes them — so
 *    _queueOutboxEmail_ here accepts Blobs and base64-encodes them itself.
 */

var SHEET_EMAIL_OUTBOX = "email_outbox";
var EMAIL_OUTBOX_HEADERS = ['id', 'to', 'cc', 'subject', 'html_body', 'attachments_json',
  'status', 'created_at', 'claimed_at', 'sent_at', 'error',
  'forced']; // 'true' only for rows queued via the outboxForceBypass testing toggle
  // (Gmail/Brevo deliberately skipped, not failed) — lets _outboxAck_ know it's worth
  // falling back to them if Outlook itself then fails. Trailing/additive column.

function _outboxSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_EMAIL_OUTBOX);
  if (!sh) { sh = ss.insertSheet(SHEET_EMAIL_OUTBOX); sh.appendRow(EMAIL_OUTBOX_HEADERS); }
  else _outboxEnsureHeaders_(sh);
  return sh;
}

// Appends any EMAIL_OUTBOX_HEADERS column missing from row 1 (e.g. the new 'forced'
// column on a sheet created before it existed) — never removes or reorders existing
// columns. This codebase has no shared "_ensureHeaders_" equivalent, so it's local here.
function _outboxEnsureHeaders_(sh) {
  var lastCol = sh.getLastColumn();
  var existing = lastCol > 0 ? sh.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  var missing = EMAIL_OUTBOX_HEADERS.filter(function (h) { return existing.indexOf(h) === -1; });
  if (missing.length) sh.getRange(1, existing.length + 1, 1, missing.length).setValues([missing]);
}

// Each column is its OWN cell, so each gets its own independent ~50,000-character
// Sheets cap, not a budget shared across the row — leave a small safety margin
// under the true limit for each (see Vendor Portal's EmailOutboxService.gs for
// the full story on why this was originally set too low).
var OUTBOX_MAX_ATTACHMENTS_JSON_CHARS_ = 48000;
var OUTBOX_MAX_HTML_BODY_CHARS_ = 48000;

// recipients/cc: comma-separated strings (as used by sendAppEmail_'s opts.to/opts.cc).
// attachments: Blob[] (same shape sendAppEmail_ passes to _sendViaBrevo_), optional.
function _queueOutboxEmail_(recipients, cc, subject, fullHtml, attachments, forced) {
  var attJson = '[]', note = '';
  if (attachments && attachments.length) {
    try {
      var slim = attachments.map(function (blob, i) {
        return {
          b64: Utilities.base64Encode(blob.getBytes()),
          name: (blob.getName && blob.getName()) || ('attachment-' + (i + 1)),
          mime: (blob.getContentType && blob.getContentType()) || ''
        };
      });
      var candidate = JSON.stringify(slim);
      if (candidate.length <= OUTBOX_MAX_ATTACHMENTS_JSON_CHARS_) attJson = candidate;
      else note = 'attachment omitted (too large for the outbox queue) · ';
    } catch (attErr) {
      note = 'attachment omitted (encode error) · ';
    }
  }
  var html = String(fullHtml || '');
  if (html.length > OUTBOX_MAX_HTML_BODY_CHARS_) {
    html = html.slice(0, OUTBOX_MAX_HTML_BODY_CHARS_) + '<p><em>[truncated for outbox queue]</em></p>';
  }
  var toStr = Array.isArray(recipients) ? recipients.join(',') : String(recipients || '');
  var ccStr = Array.isArray(cc) ? cc.join(',') : String(cc || '');
  var sh = _outboxSheet_();
  sh.appendRow([
    Utilities.getUuid(), toStr, ccStr,
    String(subject || ''), html, attJson, 'pending', new Date(), '', '', note,
    forced ? 'true' : ''
  ]);
}

function _outboxClaimPending_(limit) {
  limit = Math.max(1, Math.min(50, Number(limit) || 20));
  var sh = _outboxSheet_();
  if (sh.getLastRow() < 2) return { error: null, emails: [] };
  var data = sh.getDataRange().getValues();
  var H = {}; data[0].forEach(function (h, i) { H[String(h).trim()] = i; });
  var now = new Date();
  var staleCutoffMs = now.getTime() - 10 * 60 * 1000;
  var claimed = [];
  for (var r = 1; r < data.length && claimed.length < limit; r++) {
    var status = String(data[r][H['status']] || '');
    var claimedAtVal = data[r][H['claimed_at']];
    var claimedAtMs = claimedAtVal ? new Date(claimedAtVal).getTime() : 0;
    var eligible = status === 'pending' || (status === 'claimed' && claimedAtMs < staleCutoffMs);
    if (!eligible) continue;
    sh.getRange(r + 1, H['status'] + 1).setValue('claimed');
    sh.getRange(r + 1, H['claimed_at'] + 1).setValue(now);
    var attachments = [];
    try { attachments = JSON.parse(data[r][H['attachments_json']] || '[]'); } catch (parseErr) { attachments = []; }
    claimed.push({
      id: String(data[r][H['id']] || ''), to: String(data[r][H['to']] || ''),
      cc: String(data[r][H['cc']] || ''), subject: String(data[r][H['subject']] || ''),
      html_body: String(data[r][H['html_body']] || ''), attachments: attachments
    });
  }
  return { error: null, emails: claimed };
}

// No generic _findRowByColumnValue_ helper exists in this codebase — scan the outbox
// sheet directly for the id column. Returns the full row keyed by header (plus `_row`,
// 1-based sheet row index) or null.
function _outboxFindRowById_(sh, id) {
  var data = sh.getDataRange().getValues();
  var headers = data[0];
  var idCol = headers.indexOf('id');
  for (var r = 1; r < data.length; r++) {
    if (String(data[r][idCol] || '') === id) {
      var obj = {};
      for (var c = 0; c < headers.length; c++) obj[headers[c]] = data[r][c];
      obj._row = r + 1;
      return obj;
    }
  }
  return null;
}

/**
 * Auto cleanup: a row that actually got delivered has no further use, so 'sent'
 * deletes the row instead of just marking it (batch by batch as the poller acks
 * each email it just sent — no separate cleanup job needed).
 *
 * Bypass fallback: if Outlook itself fails on a row queued via the outboxForceBypass
 * testing toggle (`forced==='true'` — Gmail/Brevo were deliberately SKIPPED for that
 * row, not failed), this is a real chance at delivery, so it tries them for real via
 * _tryGmailThenBrevo_ (EmailService.gs) before giving up. A genuine third-rung row
 * (Gmail AND Brevo already failed moments before it was queued) does NOT get this
 * retry — nothing would have changed — it's held 'failed' for manual review instead.
 */
function _outboxAck_(id, result, errMsg) {
  if (!id) return { error: 'bad_id' };
  var sh = _outboxSheet_();
  var row = _outboxFindRowById_(sh, id);
  if (!row) return { error: 'not_found' };

  if (result === 'sent') {
    sh.deleteRow(row._row);
    return { error: null };
  }

  if (String(row.forced || '').toLowerCase() === 'true') {
    var attachments = [];
    try { attachments = JSON.parse(row.attachments_json || '[]'); } catch (e) { attachments = []; }
    var fb = { success: false, error: 'no valid recipient' };
    if (String(row.to || '').trim()) {
      fb = _tryGmailThenBrevo_({
        to: row.to, cc: row.cc || undefined,
        subject: row.subject, htmlBody: row.html_body,
        attachments: attachments.map(function (a) {
          return Utilities.newBlob(Utilities.base64Decode(a.b64), a.mime || 'application/octet-stream', a.name);
        })
      });
    }
    if (fb.success) {
      sh.deleteRow(row._row);   // delivered after all — same auto cleanup as a direct 'sent'
      return { error: null, fallback: fb.via };
    }
    errMsg = String(errMsg || 'Outlook failed') + ' · fallback to Gmail/Brevo also failed: ' + fb.error;
  }

  var col = function (name) { return EMAIL_OUTBOX_HEADERS.indexOf(name) + 1; };
  sh.getRange(row._row, col('status')).setValue('failed');
  if (errMsg) sh.getRange(row._row, col('error')).setValue(String(errMsg).slice(0, 500));
  return { error: null };
}

/**
 * Stale-row fallback sweep — covers the case the poller itself never runs (PC off/asleep,
 * scheduled task disabled/deleted), not just "Outlook failed on a claimed row" (that's the
 * bypass fallback in _outboxAck_ above). A genuine third-rung row would otherwise sit
 * 'pending' forever since nothing on that PC is polling it. This sweep runs on Apps Script's
 * own clock and retries Gmail→Brevo for any row that's been 'pending' too long — a dead/
 * disabled poller degrades to "arrives a bit later via Gmail/Brevo" instead of "never
 * arrives." Only 'pending' rows are touched; 'claimed' means the poller IS alive and working
 * it. Mirrors Vendor Portal's EmailOutboxService.gs.
 */
var OUTBOX_STALE_SWEEP_TRIGGER_FN = 'sweepStaleOutboxRows';

function _outboxStaleSweepConfig_() {
  var p = PropertiesService.getScriptProperties();
  var enabledRaw = p.getProperty('outboxStaleFallbackEnabled');
  var minutesRaw = Number(p.getProperty('outboxStaleMinutes'));
  return {
    enabled: enabledRaw === null ? true : enabledRaw === 'true',
    staleMinutes: minutesRaw > 0 ? minutesRaw : 15
  };
}

/** force=true (from testOutboxStaleSweep) bypasses only the enabled gate, not the staleness
 *  threshold. No trailing underscore — this is the trigger's own handler function. */
function sweepStaleOutboxRows(force) {
  var cfg = _outboxStaleSweepConfig_();
  if (!force && !cfg.enabled) return { skipped: true, reason: 'disabled' };
  var sh = _outboxSheet_();
  if (sh.getLastRow() < 2) return { skipped: false, scanned: 0, recovered: [], errors: [] };
  var data = sh.getDataRange().getValues();
  var H = {}; data[0].forEach(function (h, i) { H[String(h).trim()] = i; });
  var now = new Date();
  var cutoffMs = now.getTime() - cfg.staleMinutes * 60 * 1000;
  var recovered = [], errors = [];
  // Walk bottom-up so deleteRow doesn't shift the index of rows not yet visited.
  for (var r = data.length - 1; r >= 1; r--) {
    var status = String(data[r][H['status']] || '');
    if (status !== 'pending') continue;
    var createdAtVal = data[r][H['created_at']];
    var createdAt = createdAtVal ? new Date(createdAtVal) : null;
    if (!createdAt || isNaN(createdAt.getTime()) || createdAt.getTime() > cutoffMs) continue;
    var id = String(data[r][H['id']] || '');
    var subject = String(data[r][H['subject']] || '');
    var to = String(data[r][H['to']] || '').trim();
    var cc = String(data[r][H['cc']] || '').trim();
    if (!to) { errors.push({ id: id, subject: subject, message: 'no valid recipient' }); continue; }
    var attachments = [];
    try { attachments = JSON.parse(data[r][H['attachments_json']] || '[]'); } catch (parseErr) { attachments = []; }
    try {
      var res = _tryGmailThenBrevo_({
        to: to, cc: cc || undefined,
        subject: subject, htmlBody: String(data[r][H['html_body']] || ''),
        attachments: attachments.map(function (a) {
          return Utilities.newBlob(Utilities.base64Decode(a.b64), a.mime || 'application/octet-stream', a.name);
        })
      });
      if (res.success) { sh.deleteRow(r + 1); recovered.push({ id: id, subject: subject, via: res.via }); }
      else errors.push({ id: id, subject: subject, message: res.error });
    } catch (sendErr) {
      errors.push({ id: id, subject: subject, message: sendErr.toString() });
    }
  }
  return { skipped: false, scanned: data.length - 1, recovered: recovered, errors: errors };
}

/** Admin only: (re)install the sweep trigger. Runs every 5 min (same cadence as the poller).
 *  Callable from email-config.html, same gating as setOutboxForceBypass. */
function installOutboxStaleSweepTrigger(callerEmail) {
  if (!_isEmailConfigAdmin_(callerEmail)) return { success: false, error: 'Admins only' };
  try {
    var triggers = ScriptApp.getProjectTriggers();
    var wasInstalled = false;
    triggers.forEach(function (t) {
      if (t.getHandlerFunction() === OUTBOX_STALE_SWEEP_TRIGGER_FN) { ScriptApp.deleteTrigger(t); wasInstalled = true; }
    });
    ScriptApp.newTrigger(OUTBOX_STALE_SWEEP_TRIGGER_FN).timeBased().everyMinutes(5).create();
    return { success: true, already_installed: wasInstalled };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function getOutboxStaleSweepStatus() {
  var triggers = ScriptApp.getProjectTriggers();
  var installed = triggers.some(function (t) { return t.getHandlerFunction() === OUTBOX_STALE_SWEEP_TRIGGER_FN; });
  var cfg = _outboxStaleSweepConfig_();
  return { installed: installed, enabled: cfg.enabled, staleMinutes: cfg.staleMinutes };
}

function setOutboxStaleFallback(enabled, callerEmail) {
  if (!_isEmailConfigAdmin_(callerEmail)) return { success: false, error: 'Admins only' };
  try {
    PropertiesService.getScriptProperties().setProperty('outboxStaleFallbackEnabled', enabled ? 'true' : 'false');
    return { success: true, enabled: !!enabled };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

/** Admin only: force-runs the sweep right now (bypassing the enabled toggle) and returns
 *  what it found/recovered, so an admin can verify it before turning it on for real. */
function testOutboxStaleSweep(callerEmail) {
  if (!_isEmailConfigAdmin_(callerEmail)) return { success: false, error: 'Admins only' };
  return { success: true, result: sweepStaleOutboxRows(true) };
}

function handleOutboxRequest_(e) {
  var p = (e && e.parameter) || {};
  var expected = PropertiesService.getScriptProperties().getProperty('outboxPollToken');
  var out;
  if (!expected || String(p.token || '') !== expected) {
    out = { error: 'unauthorized' };
  } else {
    var action = String(p.action || 'pending');
    if (action === 'pending') out = _outboxClaimPending_(p.limit);
    else if (action === 'ack') out = _outboxAck_(String(p.id || ''), String(p.result || ''), String(p.error || ''));
    else out = { error: 'bad_action' };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

// ── Email Delivery Config page: force-bypass toggle (skip Gmail/Brevo, queue
// straight to Outlook) — a Script Property so it's a real on/off switch in
// email-config.html rather than something that needs a clasp push to flip.
function getOutboxForceBypass() {
  try { return PropertiesService.getScriptProperties().getProperty('outboxForceBypass') === 'true'; }
  catch (e) { return false; }
}
function setOutboxForceBypass(enabled, callerEmail) {
  if (!_isEmailConfigAdmin_(callerEmail)) return { success: false, error: 'Admins only' };
  try {
    PropertiesService.getScriptProperties().setProperty('outboxForceBypass', enabled ? 'true' : 'false');
    return { success: true, enabled: !!enabled };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}
