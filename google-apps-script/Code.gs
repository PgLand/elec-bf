/**
 * WARI — Serveur d'activation des licences (Google Apps Script)
 *
 * INSTALLATION :
 * 1. Créez une Google Sheet (voir SETUP.txt)
 * 2. Extensions → Apps Script → collez ce fichier → Enregistrer
 * 3. Déployer → Nouvelle version → Application web
 *    - Exécuter en tant que : Moi
 *    - Accès : Toute personne disposant du lien
 * 4. Copiez l'URL se terminant par /exec dans license-config.js (activationUrl)
 */

var SHEET_NAME = 'licenses';

function doGet(e) {
  return respond_(handleRequest_(e.parameter || {}));
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
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    throw new Error('Feuille "' + SHEET_NAME + '" introuvable.');
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
