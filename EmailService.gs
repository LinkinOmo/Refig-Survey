// ─── Email delivery with Brevo fallback ─────────────────────────────────────
// Gmail (MailApp) has a small daily quota (~100 recipients/day on consumer
// accounts) and every notification in this app consumes it. sendAppEmail_()
// sends through MailApp while quota remains and falls back to the Brevo
// transactional-email API (https://api.brevo.com/v3/smtp/email) when the
// quota is exhausted or MailApp throws.
//
// Configure via ?page=email-config (Admin / System Admin). The API key lives
// ONLY in Script Properties — never hardcode it here; this repository may be
// pushed to GitHub.
//
// NOTE: the Brevo sender email must be a verified sender in the Brevo
// account, otherwise Brevo rejects the send with HTTP 400.
//
// Ported from the "MTN APP" (Web App People MNC) project's EmailService.js —
// same pattern, adapted to this project's checkAdminStatus() shape (isSysAdmin
// instead of isSuperAdmin) and default sender name.

var BREVO_PROP_KEY     = 'brevo_api_key';
var BREVO_PROP_SENDER  = 'brevo_sender_email';
var BREVO_PROP_NAME    = 'brevo_sender_name';
var BREVO_PROP_ENABLED = 'brevo_enabled';

function _getBrevoCfg_() {
  var p = PropertiesService.getScriptProperties();
  return {
    enabled:     p.getProperty(BREVO_PROP_ENABLED) === 'true',
    apiKey:      p.getProperty(BREVO_PROP_KEY) || '',
    senderEmail: p.getProperty(BREVO_PROP_SENDER) || '',
    senderName:  p.getProperty(BREVO_PROP_NAME) || 'Mini Big C Maintenance'
  };
}

// Drop-in replacement for MailApp.sendEmail(options).
// opts: { to, cc?, subject, htmlBody?, body?, attachments? (Blob[]) }
// Returns { success: true, via: 'gmail'|'brevo' }; throws only when BOTH
// channels fail (same surface as the old bare MailApp.sendEmail call, so the
// callers' existing try/catch semantics are unchanged).
function sendAppEmail_(opts) {
  var quota = -1;
  try { quota = MailApp.getRemainingDailyQuota(); } catch (e) {}

  if (quota === 0) {
    var br = _sendViaBrevo_(opts);
    if (br.success) {
      Logger.log('sendAppEmail_: Gmail quota exhausted — sent via Brevo to ' + opts.to);
      return { success: true, via: 'brevo', reason: 'gmail-quota-exhausted' };
    }
    Logger.log('sendAppEmail_: Gmail quota exhausted AND Brevo failed: ' + br.error);
    // fall through — let MailApp throw the real quota error below
  }

  try {
    MailApp.sendEmail(opts);
    return { success: true, via: 'gmail' };
  } catch (gmailErr) {
    var br2 = _sendViaBrevo_(opts);
    if (br2.success) {
      Logger.log('sendAppEmail_: MailApp threw (' + gmailErr + ') — sent via Brevo to ' + opts.to);
      return { success: true, via: 'brevo', reason: String(gmailErr) };
    }
    Logger.log('sendAppEmail_: both channels failed. Gmail: ' + gmailErr + ' | Brevo: ' + br2.error);
    throw gmailErr;
  }
}

