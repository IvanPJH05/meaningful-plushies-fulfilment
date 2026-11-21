const form = document.querySelector("#lookup");
const input = document.querySelector("#order");
const result = document.querySelector("#result");
const error = document.querySelector("#lookup-error");
const help = document.querySelector("#order-help-dialog");
const milestones = [
  ["preparing", "Preparing", "Penyediaan", "Your meaningful journey starts here.", "Pesanan anda sedang disediakan."],
  ["sewing", "Sewing", "Jahitan", "A little love in every stitch.", "Plushie anda sedang dijahit."],
  ["qc", "Quality check", "Semakan kualiti", "Quality check passed", "Lulus pemeriksaan kualiti"],
  ["packed", "Packed", "Dibungkus", "Packed and ready for pickup", "Dibungkus dan sedia untuk diambil"],
  ["shipped", "Shipped", "Dihantar", "Your plushie is on its way!", "Plushie anda dalam perjalanan!"],
];
let language = "en";
let stage = "";
let reference = "";
let shipments = [];
let packingVideo = null;
let lookup;
const words = (english, malay) => language === "ms" ? malay : english;
const channel = () => document.querySelector('input[name="channel"]:checked').value;
const customisationCode = value => /^(?:MP-)?[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);

function render() {
  result.replaceChildren();
  if (!stage) return;
  const index = milestones.findIndex(([key]) => key === stage);
  const title = milestones[index];
  const card = document.createElement("section");
  card.className = "card";
  card.innerHTML = `<div class="status"><div class="status-copy"><small></small><h3></h3></div></div><div class="milestones with-shipped" aria-label="Order progress"></div>`;
  card.querySelector("small").textContent = words("Your order", "Pesanan anda") + " #" + reference;
  card.querySelector("h3").textContent = title ? words(title[3], title[4]) : words("Please contact our team for an update.", "Sila hubungi pasukan kami untuk maklumat terkini.");
  shipments.forEach(shipment => {
    const delivery = document.createElement('div');
    delivery.className = 'jnt-handoff';
    const details = document.createElement('span');
    const courier = shipment.courier || words('Courier', 'Kurier');
    details.append(`${courier} · ${words('Tracking number', 'Nombor penjejakan')}`);
    const number = document.createElement('strong');
    number.textContent = shipment.trackingNumber;
    details.append(number);
    delivery.append(details);
    // Build links only for the recognised courier, never an arbitrary API URL.
    if (shipment.courier === 'J&T Express' && /^[A-Za-z0-9-]{6,40}$/.test(shipment.trackingNumber)) {
      const link = document.createElement('a');
      link.href = `https://www.jtexpress.my/tracking/${encodeURIComponent(shipment.trackingNumber)}`;
      link.target = '_blank'; link.rel = 'noopener noreferrer';
      link.textContent = words('Track with J&T ↗', 'Jejak dengan J&T ↗');
      delivery.append(link);
    }
    card.querySelector('.status-copy').append(delivery);
  });
  if (title) milestones.forEach(([, en, ms], position) => {
    const step = document.createElement("div");
    step.className = "milestone" + (position < index ? " done" : position === index ? " current" : "");
    if (position === index) step.setAttribute("aria-current", "step");
    const circle = document.createElement("span");
    circle.className = "circle";
    circle.textContent = position < index ? "✓" : String(position + 1);
    step.append(circle, words(en, ms));
    card.querySelector(".milestones").append(step);
  });
  result.append(card);
  renderPackingVideo();
}

