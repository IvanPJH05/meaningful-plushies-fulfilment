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
let lookup;
const words = (english, malay) => language === "ms" ? malay : english;
const channel = () => document.querySelector('input[name="channel"]:checked').value;

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
}

function configure() {
  const tiktok = channel() === "tiktok";
  input.maxLength = tiktok ? 30 : 11;
  input.inputMode = "numeric";
  input.setAttribute("aria-label", tiktok ? words("TikTok Shop order ID", "ID Pesanan TikTok Shop") : words("Shopify order number", "Nombor pesanan Shopify"));
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  lookup?.abort();
  stage = "";
  render();
  const number = input.value.trim().replace(/^#/, "");
  const source = channel();
  if (!(source === "tiktok" ? /^\d{8,30}$/ : /^\d{1,10}$/).test(number)) {
    error.textContent = words("Enter the order number from your confirmation.", "Masukkan nombor pesanan daripada pengesahan anda.");
    error.hidden = false;
    return;
  }
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
    if (response.status === 404) {
      error.textContent = words("No tracking found. Check your order number and try again.", "Penjejakan tidak ditemui. Semak nombor pesanan anda dan cuba lagi.");
      error.hidden = false;
      render();
      return;
    }
    if (!response.ok) throw new Error("Lookup failed");
    const data = await response.json();
    if (controller.signal.aborted) return;
    reference = number;
    stage = data.stage;
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
    : words("Use the Shopify order number from your email or WhatsApp confirmation.", "Gunakan nombor pesanan Shopify dalam e-mel atau mesej WhatsApp anda.");
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
document.querySelectorAll("[data-language]").forEach(button => button.addEventListener("click", () => {
  language = button.dataset.language;
  document.documentElement.lang = language;
  document.querySelectorAll("[data-language]").forEach(choice => choice.setAttribute("aria-pressed", String(choice === button)));
  for (const [selector, en, ms] of translated) document.querySelector(selector).textContent = words(en, ms);
  error.hidden = true;
  configure();
  if (stage) render();
}));
configure();
