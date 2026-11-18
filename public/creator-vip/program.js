const malay = document.documentElement.lang === "ms";
const localized = (english, bahasaMelayu) => malay ? bahasaMelayu : english;

const creatorApplication = document.querySelector("#creator-application");
const inviteForm = document.querySelector("#creator-invite-form");
const creatorForm = document.querySelector("#creator-signup-form");
const creatorPhone = creatorForm.elements.phone;
const creatorVideo = creatorApplication.querySelector("video");
const creatorConfirmation = creatorApplication.querySelector(".creator-application__confirmation");
const claimCode = document.querySelector("#creator-discount-code");
const claimLink = document.querySelector("#creator-claim-customise");
const customiserProducts = {
  billy: { 5: "build-your-meaningful-plushie-wa-b-5s", 10: "build-your-meaningful-plushie-wa-b-10s", 20: "build-your-meaningful-plushie-wa-b-20s" },
  hunnie: { 5: "build-your-meaningful-plushie-wa-h-5s", 10: "build-your-meaningful-plushie-wa-h-10s", 20: "hunnie-wa-order" },
  tootsie: { 5: "build-your-meaningful-plushie-wa-t-5s", 10: "build-your-meaningful-plushie-wa-t-10s", 20: "tootsie-wa-order" },
  dragon: { 5: "build-your-meaningful-plushie-wa-d-5s", 10: "build-your-meaningful-plushie-wa-d-10s", 20: "dragon-warrior-wa-order" },
};
let signupSession;
let verifiedInvite = "";
let nativeClaimToken;
let lockedProduct = "";
let openingCheckout = false;

const claimMessage = document.createElement("p");
claimMessage.setAttribute("role", "alert");
claimMessage.hidden = true;
claimLink.before(claimMessage);

function selectedProduct() {
  const character = creatorConfirmation.querySelector('[name="claim-character"]:checked')?.value;
  const length = creatorConfirmation.querySelector('[name="claim-length"]:checked')?.value;
  return customiserProducts[character]?.[length];
}

function updateClaimLink() {
  const product = selectedProduct();
  if (openingCheckout || !product || !claimCode.textContent || (lockedProduct && product !== lockedProduct)) {
    claimLink.removeAttribute("href");
    claimLink.setAttribute("aria-disabled", "true");
    return;
  }
  const path = `${malay ? "/ms" : ""}/products/${product}`;
  const url = new URL(nativeClaimToken ? path : `/discount/${encodeURIComponent(claimCode.textContent)}`, location.origin);
  if (!nativeClaimToken) url.searchParams.set("redirect", path);
  claimLink.href = url;
  claimLink.removeAttribute("aria-disabled");
}

creatorConfirmation.addEventListener("change", updateClaimLink);

function lockProduct(product) {
  lockedProduct = product;
  for (const [character, lengths] of Object.entries(customiserProducts)) {
    for (const [length, handle] of Object.entries(lengths)) {
      if (handle !== product) continue;
      creatorConfirmation.querySelector(`[name="claim-character"][value="${character}"]`).checked = true;
      creatorConfirmation.querySelector(`[name="claim-length"][value="${length}"]`).checked = true;
    }
  }
  creatorConfirmation.querySelectorAll('input[type="radio"]').forEach(input => { input.disabled = true; });
}

claimLink.addEventListener("click", async event => {
  if (!nativeClaimToken) return;
  event.preventDefault();
  const product = selectedProduct();
  if (openingCheckout || !product || (lockedProduct && product !== lockedProduct)) return;
  const destination = claimLink.href;
  openingCheckout = true;
  claimMessage.textContent = localized("Preparing your free plushie and shipping…", "Sedang menyediakan plushie dan penghantaran percuma…");
  claimMessage.hidden = false;
  updateClaimLink();
  try {
    const response = await fetch(new URL("?action=claim", location.href), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invite: verifiedInvite, claimToken: nativeClaimToken, product }),
    });
    const result = await response.json().catch(() => null);
    if (result?.error === "product_already_selected") throw new Error(localized("A plushie has already been selected. Reopen your invitation to continue with it.", "Plushie telah dipilih. Buka semula jemputan anda untuk meneruskan."));
    if (!response.ok || !result?.discount || !result.shippingDiscount) {
      throw new Error(localized("Your discounts could not be prepared. Select the same plushie and try again.", "Diskaun anda belum dapat disediakan. Pilih plushie yang sama dan cuba lagi."));
    }
    lockProduct(product);
    const cart = await fetch(`${malay ? "/ms" : ""}/cart/update.js`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ discount: `${result.discount},${result.shippingDiscount}` }),
    });
    if (!cart.ok) throw new Error(localized("Could not apply your discounts. Please try again.", "Diskaun anda tidak dapat digunakan. Sila cuba lagi."));
    if (creatorApplication.open) location.assign(destination);
  } catch (error) {
    claimMessage.textContent = error instanceof Error && error.message
      ? error.message : localized("Could not open customisation. Please try again.", "Penyesuaian tidak dapat dibuka. Sila cuba lagi.");
  } finally {
    openingCheckout = false;
    updateClaimLink();
  }
});

