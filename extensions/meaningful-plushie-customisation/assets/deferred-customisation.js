(() => {
  document.querySelectorAll("[data-customisation-block]").forEach((block) => {
    const now = block.querySelector("[data-complete-now]");
    const later = block.querySelector(".mp-deferred-customisation__later");
    const method = block.querySelector("[data-delivery-method]");
    const emailField = block.querySelector("[data-email-field]");
    const phoneField = block.querySelector("[data-phone-field]");
    const email = block.querySelector("[data-contact-email]");
    const phone = block.querySelector("[data-contact-phone]");
    const notice = block.querySelector("[data-notice]");
    const radios = block.querySelectorAll("input[type=radio]");
    const apiUrl = (block.dataset.apiUrl || "").replace(/\/$/, "");
    const form = block.closest("form[action*='/cart/add']") || document.querySelector("form[action*='/cart/add']");
    if (!form) return;

    const isLater = () => [...radios].some((radio) => radio.checked && radio.value === "later");
    const setRequired = (container, required) => container.querySelectorAll("input, select, textarea").forEach((input) => { input.required = required; });
    const syncDelivery = () => {
      const useWhatsApp = method.value === "whatsapp";
      emailField.hidden = useWhatsApp;
      phoneField.hidden = !useWhatsApp;
    };
    const sync = () => {
      later.hidden = !isLater();
      now.hidden = isLater();
      setRequired(later, isLater());
      setRequired(now, !isLater());
      syncDelivery();
      notice.textContent = "";
    };
    radios.forEach((radio) => radio.addEventListener("change", sync));
    method.addEventListener("change", syncDelivery);
    sync();

    const appendSessionId = (id) => {
      let input = form.querySelector("input[name='properties[customisation_session_id]']");
      if (!input) {
        input = document.createElement("input");
        input.type = "hidden";
        input.name = "properties[customisation_session_id]";
        form.appendChild(input);
      }
      input.value = id;
    };
    const request = async (path, options) => {
      const response = await fetch(`${apiUrl}${path}`, options);
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Could not save your customisation.");
      return result;
    };
    const formData = () => ({
      plushName: block.querySelector("[data-plush-name]").value.trim(),
      gender: block.querySelector("[data-gender]").value,
      birthDate: block.querySelector("[data-birth-date]").value.trim(),
      birthPlace: block.querySelector("[data-birth-place]").value.trim(),
      favouritePerson: block.querySelector("[data-favourite-person]").value.trim(),
      belongsTo: block.querySelector("[data-belongs-to]").value.trim(),
      meaningfulNote: block.querySelector("[data-meaningful-note]").value.trim(),
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!apiUrl) { notice.textContent = "Customisation is not configured yet. Please contact us."; return; }
      if (!form.reportValidity()) return;
      const submitter = event.submitter;
      if (submitter) submitter.disabled = true;
      try {
        if (isLater()) {
          notice.textContent = "Preparing your secure customisation link…";
          const result = await request("/api/customisation/sessions", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ deliveryMethod: method.value === "whatsapp" ? "whatsapp" : "email", contactEmail: email.value.trim(), contactPhone: phone.value.trim() }),
          });
          appendSessionId(result.sessionId);
          notice.textContent = "Your link will be paired with this order after checkout.";
        } else {
          const voice = block.querySelector("[data-voice]").files[0];
          if (!voice) throw new Error("Please upload your voice recording.");
          notice.textContent = "Saving your customisation…";
          const session = await request("/api/customisation/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "complete_now" }) });
          const upload = new FormData(); upload.append("voice", voice);
          const voiceResult = await request(`/api/customisation/${encodeURIComponent(session.token)}/upload-file`, { method: "POST", body: upload });
          await request(`/api/customisation/${encodeURIComponent(session.token)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ form: formData(), voiceStoragePath: voiceResult.voiceStoragePath }) });
          appendSessionId(session.sessionId);
          notice.textContent = "Your customisation is saved and will be linked to this order.";
        }
        form.submit();
      } catch (error) {
        notice.textContent = error instanceof Error ? error.message : "Could not save your customisation.";
        if (submitter) submitter.disabled = false;
      }
    });
  });
})();