function renderPackingVideo() {
  if (!packingVideo || (!packingVideo.verificationRequired && !packingVideo.videos?.length)) return;
  const panel = document.createElement('section');
  panel.className = 'packing-video';
  const heading = document.createElement('h3');
  heading.textContent = words('Your packing video', 'Video pembungkusan anda');
  panel.append(heading);
  if (!packingVideo.verificationRequired) {
    for (const clip of packingVideo.videos) {
      const url = new URL(clip.url, location.href);
      if (url.protocol !== 'https:' && url.origin !== location.origin) continue;
      const video = document.createElement('video');
      video.controls = true; video.playsInline = true; video.preload = 'metadata';
      video.setAttribute('aria-label', heading.textContent);
      video.src = url.href;
      panel.append(video);
    }
    result.append(panel);
    return;
  }
  const verify = document.createElement('form');
  const label = document.createElement('label');
  label.textContent = words('Last 4 digits of the phone number used for this order', '4 digit terakhir nombor telefon yang digunakan untuk pesanan ini');
  const phone = document.createElement('input');
  phone.type = 'text'; phone.inputMode = 'numeric'; phone.pattern = '[0-9]{4}';
  phone.maxLength = 4; phone.required = true; phone.autocomplete = 'off';
  label.append(phone);
  const button = document.createElement('button');
  button.type = 'submit'; button.textContent = words('Watch video', 'Tonton video');
  const note = document.createElement('p');
  note.setAttribute('role', 'alert');
  const failure = value => value === 'rate_limited'
    ? words('Too many attempts. Please try again in 15 minutes.', 'Terlalu banyak percubaan. Sila cuba lagi dalam 15 minit.')
    : words('The phone digits do not match this order. Please check and try again.', 'Digit telefon tidak sepadan dengan pesanan ini. Sila semak dan cuba lagi.');
  if (packingVideo.error) note.textContent = failure(packingVideo.error);
  verify.append(label, button, note); panel.append(verify); result.append(panel);
  verify.addEventListener('submit', async event => {
    event.preventDefault();
    if (!/^\d{4}$/.test(phone.value)) return;
    lookup?.abort();
    const controller = new AbortController();
    lookup = controller;
    const number = reference, source = channel();
    button.disabled = true;
    note.textContent = words('Checking…', 'Menyemak…');
    try {
      const response = await fetch("/api/customer-order-progress", {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ number, channel: source, phoneLast4: phone.value }), signal: controller.signal,
      });
      if (!response.ok) throw new Error('Video unavailable');
      const data = await response.json();
      if (controller.signal.aborted || reference !== number || channel() !== source) return;
      if (!data.packingVideo) throw new Error('Video unavailable');
      packingVideo = data.packingVideo;
      render();
    } catch {
      if (!controller.signal.aborted) note.textContent = words('The video is temporarily unavailable. Please try again.', 'Video tidak tersedia buat sementara waktu. Sila cuba lagi.');
    } finally {
      button.disabled = false;
    }
  });
}

function updateShareLink(number, source) {
  const shareUrl = new URL(location.href);
  const trackingPath = shareUrl.pathname.match(/^(\/(?:[a-z]{2}(?:-[a-zA-Z]{2})?\/)?pages\/track-your-order)(?:\/\d+)?\/?$/);
  if (trackingPath && (source === 'tiktok' || number.length === 4)) {
    shareUrl.pathname = `${trackingPath[1]}/${number}`;
    shareUrl.searchParams.delete('order');
    shareUrl.searchParams.delete('channel');
  } else {
    if (trackingPath) shareUrl.pathname = trackingPath[1];
    shareUrl.searchParams.set('order', number);
    if (source === 'tiktok') shareUrl.searchParams.set('channel', 'tiktok');
    else shareUrl.searchParams.delete('channel');
  }
  history.replaceState(null, '', shareUrl);
}

function configure() {
  const tiktok = channel() === "tiktok";
  input.maxLength = tiktok ? 30 : 39;
  input.inputMode = tiktok ? 'numeric' : 'text';
  const label = tiktok ? words('TikTok Shop order ID', 'ID Pesanan TikTok Shop') : words('Order number or customisation code', 'Nombor pesanan atau kod kustomisasi');
  input.setAttribute('aria-label', label);
  input.placeholder = label;
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  lookup?.abort();
  stage = "";
  shipments = [];
  packingVideo = null;
  render();
  const number = input.value.trim().replace(/^#/, "");
  const source = channel();
  const isCode = source === 'website' && customisationCode(number);
  if (!isCode && !(source === "tiktok" ? /^\d{8,30}$/ : /^\d{1,10}$/).test(number)) {
    error.textContent = words("Enter your order number or full customisation code.", "Masukkan nombor pesanan atau kod kustomisasi penuh anda.");
    error.hidden = false;
    return;
  }
  if (!isCode) updateShareLink(number, source);
  error.hidden = true;
  result.textContent = words("Checking your order…", "Menyemak pesanan anda…");
  const controller = new AbortController();
  lookup = controller;
  try {
    const response = await fetch("/api/customer-order-progress", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ number, channel: source }), signal: controller.signal,
    });
    if (controller.signal.aborted) return;
    if (response.status === 409) {
      error.textContent = words('Your customisation is saved. Tracking will be available once your order is confirmed.', 'Kustomisasi anda telah disimpan. Penjejakan akan tersedia setelah pesanan anda disahkan.');
      error.hidden = false;
      render();
      return;
    }
    if (response.status === 404) {
      error.textContent = words("No tracking found. Check your order number or customisation code and try again.", "Penjejakan tidak ditemui. Semak nombor pesanan atau kod kustomisasi anda dan cuba lagi.");
      error.hidden = false;
      render();
      return;
    }
    if (!response.ok) throw new Error("Lookup failed");
    const data = await response.json();
    if (controller.signal.aborted) return;
    const resolved = typeof data.orderNumber === 'string' && (source === 'tiktok' ? /^\d{8,30}$/ : /^\d{1,10}$/).test(data.orderNumber) ? data.orderNumber : number;
    if (isCode && resolved === number) throw new Error('Order not linked');
    reference = resolved;
    input.value = resolved;
    updateShareLink(resolved, source);
    stage = data.stage;
    shipments = Array.isArray(data.shipments) ? data.shipments : [];
    packingVideo = data.packingVideo || null;
    render();
  } catch {
    if (controller.signal.aborted) return;
    render();
    error.textContent = words("Tracking is temporarily unavailable. Please try again.", "Penjejakan tidak tersedia buat sementara waktu. Sila cuba lagi.");
    error.hidden = false;
  }
});

