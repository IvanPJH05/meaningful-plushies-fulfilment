(() => {
  async function loadCertificate(root) {
    if (root.dataset.loaded) return;
    root.dataset.loaded = 'true';
    const status = root.querySelector('[data-nfc-status]');
    const inactive = root.querySelector('[data-nfc-inactive]').content.textContent;
    const failure = root.querySelector('[data-nfc-error]').content.textContent;
    const token = new URLSearchParams(window.location.search).get('card') || '';
    if (!/^[a-f0-9]{32}$/.test(token)) {
      status.textContent = inactive;
      return;
    }
    try {
      const path = root.dataset.proxyPath.replace(/\/$/, '');
      if (!/^\/[a-z0-9-]+\/[a-z0-9-]+$/.test(path)) throw new Error('Invalid proxy path');
      const response = await fetch(`${path}/nfc-certificate?card=${token}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Certificate unavailable');
      const data = await response.json();
      if (data.status === 'inactive') {
        status.textContent = inactive;
        return;
      }
      if (data.status === 'our_link') {
        const url = new URL(data.url);
        if (url.protocol !== 'https:' || !['meaningfulplushies.com', 'www.meaningfulplushies.com'].includes(url.hostname)
          || url.pathname !== '/apps/closer' || url.username || url.password || url.port) throw new Error('Invalid link');
        const link = root.querySelector('[data-nfc-our-link]');
        link.href = url.href;
        link.hidden = false;
      } else if (data.status === 'ready' && data.certificate) {
        root.querySelectorAll('[data-nfc-field]').forEach(field => {
          field.textContent = data.certificate[field.dataset.nfcField] || '—';
        });
        root.querySelector('[data-nfc-note]').hidden = !data.certificate.note?.trim();
        root.querySelector('[data-nfc-details]').hidden = false;
      } else {
        throw new Error('Invalid certificate');
      }
      status.hidden = true;
    } catch {
      status.textContent = failure;
    }
  }
  function initialize() {
    document.querySelectorAll('[data-nfc-certificate]').forEach(root => void loadCertificate(root));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize);
  else initialize();
  document.addEventListener('shopify:section:load', initialize);
})();
