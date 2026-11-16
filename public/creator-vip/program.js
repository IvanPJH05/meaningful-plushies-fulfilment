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

function updateClaimLink() {
  const character = creatorConfirmation.querySelector('[name="claim-character"]:checked')?.value;
  const length = creatorConfirmation.querySelector('[name="claim-length"]:checked')?.value;
  const product = customiserProducts[character]?.[length];
  if (!product || !claimCode.textContent) {
    claimLink.removeAttribute("href");
    claimLink.setAttribute("aria-disabled", "true");
    return;
  }
  const url = new URL(`/discount/${encodeURIComponent(claimCode.textContent)}`, "https://meaningfulplushies.com");
  url.searchParams.set("redirect", `${malay ? "/ms" : ""}/products/${product}`);
  claimLink.href = url;
  claimLink.removeAttribute("aria-disabled");
}

creatorConfirmation.addEventListener("change", updateClaimLink);

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
  creatorConfirmation.hidden = false;
  creatorApplication.scrollTop = 0;
  document.querySelector("#creator-discount-heading").focus();
});
