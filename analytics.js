(function () {
  const id = window.ELECTROGEST_GA_ID;
  if (!id || id === 'G-XXXXXXXXXX' || !/^G-[A-Z0-9]+$/i.test(id)) return;

  const s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id);
  document.head.appendChild(s);

  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', id, { anonymize_ip: true, send_page_view: true });

  window.electrogestTrack = function (action, params) {
    window.gtag('event', action, params || {});
  };

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        window.electrogestTrack('navigation', { section: tab.dataset.tab || 'inconnu' });
      });
    });
  });
})();