document.querySelectorAll('input[name="channel"]').forEach(radio => radio.addEventListener("change", () => {
  lookup?.abort();
  input.value = "";
  shipments = [];
  packingVideo = null;
  error.hidden = true;
  stage = "";
  render();
  configure();
  input.focus();
}));
document.querySelector("#order-help").addEventListener("click", () => {
  const tiktok = channel() === "tiktok";
  document.querySelector("#help-channel").textContent = tiktok ? "TikTok Shop" : words("Website / WhatsApp", "Laman web / WhatsApp");
  document.querySelector("#help-note").textContent = tiktok
    ? words("Open the order in TikTok Shop and copy the full numeric Order ID.", "Buka pesanan dalam TikTok Shop dan salin ID pesanan penuh.")
    : words("Use your Shopify order number or full MP- customisation code from your email or WhatsApp confirmation.", "Gunakan nombor pesanan Shopify atau kod kustomisasi MP- penuh daripada e-mel atau pengesahan WhatsApp anda.");
  help.showModal();
});
document.querySelector("#close-help").addEventListener("click", () => help.close());

const translated = [
  [".channel-picker legend", "Where did you place your order?", "Di manakah anda membuat pesanan?"],
  [".channel-picker label span", "Website / WhatsApp", "Laman web / WhatsApp"],
  ["#order-help", "How to find your order number", "Cara mencari nombor pesanan anda"],
  ["#help-title", "How to find your order number", "Cara mencari nombor pesanan anda"],
  ["#help h2", "A little help with your order?", "Perlukan bantuan dengan pesanan anda?"],
  ["#help p", "Have your order number ready and our team will help you out.", "Sediakan nombor pesanan anda dan pasukan kami akan membantu anda."],
  ["#help a", "Contact our team ↗", "Hubungi kami ↗"],
  [".search button", "Track my order →", "Jejak pesanan →"],
];
function setLanguage(value) {
  language = value === "ms" ? "ms" : "en";
  document.documentElement.lang = language;
  document.querySelectorAll("[data-language]").forEach(choice => choice.setAttribute("aria-pressed", String(choice.dataset.language === language)));
  for (const [selector, en, ms] of translated) document.querySelector(selector).textContent = words(en, ms);
  error.hidden = true;
  configure();
  if (stage) render();
}
document.querySelectorAll("[data-language]").forEach(button => button.addEventListener("click", () => setLanguage(button.dataset.language)));
const options = new URLSearchParams(location.search);
document.body.classList.toggle("embedded", options.get("embedded") === "1");
setLanguage(options.get("lang"));

// Shared links use the same validation and lookup flow as a manual search.
const sharedLink = new URLSearchParams(location.search);
const pathOrder = location.pathname.match(/^\/(?:[a-z]{2}(?:-[a-zA-Z]{2})?\/)?pages\/track-your-order\/(\d{4,30})\/?$/)?.[1];
const initialOrder = pathOrder || (sharedLink.get('order') || '').trim().replace(/^#/, '');
const initialChannel = pathOrder
  ? (pathOrder.length === 4 ? 'website' : 'tiktok')
  : customisationCode(initialOrder) ? 'website' : sharedLink.get('channel') === 'tiktok' || initialOrder.length > 4 ? 'tiktok' : 'website';
if (pathOrder || customisationCode(initialOrder) || (initialChannel === 'tiktok' ? /^\d{8,30}$/ : /^\d{1,10}$/).test(initialOrder)) {
  document.querySelector(`input[name="channel"][value="${initialChannel}"]`).checked = true;
  input.value = initialOrder;
  configure();
  form.requestSubmit();
}
