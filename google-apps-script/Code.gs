/**
 * WARI — Serveur d'activation des licences (Google Apps Script)
 *
 * INSTALLATION :
 * 1. Créez une Google Sheet (voir SETUP.txt) — onglet nommé : licence
 * 2. Extensions → Apps Script → collez ce fichier → Enregistrer
 * 3. Déployer → Nouvelle version → Application web
 *    - Exécuter en tant que : Moi
 *    - Accès : Toute personne disposant du lien
 * 4. Copiez l'URL se terminant par /exec dans license-config.js (activationUrl)
 */

var SHEET_NAME = 'licenses';

function doGet(e) {
  var params = e.parameter || {};
  var action = String(params.action || '').toLowerCase();
  var returnUrl = String(params.return || '');

  if (action === 'activate' && returnUrl && isValidReturnUrl_(returnUrl)) {
    var activateResult = activateLicense_(
      String(params.key || '').trim().toUpperCase(),
      String(params.deviceId || '').trim()
    );
    var target = buildReturnUrl_(returnUrl, activateResult, params);
    return redirectPage_(
      target,
      activateResult.ok ? 'Activation réussie. Retour vers WARI…' : 'Erreur. Retour vers WARI…'
    );
  }

  var result = handleRequest_(params);
  var json = JSON.stringify(result);
  var callback = String(params.callback || '');

  if (/^[a-zA-Z0-9_]+$/.test(callback)) {
    return ContentService
      .createTextOutput(callback + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return respond_(result);
}

function isValidReturnUrl_(url) {
  return /^https:\/\/[a-z0-9.-]+/i.test(url) && url.length < 500;
}

function buildReturnUrl_(returnBase, result, params) {
  var sep = returnBase.indexOf('?') >= 0 ? '&' : '?';
  if (result.ok) {
    return returnBase + sep +
      'wari_key=' + encodeURIComponent(String(params.key || '').trim().toUpperCase()) +
      '&wari_client=' + encodeURIComponent(result.clientName || '') +
      '&wari_device=' + encodeURIComponent(String(params.deviceId || '').trim());
  }
  return returnBase + sep + 'wari_error=' + encodeURIComponent(result.error || 'Erreur activation');
}

function redirectPage_(targetUrl, message) {
  var escaped = targetUrl
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
  return HtmlService.createHtmlOutput(
    '<!DOCTYPE html><html><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>WARI</title></head><body style="font-family:sans-serif;text-align:center;padding:40px">' +
    '<p>' + (message || 'Redirection…') + '</p>' +
    '<p><a id="back" target="_top" href="' + escaped + '" ' +
    'style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;' +
    'border-radius:8px;text-decoration:none;font-weight:bold">Revenir à WARI</a></p>' +
    '<script>' +
    'var u=' + JSON.stringify(targetUrl) + ';' +
    'try{window.top.location.href=u;}catch(e){}' +
    'setTimeout(function(){var a=document.getElementById("back");if(a)a.click();},400);' +
    '</script>' +
    '</body></html>'
  ).setTitle('WARI').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  var body = {};
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return respond_({ ok: false, error: 'Requête invalide' });
  }
  return respond_(handleRequest_(body));
}

function respond_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function handleRequest_(p) {
  var action = String(p.action || '').toLowerCase();
  if (action === 'activate') {
    return activateLicense_(
      String(p.key || '').trim().toUpperCase(),
      String(p.deviceId || '').trim()
    );
  }
  if (action === 'ping') {
    return { ok: true, message: 'WARI activation server OK' };
  }
  return { ok: false, error: 'Action inconnue' };
}

function getLicenseSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('licence')
    || ss.getSheetByName('licences')
    || ss.getSheetByName('licenses');

  if (!sheet) {
    var sheets = ss.getSheets();
    if (sheets.length > 0) {
      sheet = sheets[0];
    }
  }

  if (!sheet) {
    sheet = ss.insertSheet('licence');
    sheet.appendRow(['key', 'client_name', 'device_id', 'activated_at', 'status']);
  }

  return sheet;
}

function findColumn_(headers, names) {
  for (var i = 0; i < names.length; i++) {
    var idx = headers.indexOf(names[i]);
    if (idx >= 0) return idx;
  }
  return -1;
}

function activateLicense_(key, deviceId) {
  if (!key || !deviceId) {
    return { ok: false, error: 'Clé ou appareil manquant.' };
  }
  if (!/^WARI-[A-Z0-9]{3,16}-[A-F0-9]{8}$/.test(key)) {
    return { ok: false, error: 'Format de clé invalide.' };
  }

  var sheet = getLicenseSheet_();
  var rows = sheet.getDataRange().getValues();
  if (rows.length < 2) {
    return { ok: false, error: 'Aucune licence enregistrée. Contactez votre vendeur.' };
  }

  var headers = rows[0].map(function (h) {
    return String(h).toLowerCase().trim();
  });

  var colKey = findColumn_(headers, ['key', 'cle', 'clé']);
  var colClient = findColumn_(headers, ['client_name', 'client', 'nom']);
  var colDevice = findColumn_(headers, ['device_id', 'appareil']);
  var colStatus = findColumn_(headers, ['status', 'statut']);
  var colActivated = findColumn_(headers, ['activated_at', 'date_activation']);

  if (colKey < 0) {
    return { ok: false, error: 'Colonne "key" manquante dans la feuille.' };
  }

  for (var r = 1; r < rows.length; r++) {
    var rowKey = String(rows[r][colKey] || '').trim().toUpperCase();
    if (rowKey !== key) continue;

    var status = colStatus >= 0 ? String(rows[r][colStatus] || '').trim().toLowerCase() : '';
    if (status === 'revoked' || status === 'revoquee' || status === 'révoquée') {
      return { ok: false, error: 'Cette licence a été révoquée. Contactez votre vendeur.' };
    }

    var existingDevice = colDevice >= 0 ? String(rows[r][colDevice] || '').trim() : '';
    var clientName = colClient >= 0 ? String(rows[r][colClient] || '').trim() : '';

    if (existingDevice && existingDevice !== deviceId) {
      return {
        ok: false,
        error: 'Cette clé est déjà activée sur un autre téléphone. Partage non autorisé.'
      };
    }

    if (!existingDevice) {
      if (colDevice >= 0) sheet.getRange(r + 1, colDevice + 1).setValue(deviceId);
      if (colStatus >= 0) sheet.getRange(r + 1, colStatus + 1).setValue('active');
      if (colActivated >= 0) {
        sheet.getRange(r + 1, colActivated + 1).setValue(new Date().toISOString());
      }
    }

    return {
      ok: true,
      clientName: clientName || rowKey,
      key: rowKey
    };
  }

  return { ok: false, error: 'Clé non reconnue. Vérifiez la clé ou contactez votre vendeur.' };
}
