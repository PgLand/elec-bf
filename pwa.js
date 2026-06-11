let deferredInstallPrompt = null;

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches
  || window.navigator.standalone === true;

const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  updateInstallUI();
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  updateInstallUI('Application installée sur cet appareil.');
});

function updateInstallUI(message) {
  const btn = document.getElementById('btnInstall');
  const status = document.getElementById('installStatus');
  if (!btn || !status) return;

  if (isStandalone()) {
    btn.hidden = true;
    status.textContent = message || 'Vous utilisez WARI en mode application.';
    return;
  }

  if (deferredInstallPrompt) {
    btn.hidden = false;
    status.textContent = 'Installation disponible sur cet appareil.';
    return;
  }

  btn.hidden = true;
  if (isIOS()) {
    status.textContent = 'Sur iPhone/iPad : ouvrez Safari, puis Partager → « Sur l\'écran d\'accueil ».';
  } else {
    status.textContent = message || 'Utilisez le menu du navigateur pour ajouter WARI à l\'écran d\'accueil.';
  }
}

async function installApp() {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  updateInstallUI();
}

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('btnInstall');
  if (btn) btn.addEventListener('click', installApp);

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  updateInstallUI();
});