const signupErrors = {
  invalid_invite: localized("That invitation code is invalid. Check the code we sent you.", "Kod jemputan tidak sah. Semak kod yang kami hantar."),
  used_invite: localized("That invitation code has already been used.", "Kod jemputan itu sudah digunakan."),
  duplicate_creator: localized("That TikTok username or phone number is already registered.", "Nama pengguna TikTok atau nombor telefon itu telah didaftarkan."),
  invalid_details: localized("Check your details and tick the marketing consent box.", "Semak maklumat anda dan tandakan kotak kebenaran pemasaran."),
  unavailable: localized("Could not complete this step. Please try again.", "Langkah ini tidak dapat diselesaikan. Sila cuba lagi."),
};

function showSignupError(form, message) {
  const feedback = form.querySelector('[role="alert"]');
  feedback.textContent = message;
  feedback.hidden = !message;
}

async function submitSignupStep(form, path, data) {
  const { signal } = signupSession;
  const button = form.querySelector('button[type="submit"]');
  showSignupError(form, "");
  button.disabled = true;
  try {
    const response = await fetch(new URL(path, location.href), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data), signal });
    const result = await response.json();
    if (signal.aborted) return false;
    if (response.ok) return result;
    showSignupError(form, signupErrors[result.error] || signupErrors.unavailable);
  } catch {
    if (!signal.aborted) showSignupError(form, signupErrors.unavailable);
  } finally {
    if (!signal.aborted) button.disabled = false;
  }
  return false;
}

document.querySelector("#creator-customise").addEventListener("click", () => {
  if (!creatorConfirmation.hidden) {
    creatorApplication.showModal();
    creatorApplication.scrollTop = 0;
    document.querySelector("#creator-discount-heading").focus();
    return;
  }

  signupSession?.abort();
  signupSession = new AbortController();
  verifiedInvite = "";
  for (const form of [inviteForm, creatorForm]) {
    form.reset();
    form.querySelector('button[type="submit"]').disabled = false;
    showSignupError(form, "");
  }
  creatorPhone.setCustomValidity("");
  creatorForm.elements.tiktok.value = "";
  inviteForm.hidden = false;
  creatorForm.hidden = true;
  creatorApplication.showModal();
  creatorApplication.scrollTop = 0;
});

creatorApplication.querySelectorAll("[data-close-creator-application]").forEach(button => {
  button.addEventListener("click", () => creatorApplication.close());
});
creatorApplication.addEventListener("close", () => {
  if (!creatorApplication.open) {
    signupSession?.abort();
    creatorVideo.pause();
  }
});
creatorPhone.addEventListener("input", () => creatorPhone.setCustomValidity(""));

inviteForm.addEventListener("submit", async event => {
  event.preventDefault();
  const invite = inviteForm.elements.invite.value;
  const result = await submitSignupStep(inviteForm, "?action=check", { invite });
  if (!result) return;
  verifiedInvite = invite;
  creatorForm.elements.tiktok.value = result.username;
  inviteForm.hidden = true;
  creatorForm.hidden = false;
  creatorForm.elements.name.focus();
});

creatorForm.addEventListener("submit", async event => {
  event.preventDefault();
  const phone = creatorPhone.value.trim();
  const digits = phone.replace(/\D/g, "").length;
  if (!/^\+?[\d\s().-]+$/.test(phone) || digits < 7 || digits > 15) {
    creatorPhone.setCustomValidity(localized("Enter a phone number with 7 to 15 digits.", "Masukkan nombor telefon dengan 7 hingga 15 digit."));
    creatorPhone.reportValidity();
    return;
  }

  const result = await submitSignupStep(creatorForm, "?action=register", {
    invite: verifiedInvite,
    name: creatorForm.elements.name.value,
    phone,
    consent: creatorForm.elements.marketing_consent.checked,
  });
  if (!result) return;
  creatorVideo.pause();
  creatorForm.reset();
  creatorForm.hidden = true;
  claimCode.textContent = result.discount;
  nativeClaimToken = result.claimToken;
  if (nativeClaimToken) {
    document.querySelector("#creator-discount-heading").textContent = localized("Your 100% off code is reserved", "Kod diskaun 100% anda telah ditempah");
    document.querySelector(".creator-claim p").textContent = localized("Choose your plushie and voice length to apply your free plushie and shipping discounts.", "Pilih plushie dan tempoh suara untuk menggunakan diskaun plushie dan penghantaran percuma.");
    if (result.selectedProduct) lockProduct(result.selectedProduct);
    updateClaimLink();
  }
  creatorConfirmation.hidden = false;
  creatorApplication.scrollTop = 0;
  document.querySelector("#creator-discount-heading").focus();
});
