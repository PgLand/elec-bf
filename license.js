// WARI — activation par clé de licence (une clé = un appareil via Google Sheet)
const LICENSE_STORE = 'wari_license_v1';
const DEVICE_KEY = 'wari_device_id';
const WARI_VERSION = '4';
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

function cleanReturnUrl() {
  const path = location.pathname + location.hash;
  history.replaceState({}, '', path);
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

function redirectToGoogleActivate(key, deviceId) {
  const base = getActivationUrl();
  const returnUrl = location.origin + location.pathname;
  const params = new URLSearchParams({
    action: 'activate',
    key,
    deviceId,
    return: returnUrl
  });
  location.assign(`${base}?${params.toString()}`);
}

function handleActivationReturn() {
  const params = new URLSearchParams(location.search);
  const error = params.get('wari_error');
  const key = params.get('wari_key');
  const client = params.get('wari_client');
  const device = params.get('wari_device');

  if (!error && !key) return null;

  cleanReturnUrl();

  if (error) {
    return { ok: false, error: decodeURIComponent(error.replace(/\+/g, ' ')) };
  }

  if (device !== getDeviceId()) {
    return { ok: false, error: 'Erreur de sécurité lors du retour. Réessayez.' };
  }

  const m = key.toUpperCase().match(/^WARI-([A-Z0-9]{3,16})-[A-F0-9]{8}$/);
  if (!m) {
    return { ok: false, error: 'Clé reçue invalide.' };
  }

  const record = {
    key: key.toUpperCase(),
    slug: m[1],
    clientName: client ? decodeURIComponent(client.replace(/\+/g, ' ')) : slugToLabel(m[1]),
    deviceId: device,
    activatedAt: Date.now()
  };
  saveLicense(record);
  return { ok: true, record };
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

  if (requiresOnlineActivation()) {
    if (!navigator.onLine) {
      return { ok: false, error: 'Connexion internet requise pour activer WARI.' };
    }
    if (location.protocol === 'file:') {
      return { ok: false, error: 'Ouvrez WARI via votre lien GitHub Pages (https://…).' };
    }
    redirectToGoogleActivate(parsed.key, deviceId);
    return { ok: true, redirecting: true };
  }

  const record = {
    key: parsed.key,
    slug: parsed.slug,
    clientName: parsed.clientName,
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

  const returned = handleActivationReturn();
  if (returned?.ok) {
    hideActivateScreen();
    updateLicenseUI(returned.record);
    notifyReady();
    return;
  }

  const lic = getLicense();
  if (isActivated()) {
    hideActivateScreen();
    updateLicenseUI(lic);
    notifyReady();
  } else {
    $('#lockTitle').textContent = 'Activer WARI';
    const ver = $('#lockVersion');
    if (ver) ver.textContent = `Version ${WARI_VERSION} — activation via Google (redirection)`;
    const onlineNote = requiresOnlineActivation()
      ? ' Internet requis : vous serez redirigé vers Google puis de retour ici.'
      : '';
    $('#lockHint').textContent =
      `Entrez la clé personnelle remise par votre vendeur. Une clé = un seul téléphone.${onlineNote}`;
    $('#lockSubmit').textContent = 'Activer';
    $('#lockPassword').type = 'text';
    $('#lockPassword').autocomplete = 'off';
    $('#lockPassword').placeholder = 'Ex. WARI-BOUTIQUEKO-1A2B3C4D';
    showActivateScreen();
    if (returned?.error) setActivateError(returned.error);
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
    if (result.redirecting) return;
    btn.disabled = false;
    btn.textContent = 'Activer';
    if (!result.ok) setActivateError(result.error);
    else $('#lockPassword').value = '';
  });
});
