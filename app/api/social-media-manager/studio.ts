export const studio = `<!doctype html>
<html lang="en" class="embedded-studio" data-store="__SOCIAL_STORE__">
<head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'self'; media-src blob:; img-src 'self' blob: data:; connect-src 'none'; base-uri 'none'; form-action 'none'"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Social Media Manager · Meaningful Plushies</title><link rel="stylesheet" href="/social-media-manager/style.css"></head>
<body>
  <aside class="sidebar">
    <div class="brand"><b>MP</b><span>Meaningful Plushies<small>Publishing Studio</small></span></div>
    <p>WORKSPACE</p>
    <nav aria-label="Social Media Manager">
      <button data-view="Overview" aria-current="page"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg><span>Overview</span></button>
      <button data-view="Content Library"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 5 3-5 3z"/></svg><span>Content Library</span></button>
      <button data-view="Publishing Calendar"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4m8-4v4"/></svg><span>Publishing Calendar</span></button>
      <button data-view="Publishing History"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 1 2 5.6M3 5v7h7m2-5v5l3 2"/></svg><span>Publishing History</span></button>
      <button data-view="Connected Accounts"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 13 4-4m-6 6-1 1a3.5 3.5 0 0 1-5-5l4-4a3.5 3.5 0 0 1 5 0m2 10a3.5 3.5 0 0 0 5 0l4-4a3.5 3.5 0 0 0-5-5l-1 1"/></svg><span>Connected Accounts</span></button>
    </nav>
    <div class="sidebar-foot"><span class="mode-dot"></span><span>Local workspace<small>Malaysia time · UTC+8</small></span></div>
  </aside>
  <main>
    <header class="top"><div><p>SOCIAL MEDIA MANAGER</p><h1 id="title">Overview</h1></div><span class="badge preview-badge"><span class="mode-dot"></span> Local preview</span></header>
    <div class="banner"><strong>Review mode</strong><span>Videos and schedules stay in this browser. Nothing is published.</span></div>
    <p id="notice" role="status" aria-live="polite" hidden></p>
    <div id="view"></div>
  </main>
  <dialog id="editor"></dialog>
  <dialog id="importer"></dialog>
  <script type="module" src="/social-media-manager/app.mjs"></script>
</body></html>
`;
