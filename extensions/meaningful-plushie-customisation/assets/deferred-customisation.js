(() => {
  const blocks = document.querySelectorAll("[data-customisation-block]");
  blocks.forEach((block) => {
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
    const syncDelivery = () => {
      const useWhatsApp = method.value === "whatsapp";
      emailField.hidden = useWhatsApp;
      phoneField.hidden = !useWhatsApp;
    };
    const sync = () => {
      later.hidden = !isLater();
      syncDelivery();
    };
    radios.forEach((radio) => radio.addEventListener("change", sync));
    method.addEventListener("change", syncDelivery);
    sync();

    form.addEventListener("submit", async (event) => {
      if (!isLater()) return;
      event.preventDefault();
      if (!apiUrl) { notice.textContent = "Customisation is not configured yet. Please contact us."; return; }
      const deliveryMethod = method.value === "whatsapp" ? "whatsapp" : "email";
      const contactEmail = email.value.trim();
      const contactPhone = phone.value.trim();
      const submitter = event.submitter;
      if (submitter) submitter.disabled = true;
      notice.textContent = "Preparing your secure customisation link…";
      try {
        const response = await fetch(`${apiUrl}/api/customisation/sessions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deliveryMethod, contactEmail, contactPhone }),
        });
        const result = await response.json();
        if (!response.ok || !result.ok || !result.sessionId) throw new Error(result.error || "Could not prepare your customisation link.");
        let input = form.querySelector("input[name='properties[customisation_session_id]']");
        if (!input) {
          input = document.createElement("input");
          input.type = "hidden";
          input.name = "properties[customisation_session_id]";
          form.appendChild(input);
        }
        input.value = result.sessionId;
        notice.textContent = "Your link will be paired with this order after checkout.";
        form.submit();
      } catch (error) {
        notice.textContent = error instanceof Error ? error.message : "Could not prepare your customisation link.";
        if (submitter) submitter.disabled = false;
      }
    });
  });
})();