// Sends one email through the Brevo transactional API.
// Returns { success, error? } — never throws.
function _sendViaBrevo_(opts) {
  try {
    var cfg = _getBrevoCfg_();
    if (!cfg.enabled)     return { success: false, error: 'Brevo fallback is disabled (Email Delivery admin page).' };
    if (!cfg.apiKey)      return { success: false, error: 'No Brevo API key saved.' };
    if (!cfg.senderEmail) return { success: false, error: 'No Brevo sender email saved.' };

    var toRcpt = _brevoRecipients_(opts.to);
    if (!toRcpt.length) return { success: false, error: 'No recipients.' };

    var payload = {
      sender: { email: cfg.senderEmail, name: cfg.senderName || 'Mini Big C Maintenance' },
      to: toRcpt,
      subject: String(opts.subject || '(no subject)')
    };
    var ccRcpt = _brevoRecipients_(opts.cc);
    if (ccRcpt.length) payload.cc = ccRcpt;

    if (opts.htmlBody) {
      payload.htmlContent = String(opts.htmlBody);
    } else {
      payload.textContent = String(opts.body || '');
    }

    if (opts.attachments && opts.attachments.length) {
      payload.attachment = opts.attachments.map(function (blob, i) {
        return {
          name: (blob.getName && blob.getName()) || ('attachment-' + (i + 1)),
          content: Utilities.base64Encode(blob.getBytes())
        };
      });
    }

    var resp = UrlFetchApp.fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'api-key': cfg.apiKey, 'accept': 'application/json' },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    var code = resp.getResponseCode();
    if (code >= 200 && code < 300) return { success: true };
    return { success: false, error: 'Brevo HTTP ' + code + ': ' + String(resp.getContentText()).slice(0, 300) };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// "a@x.com, b@y.com; c@z.com" → [{email:'a@x.com'}, …]
function _brevoRecipients_(v) {
  return String(v || '').split(/[,;]+/)
    .map(function (s) { return s.trim(); })
    .filter(function (s) { return s.indexOf('@') > 0; })
    .map(function (e) { return { email: e }; });
}

// ─── Email Config admin endpoints (Admin / System Admin) ─────────────────────

function _isEmailConfigAdmin_(email) {
  if (!email) return false;
  try {
    var c = checkAdminStatus(email);
    return !!(c && (c.isAdmin || c.isSysAdmin));
  } catch (e) { return false; }
}

function getEmailConfig(callerEmail) {
  if (!_isEmailConfigAdmin_(callerEmail)) return { success: false, error: 'Admins only' };
  var cfg = _getBrevoCfg_();
  var quota = -1;
  try { quota = MailApp.getRemainingDailyQuota(); } catch (e) {}
  return {
    success: true,
    enabled: cfg.enabled,
    senderEmail: cfg.senderEmail,
    senderName: cfg.senderName,
    // Never return the full key to the client — only enough to confirm it's saved.
    hasKey: !!cfg.apiKey,
    keyTail: cfg.apiKey ? cfg.apiKey.slice(-6) : '',
    gmailQuotaLeft: quota
  };
}

// cfg: { enabled, senderEmail, senderName, apiKey? } — an empty apiKey keeps
// the stored one; pass clearKey:true to delete it.
function saveEmailConfig(callerEmail, cfg) {
  if (!_isEmailConfigAdmin_(callerEmail)) return { success: false, error: 'Admins only' };
  try {
    var p = PropertiesService.getScriptProperties();
    cfg = cfg || {};
    p.setProperty(BREVO_PROP_ENABLED, cfg.enabled ? 'true' : 'false');
    p.setProperty(BREVO_PROP_SENDER, String(cfg.senderEmail || '').trim());
    p.setProperty(BREVO_PROP_NAME, String(cfg.senderName || '').trim());
    if (cfg.clearKey) {
      p.deleteProperty(BREVO_PROP_KEY);
    } else if (cfg.apiKey && String(cfg.apiKey).trim()) {
      p.setProperty(BREVO_PROP_KEY, String(cfg.apiKey).trim());
    }
    return getEmailConfig(callerEmail);
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

// Sends a test email to the caller through Brevo directly (bypasses Gmail),
// so the key + verified sender can be checked without waiting for a real
// quota exhaustion.
function testBrevoEmail(callerEmail) {
  if (!_isEmailConfigAdmin_(callerEmail)) return { success: false, error: 'Admins only' };
  var res = _sendViaBrevo_({
    to: callerEmail,
    subject: 'Mini Big C Maintenance — Brevo test email',
    htmlBody: '<p>✅ Brevo fallback is working.</p>' +
              '<p style="color:#64748b;font-size:12px">Sent ' + new Date() + ' from the Email Delivery admin page. ' +
              'This channel is used automatically when the Gmail daily quota is exhausted.</p>'
  });
  return res.success
    ? { success: true, message: 'Test email sent via Brevo to ' + callerEmail }
    : { success: false, error: res.error };
}
