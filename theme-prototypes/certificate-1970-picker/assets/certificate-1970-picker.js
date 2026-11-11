(() => {
  const key = 'mp:certificate-choice:19701698520:v1';
  const allowed = new Set(['19701698520-1', '19701698520-2']);
  function remember(code) {
    try { window.localStorage.setItem(key, code); } catch { /* Choosing still works with browser storage disabled. */ }
  }
  for (const root of document.querySelectorAll('[data-mp-card-1970]')) {
    if (root.dataset.mode === 'certificate') {
      if (allowed.has(root.dataset.cardCode)) remember(root.dataset.cardCode);
      continue;
    }
    if (root.dataset.mode !== 'picker' || root.dataset.cardCode !== '19701698520') continue;
    const dialog = root.querySelector('[data-card-dialog]');
    const choices = Array.from(root.querySelectorAll('[data-card-choice]')).filter(link => allowed.has(link.dataset.cardChoice));
    const destination = link => {
      const url = new URL(link.getAttribute('href'), window.location.origin);
      return url.origin === window.location.origin && url.pathname === '/pages/certificate/' + link.dataset.cardChoice ? url.href : null;
    };
    let saved = null;
    try { saved = window.localStorage.getItem(key); } catch { /* Ask again when storage is unavailable. */ }
    const forceChoice = new URL(window.location.href).searchParams.get('choose') === '1';
    const selected = !forceChoice && allowed.has(saved) && choices.find(link => link.dataset.cardChoice === saved);
    if (selected && destination(selected)) {
      window.location.replace(destination(selected));
      continue;
    }
    for (const link of choices) link.addEventListener('click', event => {
      const url = destination(link);
      if (!url || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button > 0) return;
      event.preventDefault();
      remember(link.dataset.cardChoice);
      window.location.replace(url);
    });
    if (dialog && typeof dialog.showModal === 'function') {
      dialog.removeAttribute('open');
      dialog.showModal();
      dialog.addEventListener('cancel', event => event.preventDefault());
    }
  }
})();
