// WARI — activation par clé de licence (une clé = un appareil via Google Sheet)
const LICENSE_STORE = 'wari_license_v1';
const DEVICE_KEY = 'wari_device_id';
const $ = s => document.querySelector(s);

let readyCallbacks = [];

function getSecret() {
  return (window.WARI_LICENSE && window.WARI_LICENSE.secret) || '';
}

function getActivationUrl() {
  const url = (window.WARI_LICENSE && window.WARI_LICENSE.activationUrl) || '';
  if (!url || url.includes('COLLEZ_VOTRE_URL')) return '';
  return url.trim();
}

function requiresOnlineActivation() {
  return !!getActivationUrl();
}

function getDeviceId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

function getLicense() {
  try {
    const raw = localStorage.getItem(LICENSE_STORE);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveLicense(data) {
  localStorage.setItem(LICENSE_STORE, JSON.stringify(data));
}

function slugToLabel(slug) {
  return slug.charAt(0) + slug.slice(1).toLowerCase();
}

async function licenseSignature(slug) {
  const data = new TextEncoder().encode(`${getSecret()}:${slug}`);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('').slice(0, 8).toUpperCase();
}

async function parseLicenseKey(key) {
  const m = key.trim().toUpperCase().match(/^WARI-([A-Z0-9]{3,16})-([A-F0-9]{8})$/);
  if (!m) return null;
  const [, slug, sig] = m;
  const normalized = `WARI-${slug}-${sig}`;

  if (requiresOnlineActivation()) {
    return { slug, clientName: slugToLabel(slug), key: normalized };
  }

  const expected = await licenseSignature(slug);
  if (sig !== expected) return null;
  return { slug, clientName: slugToLabel(slug), key: normalized };
}

function callActivationServer(params) {
  return new Promise((resolve, reject) => {
    const base = getActivationUrl();
    const callbackName = `wariJsonp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const search = new URLSearchParams({ ...params, callback: callbackName });

    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Délai dépassé. Vérifiez votre connexion internet.'));
    }, 25000);

    let script;

    function cleanup() {
      clearTimeout(timeout);
      delete window[callbackName];
      if (script && script.parentNode) script.parentNode.removeChild(script);
    }

    window[callbackName] = (data) => {
      cleanup();
      resolve(data);
    };

    script = document.createElement('script');
    script.src = `${base}?${search.toString()}`;
    script.async = true;
    script.onerror = () => {
      cleanup();
      if (location.protocol === 'file:') {
        reject(new Error('Ouvrez WARI via votre lien GitHub Pages (pas le fichier local).'));
      } else {
        reject(new Error(
          'Connexion Google impossible. Redéployez Apps Script (nouvelle version) avec le Code.gs mis à jour.'
        ));
      }
    };
    document.head.appendChild(script);
  });
}

async function verifyOnline(key, deviceId) {
  const base = getActivationUrl();
  if (!base) return { ok: true };

  if (!navigator.onLine) {
    throw new Error('Connexion internet requise pour activer WARI (première utilisation).');
  }

  if (location.protocol === 'file:') {
    throw new Error('Ouvrez WARI via le lien https://… (GitHub Pages), pas en double-cliquant sur index.html.');
  }

  const data = await callActivationServer({ action: 'activate', key, deviceId });

  if (!data.ok) {
    throw new Error(data.error || 'Activation refusée par le serveur.');
  }
  return data;
}

function isActivated() {
  const lic = getLicense();
  return !!(lic && lic.key && lic.deviceId === getDeviceId());
}

function showActivateScreen() {
  document.body.classList.add('app-locked');
  $('#lockScreen').hidden = false;
}

function hideActivateScreen() {
  document.body.classList.remove('app-locked');
  $('#lockScreen').hidden = true;
}

function setActivateError(msg) {
  const el = $('#lockError');
  if (!el) return;
  el.textContent = msg || '';
  el.hidden = !msg;
}

function updateLicenseUI(lic) {
  const badge = $('#licenseBadge');
  if (badge && lic) {
    badge.hidden = false;
    badge.textContent = lic.clientName;
    badge.title = `Licence : ${lic.key}`;
  }
  const info = $('#licenseInfo');
  if (info && lic) {
    info.innerHTML = `<strong>${lic.clientName}</strong><br><span class="muted small">${lic.key}</span>`;
  }
}

function notifyReady() {
  readyCallbacks.forEach(cb => cb());
  readyCallbacks = [];
}

async function activateLicense(rawKey) {
  const parsed = await parseLicenseKey(rawKey);
  if (!parsed) {
    return { ok: false, error: 'Format de clé invalide. Demandez votre clé personnelle au vendeur.' };
  }

  const deviceId = getDeviceId();
  const existing = getLicense();

  if (existing) {
    if (existing.key !== parsed.key) {
      return { ok: false, error: 'Une autre licence est déjà active sur cet appareil.' };
    }
    if (existing.deviceId !== deviceId) {
      return { ok: false, error: 'Cette licence est liée à un autre appareil.' };
    }
    hideActivateScreen();
    updateLicenseUI(existing);
    notifyReady();
    return { ok: true };
  }

  let online = { ok: true };
  try {
    online = await verifyOnline(parsed.key, deviceId);
  } catch (err) {
    return { ok: false, error: err.message || 'Activation impossible.' };
  }

  const record = {
    key: parsed.key,
    slug: parsed.slug,
    clientName: online.clientName || parsed.clientName,
    deviceId,
    activatedAt: Date.now()
  };
  saveLicense(record);
  hideActivateScreen();
  updateLicenseUI(record);
  notifyReady();
  return { ok: true };
}

window.WariLicense = {
  whenReady(cb) {
    if (isActivated()) cb();
    else readyCallbacks.push(cb);
  },
  getLicense,
  requiresOnlineActivation
};

document.addEventListener('DOMContentLoaded', () => {
  const form = $('#lockForm');
  if (!form) return;

  const lic = getLicense();
  if (isActivated()) {
    hideActivateScreen();
    updateLicenseUI(lic);
    notifyReady();
  } else {
    $('#lockTitle').textContent = 'Activer WARI';
    const ver = $('#lockVersion');
    if (ver) ver.textContent = 'Version 3 — si vous voyez « Failed to fetch », videz le cache du navigateur.';
    const onlineNote = requiresOnlineActivation()
      ? ' Connexion internet requise pour la première activation.'
      : '';
    $('#lockHint').textContent =
      `Entrez la clé personnelle remise par votre vendeur. Une clé = un seul téléphone.${onlineNote}`;
    $('#lockSubmit').textContent = 'Activer';
    $('#lockPassword').type = 'text';
    $('#lockPassword').autocomplete = 'off';
    $('#lockPassword').placeholder = 'Ex. WARI-BOUTIQUEKO-1A2B3C4D';
    showActivateScreen();
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    setActivateError('');
    const key = $('#lockPassword').value.trim();
    if (!key) {
      setActivateError('Saisissez votre clé de licence.');
      return;
    }
    const btn = $('#lockSubmit');
    btn.disabled = true;
    btn.textContent = 'Activation…';
    const result = await activateLicense(key);
    btn.disabled = false;
    btn.textContent = 'Activer';
    if (!result.ok) setActivateError(result.error);
    else $('#lockPassword').value = '';
  });
});
